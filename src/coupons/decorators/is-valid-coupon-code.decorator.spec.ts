import { IsValidCouponCode, IsValidCouponCodeConstraint } from './is-valid-coupon-code.decorator';
import { validateSync } from 'class-validator';

// Test DTO with the decorator
class TestCouponDto {
  @IsValidCouponCode()
  code: string;

  constructor(code: string) {
    this.code = code;
  }
}

describe('IsValidCouponCodeDecorator', () => {
  let constraint: IsValidCouponCodeConstraint;

  beforeEach(() => {
    constraint = new IsValidCouponCodeConstraint();
  });

  describe('validate method', () => {
    it('should accept valid coupon codes (6-20 chars, alphanumeric + hyphens)', () => {
      expect(constraint.validate('UZIMA1A2', null)).toBe(true);
      expect(constraint.validate('ABC123', null)).toBe(true);
      expect(constraint.validate('COUPON-CODE-123', null)).toBe(true);
      expect(constraint.validate('test-code', null)).toBe(true);
      expect(constraint.validate('ABCD12345678901234', null)).toBe(true); // 18 chars
    });

    it('should reject codes shorter than 6 characters', () => {
      expect(constraint.validate('ABC12', null)).toBe(false);
      expect(constraint.validate('AB1', null)).toBe(false);
      expect(constraint.validate('', null)).toBe(false);
    });

    it('should reject codes longer than 20 characters', () => {
      expect(constraint.validate('ABCDEFGHIJKLMNOPQRSTU', null)).toBe(false); // 21 chars
      expect(constraint.validate('ABCDEFGHIJKLMNOPQRSTUVWXYZ', null)).toBe(false); // 26 chars
    });

    it('should reject codes with special characters', () => {
      expect(constraint.validate('CODE@123', null)).toBe(false);
      expect(constraint.validate('CODE#123', null)).toBe(false);
      expect(constraint.validate('CODE$123', null)).toBe(false);
      expect(constraint.validate('CODE_123', null)).toBe(false);
      expect(constraint.validate('CODE.123', null)).toBe(false);
    });

    it('should reject codes with spaces', () => {
      expect(constraint.validate('CODE 123', null)).toBe(false);
      expect(constraint.validate('CODE 123 ABC', null)).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(constraint.validate(123 as any, null)).toBe(false);
      expect(constraint.validate(null as any, null)).toBe(false);
      expect(constraint.validate(undefined as any, null)).toBe(false);
      expect(constraint.validate({} as any, null)).toBe(false);
    });

    it('should accept codes with only hyphens as special character', () => {
      expect(constraint.validate('A-B-C-D-E-F', null)).toBe(true);
      expect(constraint.validate('---ABC', null)).toBe(true);
      expect(constraint.validate('ABC---', null)).toBe(true);
    });
  });

  describe('defaultMessage method', () => {
    it('should return appropriate message for empty code', () => {
      const mockArgs = { value: '' } as any;
      expect(constraint.defaultMessage(mockArgs)).toContain('cannot be empty');
    });

    it('should return appropriate message for short codes', () => {
      const mockArgs = { value: 'ABC' } as any;
      const message = constraint.defaultMessage(mockArgs);
      expect(message).toContain('at least 6 characters');
      expect(message).toContain('current: 3');
    });

    it('should return appropriate message for long codes', () => {
      const mockArgs = { value: 'ABCDEFGHIJKLMNOPQRSTU' } as any; // 21 chars
      const message = constraint.defaultMessage(mockArgs);
      expect(message).toContain('not exceed 20 characters');
      expect(message).toContain('current: 21');
    });

    it('should return appropriate message for special characters', () => {
      const mockArgs = { value: 'CODE@123' } as any;
      const message = constraint.defaultMessage(mockArgs);
      expect(message).toContain('only contain letters, numbers, and hyphens');
      expect(message).toContain('No spaces or special characters');
    });
  });

  describe('Integration with class-validator', () => {
    it('should validate correct coupon codes in DTO', () => {
      const dto = new TestCouponDto('UZIMA1A2');
      const errors = validateSync(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject short codes in DTO', () => {
      const dto = new TestCouponDto('ABC');
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidCouponCode');
    });

    it('should reject codes with special characters in DTO', () => {
      const dto = new TestCouponDto('CODE@123');
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidCouponCode');
    });

    it('should reject codes with spaces in DTO', () => {
      const dto = new TestCouponDto('CODE 123');
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidCouponCode');
    });

    it('should reject long codes in DTO', () => {
      const dto = new TestCouponDto('ABCDEFGHIJKLMNOPQRSTU');
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidCouponCode');
    });
  });
});
