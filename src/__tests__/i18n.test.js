import request from 'supertest';
import express from 'express';
import i18nextMiddleware from 'i18next-http-middleware';
import i18next from '../config/i18n.js';
import { registerSchema } from '../validations/authValidation.js';
import ApiResponse from '../utils/apiResponse.js';

// Create a test app
const app = express();

// Initialize i18n middleware
app.use(i18nextMiddleware.handle(i18next));

// Add a test route that uses i18n
app.post('/api/auth/register', (req, res) => {
  const { error } = registerSchema.validate({});
  if (error) {
    return ApiResponse.error(res, 'errors.VALIDATION_ERROR', 400);
  }
});

describe('Internationalization Tests', () => {
  it('should return error messages in English by default', async () => {
    const res = await request(app).post('/api/auth/register').send({
      // Invalid data to trigger validation error
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation error occurred. Please check your input');
  });

  it('should return error messages in French when requested', async () => {
    const res = await request(app).post('/api/auth/register').set('Accept-Language', 'fr').send({
      // Invalid data to trigger validation error
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Erreur de validation. Veuillez vérifier vos données');
  });

  it('should return error messages in Swahili when requested', async () => {
    const res = await request(app).post('/api/auth/register').set('Accept-Language', 'sw').send({
      // Invalid data to trigger validation error
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Hitilafu ya uthibitishaji. Tafadhali angalia taarifa zako');
  });

  it('should support language selection via query parameter', async () => {
    const res = await request(app).post('/api/auth/register?lang=fr').send({
      // Invalid data to trigger validation error
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Erreur de validation. Veuillez vérifier vos données');
  });
});
