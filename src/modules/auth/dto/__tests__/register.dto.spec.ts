import { plainToInstance as plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from '../register.dto';

describe('RegisterDto validation', () => {
  describe('valid registration data', () => {
    it('should pass validation for valid payload', async () => {
      const payload = {
        email: 'test@example.com',
        password: 'S3cureP@ssw0rd',
        name: 'Test User',
        country: 'US',
        phone: '+15551234567',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('email field', () => {
    it('should reject invalid email formats', async () => {
      const payload = {
        email: 'not-an-email',
        password: 'S3cureP@ssw0rd',
        name: 'Name',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });

  describe('password field', () => {
    it('should reject weak (too short) passwords', async () => {
      const payload = {
        email: 'a@b.com',
        password: '123',
        name: 'Name',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should reject passwords that lack required character types', async () => {
      const payload = {
        email: 'a@b.com',
        // length >=8 but missing uppercase and special char
        password: 'password1',
        name: 'Name',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });
  });

  describe('required fields', () => {
    it('should reject when required fields are missing', async () => {
      const payload = {
        email: 'test@example.com',
        // missing password, name, country
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      const props = errors.map((e) => e.property);
      expect(props).toEqual(
        expect.arrayContaining(['password', 'name', 'country']),
      );
    });
  });

  describe('phone field', () => {
    it('should reject invalid phone formats', async () => {
      const payload = {
        email: 'a@b.com',
        password: 'S3cureP@ssw0rd',
        name: 'Name',
        country: 'US',
        phone: '123-abc',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });

    it('should allow phone to be undefined (optional)', async () => {
      const payload = {
        email: 'a@b.com',
        password: 'S3cureP@ssw0rd',
        name: 'Name',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'phone')).toBe(false);
    });
  });

  describe('error message texts', () => {
    it('should return custom message for invalid email', async () => {
      const payload = {
        email: 'not-an-email',
        password: 'S3cureP@ssw0rd',
        name: 'Name',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      const emailErr = errors.find((e) => e.property === 'email');
      expect(emailErr).toBeDefined();
      const msgs = Object.values(emailErr!.constraints || {});
      expect(msgs).toContain('Invalid email format');
    });

    it('should return password complexity message for weak but long password', async () => {
      const payload = {
        email: 'a@b.com',
        // long enough but missing uppercase & special
        password: 'abcdefgh1',
        name: 'Name',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      const passwordErr = errors.find((e) => e.property === 'password');
      expect(passwordErr).toBeDefined();
      const msgs = Object.values(passwordErr!.constraints || {});
      expect(msgs).toContain(
        'Password must be 8-32 characters and include uppercase, lowercase, number and special character',
      );
    });

    it('should return name required message when name missing', async () => {
      const payload = {
        email: 'a@b.com',
        password: 'S3cureP@ssw0rd',
        country: 'US',
      };

      const dto = plainToClass(RegisterDto, payload);
      const errors = await validate(dto);
      const nameErr = errors.find((e) => e.property === 'name');
      expect(nameErr).toBeDefined();
      const msgs = Object.values(nameErr!.constraints || {});
      expect(msgs).toContain('Name is required');
    });
  });
});
