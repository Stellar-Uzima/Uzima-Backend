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
    it('should accept valid eight-character alphanumeric coupon codes', () => {
      expect(constraint.validate('UZIMA1A2', null)).toBe(true);
      expect(constraint.validate('coupon12', null)).toBe(true);
    });

    it('should reject codes that are not exactly eight characters', () => {
      expect(constraint.validate('ABC123', null)).toBe(false);
      expect(constraint.validate('ABCD123456', null)).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(constraint.validate('', null)).toBe(false);
      expect(constraint.validate('   ', null)).toBe(false);
    });

    it('should reject codes with special characters', () => {
      expect(constraint.validate('CODE@123', null)).toBe(false);
      expect(constraint.validate('CODE#123', null)).toBe(false);
      expect(constraint.validate('CODE$123', null)).toBe(false);
      expect(constraint.validate('CODE_123', null)).toBe(false);
      expect(constraint.validate('CODE.123', null)).toBe(false);
      expect(constraint.validate('CODE+123', null)).toBe(false);
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
  });

  describe('defaultMessage method', () => {
    it('should return appropriate message for empty code', () => {
      const mockArgs = { value: '' } as any;
      expect(constraint.defaultMessage(mockArgs)).toContain('cannot be empty');
    });

    it('should return an appropriate message for codes with the wrong length', () => {
      const mockArgs = { value: 'ABC' } as any;
      const message = constraint.defaultMessage(mockArgs);
      expect(message).toContain('exactly 8 characters');
      expect(message).toContain('current: 3');
    });

    it('should return appropriate message for special characters', () => {
      const mockArgs = { value: 'CODE@123' } as any;
      const message = constraint.defaultMessage(mockArgs);
      expect(message).toContain('only contain letters and numbers');
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

    it('should reject codes longer than eight characters in DTO', () => {
      const dto = new TestCouponDto('ABCD123456');
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidCouponCode');
    });
  });
});
