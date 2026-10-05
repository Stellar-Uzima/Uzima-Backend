import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';
import { BCRYPT_MAX_PASSWORD_BYTES } from './credential-normalizer';

describe('PasswordPolicyService (#1283, #1285)', () => {
  let policy: PasswordPolicyService;

  beforeEach(() => {
    policy = new PasswordPolicyService();
  });

  const strong = 'Str0ng!Passphrase';

  describe('acceptance', () => {
    it('accepts a password meeting every rule', () => {
      expect(policy.check(strong)).toMatchObject({ isValid: true, violations: [] });
    });

    it('scores a compliant password above the floor', () => {
      expect(policy.check(strong).score).toBeGreaterThan(0);
    });
  });

  describe('the 72-byte bcrypt ceiling', () => {
    it('rejects a password longer than bcrypt can hash, rather than truncating it', () => {
      const overLong = `${'A'.repeat(BCRYPT_MAX_PASSWORD_BYTES)}!abcdefgh`;

      const result = policy.check(overLong);

      expect(result.isValid).toBe(false);
      expect(result.violations.map((v) => v.message).join(' ')).toMatch(/72 bytes/);
    });

    it('explains why, since silent truncation is the whole danger', () => {
      const result = policy.check('A'.repeat(100));

      const violation = result.violations.find((v) => v.message.includes('bytes'));
      expect(violation?.message).toMatch(/currently 100/);
    });

    it('still rejects a 72-byte password that fails the structural rules', () => {
      const result = policy.check('a'.repeat(BCRYPT_MAX_PASSWORD_BYTES));

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('uppercase'))).toBe(true);
    });
  });

  describe('structural rules', () => {
    it.each([
      ['short', 'Ab1!xyz'],
      ['no uppercase', 'str0ng!passphrase'],
      ['no lowercase', 'STR0NG!PASSPHRASE'],
      ['no digit', 'Strong!Passphrase'],
      ['no special character', 'Str0ngPassphrase1'],
    ])('rejects a password that is %s', (_label, password) => {
      expect(policy.check(password).isValid).toBe(false);
    });

    it('rejects a password containing a common password', () => {
      expect(policy.check('Passw0rd!Secure').isValid).toBe(false);
    });
  });

  describe('missing input', () => {
    it.each([[undefined], [null], [''], [123], [{}]])('rejects %p', (value) => {
      const result = policy.check(value);

      expect(result.isValid).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });

  describe('assert', () => {
    it('throws a 400 with every violation keyed by field', () => {
      expect(() => policy.assert('weak')).toThrow(BadRequestException);

      try {
        policy.assert('weak');
      } catch (error) {
        const body = (error as BadRequestException).getResponse() as {
          code: string;
          errors: Record<string, string[]>;
        };
        expect(body.code).toBe('PASSWORD_POLICY_VIOLATION');
        expect(Object.keys(body.errors)).toEqual(['password']);
        // A form can highlight every failing rule at once instead of
        // revealing them one submission at a time.
        expect(body.errors.password.length).toBeGreaterThan(1);
      }
    });

    it('uses the supplied field name so reset can report `password` distinctly', () => {
      try {
        policy.assert('weak', 'newPassword');
      } catch (error) {
        const body = (error as BadRequestException).getResponse() as {
          errors: Record<string, string[]>;
        };
        expect(body.errors.newPassword).toBeDefined();
      }
    });

    it('does not throw for a compliant password', () => {
      expect(() => policy.assert(strong)).not.toThrow();
    });
  });

  describe('violation reporting', () => {
    it('does not repeat the same message twice', () => {
      const result = policy.check('aaaaaaaaaaaa');
      const messages = result.violations.map((v) => v.message);

      expect(new Set(messages).size).toBe(messages.length);
    });
  });
});
