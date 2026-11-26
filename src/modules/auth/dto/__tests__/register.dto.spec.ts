import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { RegisterDto } from '../register.dto';

const validPayload = () => ({
  email: 'test@example.com',
  password: 'S3cureP@ssw0rd',
  firstName: 'Test',
  lastName: 'User',
  country: 'US',
  phone: '+15551234567',
});

const check = async (payload: Record<string, unknown>): Promise<ValidationError[]> =>
  validate(plainToInstance(RegisterDto, payload));

const messagesFor = (errors: ValidationError[], property: string): string[] =>
  Object.values(errors.find((e) => e.property === property)?.constraints ?? {});

describe('RegisterDto validation', () => {
  describe('valid registration data', () => {
    it('accepts a complete, valid payload', async () => {
      expect(await check(validPayload())).toHaveLength(0);
    });

    it('accepts a payload without the optional phone and referral code', async () => {
      const { phone: _phone, ...rest } = validPayload();
      expect(await check(rest)).toHaveLength(0);
    });

    it('normalises the email and the country code before validating', async () => {
      const dto = plainToInstance(RegisterDto, {
        ...validPayload(),
        email: '  Test@Example.COM ',
        country: ' us ',
      });

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.email).toBe('test@example.com');
      expect(dto.country).toBe('US');
    });
  });

  describe('email field', () => {
    it('rejects an invalid email with an email-specific message', async () => {
      const errors = await check({ ...validPayload(), email: 'not-an-email' });

      expect(errors.map((e) => e.property)).toEqual(['email']);
      expect(messagesFor(errors, 'email')).toContain('Invalid email format');
    });

    it('rejects a missing email', async () => {
      const { email: _email, ...rest } = validPayload();
      const errors = await check(rest);

      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });
  });

  describe('password field', () => {
    it('rejects a password that is too short', async () => {
      const errors = await check({ ...validPayload(), password: '123' });

      expect(errors.map((e) => e.property)).toEqual(['password']);
      expect(messagesFor(errors, 'password')).toContain(
        'Password must be between 8 and 72 characters',
      );
    });

    it('rejects a long password that lacks the required character types', async () => {
      const errors = await check({ ...validPayload(), password: 'abcdefgh1' });

      expect(errors.map((e) => e.property)).toEqual(['password']);
      expect(messagesFor(errors, 'password')).toContain(
        'Password does not meet the security policy',
      );
    });

    it('rejects a password longer than the bcrypt limit', async () => {
      const errors = await check({ ...validPayload(), password: 'Aa1!'.repeat(20) });

      expect(messagesFor(errors, 'password')).toContain(
        'Password must be between 8 and 72 characters',
      );
    });

    it('reports a missing password as a validation error instead of throwing', async () => {
      const { password: _password, ...rest } = validPayload();

      await expect(check(rest)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ property: 'password' })]),
      );
    });

    it('reports a non-string password as a validation error instead of throwing', async () => {
      const errors = await check({ ...validPayload(), password: 12345678 });

      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });
  });

  describe('required fields', () => {
    it('names every missing required field', async () => {
      const errors = await check({ email: 'test@example.com' });

      expect(errors.map((e) => e.property)).toEqual(
        expect.arrayContaining(['password', 'firstName', 'lastName', 'country']),
      );
    });

    it('uses field-specific messages for a missing first or last name', async () => {
      const { firstName: _first, lastName: _last, ...rest } = validPayload();
      const errors = await check(rest);

      expect(messagesFor(errors, 'firstName')).toContain('First name is required');
      expect(messagesFor(errors, 'lastName')).toContain('Last name is required');
    });

    it('rejects an empty payload without throwing', async () => {
      const errors = await check({});

      expect(errors.map((e) => e.property)).toEqual(
        expect.arrayContaining(['email', 'password', 'firstName', 'lastName', 'country']),
      );
    });

    it('rejects a country that is not a two-letter code', async () => {
      const errors = await check({ ...validPayload(), country: 'Nigeria' });

      expect(errors.some((e) => e.property === 'country')).toBe(true);
    });
  });

  describe('phone field', () => {
    it('rejects an invalid phone number', async () => {
      const errors = await check({ ...validPayload(), phone: '123-abc' });

      expect(messagesFor(errors, 'phone')).toContain('Phone number must be in E.164 format');
    });
  });
});
