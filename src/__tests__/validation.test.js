import request from 'supertest';
import express from 'express';
import Joi from 'joi';
import { validate, customValidators } from '../middleware/validationMiddleware.js';
import { sanitizeInput } from '../utils/sanitizationUtils.js';
import { registerSchema, loginSchema } from '../validations/authValidators.js';
import { createRecordSchema } from '../validations/recordValidators.js';
import { createAppointmentSchema } from '../validations/appointmentValidators.js';

describe('Validation Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('validate middleware', () => {
    it('should pass validation for valid data', async () => {
      const testRoute = (req, res) => {
        res.json({ success: true, data: req.body });
      };

      app.post(
        '/test',
        validate({
          body: Joi.object({
            name: Joi.string().required(),
            email: customValidators.email.required(),
          }),
        }),
        testRoute
      );

      const response = await request(app).post('/test').send({
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 422 for invalid email', async () => {
      app.post(
        '/test',
        validate({
          body: Joi.object({
            email: customValidators.email.required(),
          }),
        }),
        (req, res) => res.json({ success: true })
      );

      const response = await request(app).post('/test').send({
        email: 'invalid-email',
      });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.errors.body).toBeDefined();
      expect(response.body.errors.body[0].field).toBe('email');
    });

    it('should validate request parameters', async () => {
      app.get(
        '/test/:id',
        validate({
          params: Joi.object({
            id: customValidators.objectId.required(),
          }),
        }),
        (req, res) => res.json({ success: true })
      );

      const response = await request(app).get('/test/invalid-id');

      expect(response.status).toBe(422);
      expect(response.body.errors.params).toBeDefined();
    });

    it('should validate query parameters', async () => {
      app.get(
        '/test',
        validate({
          query: Joi.object({
            page: customValidators.nonNegativeInt.optional(),
            limit: Joi.number().integer().min(1).max(100).optional(),
          }),
        }),
        (req, res) => res.json({ success: true })
      );

      const response = await request(app).get('/test?page=-1&limit=150');

      expect(response.status).toBe(422);
      expect(response.body.errors.query).toBeDefined();
    });

    it('should sanitize HTML from input', async () => {
      let receivedBody;
      app.post(
        '/test',
        validate({
          body: Joi.object({
            content: Joi.string().required(),
          }),
        }),
        (req, res) => {
          receivedBody = req.body;
          res.json({ success: true });
        }
      );

      const response = await request(app).post('/test').send({
        content: '<script>alert("xss")</script>Hello <b>World</b>',
      });

      expect(response.status).toBe(200);
      expect(receivedBody.content).toBe('Hello World');
    });
  });

  describe('Custom Validators', () => {
    describe('objectId', () => {
      it('should accept valid MongoDB ObjectId', () => {
        const validId = '507f1f77bcf86cd799439011';
        const { error } = customValidators.objectId.validate(validId);
        expect(error).toBeUndefined();
      });

      it('should reject invalid ObjectId', () => {
        const invalidId = 'invalid-id';
        const { error } = customValidators.objectId.validate(invalidId);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('Invalid ObjectId format');
      });
    });

    describe('email', () => {
      it('should accept valid email', () => {
        const validEmail = 'test@example.com';
        const { error } = customValidators.email.validate(validEmail);
        expect(error).toBeUndefined();
      });

      it('should reject invalid email', () => {
        const invalidEmail = 'not-an-email';
        const { error } = customValidators.email.validate(invalidEmail);
        expect(error).toBeDefined();
      });

      it('should normalize email to lowercase', () => {
        const email = 'TEST@EXAMPLE.COM';
        const { value } = customValidators.email.validate(email);
        expect(value).toBe('test@example.com');
      });
    });

    describe('password', () => {
      it('should accept valid password', () => {
        const validPassword = 'SecurePass123';
        const { error } = customValidators.password.validate(validPassword);
        expect(error).toBeUndefined();
      });

      it('should reject password without numbers', () => {
        const invalidPassword = 'SecurePassword';
        const { error } = customValidators.password.validate(invalidPassword);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('one letter and one number');
      });

      it('should reject short password', () => {
        const shortPassword = 'Pass1';
        const { error } = customValidators.password.validate(shortPassword);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('at least 8 characters');
      });
    });

    describe('phone', () => {
      it('should accept valid phone numbers', () => {
        const validPhones = ['+1234567890', '123-456-7890', '(123) 456-7890', '+1 234 567 8900'];

        validPhones.forEach(phone => {
          const { error } = customValidators.phone.validate(phone);
          expect(error).toBeUndefined();
        });
      });

      it('should reject invalid phone numbers', () => {
        const invalidPhones = ['abc-def-ghij', '123', '1234567890123456'];

        invalidPhones.forEach(phone => {
          const { error } = customValidators.phone.validate(phone);
          expect(error).toBeDefined();
        });
      });
    });
  });

  describe('Sanitization Utils', () => {
    it('should strip HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello <b>World</b>';
      const result = sanitizeInput(input, { stripHtml: true });
      expect(result).toBe('Hello World');
    });

    it('should prevent XSS attacks', () => {
      const input = 'javascript:alert("xss") <img src="x" onerror="alert(1)">';
      const result = sanitizeInput(input, { preventXSS: true });
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('onerror');
    });

    it('should normalize strings', () => {
      const input = '  Hello   World  \n\t';
      const result = sanitizeInput(input, { normalize: true });
      expect(result).toBe('Hello World');
    });

    it('should limit string length', () => {
      const input = 'a'.repeat(1000);
      const result = sanitizeInput(input, { maxLength: 100 });
      expect(result.length).toBe(100);
    });
  });

  describe('Auth Validation Schemas', () => {
    it('should validate registration data', async () => {
      app.post('/register', validate(registerSchema), (req, res) => res.json({ success: true }));

      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'SecurePass123',
      };

      const response = await request(app).post('/register').send(validData);

      expect(response.status).toBe(200);
    });

    it('should reject incomplete registration data', async () => {
      app.post('/register', validate(registerSchema), (req, res) => res.json({ success: true }));

      const invalidData = {
        firstName: 'John',
        // Missing lastName, email, password
      };

      const response = await request(app).post('/register').send(invalidData);

      expect(response.status).toBe(422);
      expect(response.body.errors.body).toBeDefined();
    });

    it('should validate login data', async () => {
      app.post('/login', validate(loginSchema), (req, res) => res.json({ success: true }));

      const validData = {
        email: 'john@example.com',
        password: 'password123',
      };

      const response = await request(app).post('/login').send(validData);

      expect(response.status).toBe(200);
    });
  });

  describe('Record Validation Schemas', () => {
    it('should validate record creation data', async () => {
      app.post('/records', validate(createRecordSchema), (req, res) => res.json({ success: true }));

      const validData = {
        patientId: '507f1f77bcf86cd799439011',
        type: 'consultation',
        title: 'Regular checkup',
        date: '2024-01-15T10:00:00Z',
        description: 'Annual physical examination',
      };

      const response = await request(app).post('/records').send(validData);

      expect(response.status).toBe(200);
    });

    it('should reject invalid record type', async () => {
      app.post('/records', validate(createRecordSchema), (req, res) => res.json({ success: true }));

      const invalidData = {
        patientId: '507f1f77bcf86cd799439011',
        type: 'invalid_type',
        title: 'Regular checkup',
        date: '2024-01-15T10:00:00Z',
      };

      const response = await request(app).post('/records').send(invalidData);

      expect(response.status).toBe(422);
      expect(response.body.errors.body[0].field).toBe('type');
    });
  });

  describe('Appointment Validation Schemas', () => {
    it('should validate appointment creation data', async () => {
      app.post('/appointments', validate(createAppointmentSchema), (req, res) =>
        res.json({ success: true })
      );

      const validData = {
        patientId: '507f1f77bcf86cd799439011',
        doctorId: '507f1f77bcf86cd799439012',
        date: '2024-01-15T10:00:00Z',
        time: '14:30',
        type: 'consultation',
        reason: 'Follow-up appointment',
        location: {
          type: 'clinic',
          address: '123 Medical Center Dr',
        },
      };

      const response = await request(app).post('/appointments').send(validData);

      expect(response.status).toBe(200);
    });

    it('should reject invalid time format', async () => {
      app.post('/appointments', validate(createAppointmentSchema), (req, res) =>
        res.json({ success: true })
      );

      const invalidData = {
        patientId: '507f1f77bcf86cd799439011',
        doctorId: '507f1f77bcf86cd799439012',
        date: '2024-01-15T10:00:00Z',
        time: '25:70', // Invalid time
        type: 'consultation',
        reason: 'Follow-up appointment',
        location: {
          type: 'clinic',
          address: '123 Medical Center Dr',
        },
      };

      const response = await request(app).post('/appointments').send(invalidData);

      expect(response.status).toBe(422);
      expect(response.body.errors.body[0].field).toBe('time');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty request body', async () => {
      app.post(
        '/test',
        validate({
          body: Joi.object({
            name: Joi.string().required(),
          }),
        }),
        (req, res) => res.json({ success: true })
      );

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(422);
    });

    it('should handle null and undefined values', async () => {
      app.post(
        '/test',
        validate({
          body: Joi.object({
            value: Joi.string().allow(null).optional(),
          }),
        }),
        (req, res) => res.json({ success: true })
      );

      const response = await request(app).post('/test').send({ value: null });

      expect(response.status).toBe(200);
    });

    it('should handle deeply nested objects', async () => {
      app.post(
        '/test',
        validate({
          body: Joi.object({
            user: Joi.object({
              profile: Joi.object({
                settings: Joi.object({
                  theme: Joi.string().valid('light', 'dark').optional(),
                }).optional(),
              }).optional(),
            }).optional(),
          }),
        }),
        (req, res) => res.json({ success: true })
      );

      const response = await request(app)
        .post('/test')
        .send({
          user: {
            profile: {
              settings: {
                theme: 'invalid_theme',
              },
            },
          },
        });

      expect(response.status).toBe(422);
    });
  });
});
