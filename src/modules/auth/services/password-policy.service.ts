import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isWithinBcryptLimit,
} from './credential-normalizer';
import { PasswordValidatorService } from './password-validator.service';

/**
 * Represents a single password policy violation.
 * The field identifies which input failed, while the message explains why.
 */
export interface PasswordPolicyViolation {
  field: string;
  message: string;
}

/**
 * Contains the result of validating a password against the security policy.
 */
export interface PasswordPolicyResult {
  isValid: boolean;
  violations: PasswordPolicyViolation[];
  /** Score from 0–100, exposed to the client for live password-strength feedback. */
  score: number;
}

/**
 * Central authority for enforcing password security rules (#1283, #1285).
 *
 * Password validation is performed here even if the DTO also validates it.
 * DTO validation protects HTTP requests, but AuthService may also be called
 * directly by other services, event handlers, or tests.
 *
 * Keeping the policy here ensures that every entry point applies the same
 * rules before a password is accepted for credential storage.
 */
@Injectable()
export class PasswordPolicyService {
  // Reuses the password validator for structural checks and strength scoring.
  private readonly validator = new PasswordValidatorService();

  /**
   * Checks a password against the complete password policy.
   *
   * Collects all applicable violations instead of stopping at the first
   * failure, allowing clients to display multiple validation messages.
   *
   * @param password - The value to validate; unknown allows runtime type checks.
   * @param field - The name of the field being validated.
   * @returns Validation status, deduplicated violations, and strength score.
   */
  check(password: unknown, field = 'password'): PasswordPolicyResult {
    const violations: PasswordPolicyViolation[] = [];

    // Reject missing, empty, or non-string values before running string checks.
    if (typeof password !== 'string' || password.length === 0) {
      return {
        isValid: false,
        violations: [{ field, message: `${field} is required` }],
        score: 0,
      };
    }

    // Check the bcrypt byte limit first because bcrypt has a maximum input size.
    // UTF-8 byte length can differ from JavaScript's character count, especially
    // for passwords containing non-ASCII characters.
    if (!isWithinBcryptLimit(password)) {
      violations.push({
        field,
        message:
          `${field} must be at most ${BCRYPT_MAX_PASSWORD_BYTES} bytes ` +
          `(currently ${Buffer.byteLength(password, 'utf8')})`,
      });
    }

    // Enforce the maximum character count defined by the password policy.
    if (password.length > PASSWORD_MAX_LENGTH) {
      violations.push({
        field,
        message: `${field} must be at most ${PASSWORD_MAX_LENGTH} characters`,
      });
    }

    // Enforce the minimum character count required by the policy.
    if (password.length < PASSWORD_MIN_LENGTH) {
      violations.push({
        field,
        message: `${field} must be at least ${PASSWORD_MIN_LENGTH} characters`,
      });
    }

    // Apply additional password structure rules and calculate its strength.
    const structural = this.validator.validatePassword(password);

    // Only structural findings classified as errors invalidate the password.
    // Warnings can still contribute to feedback without automatically failing it.
    for (const error of structural.errors) {
      if (error.severity === 'error') {
        violations.push({ field, message: error.message });
      }
    }

    // A password is valid only when no policy violations have been collected.
    // Remove duplicate messages before returning the result to the caller.
    return {
      isValid: violations.length === 0,
      violations: this.dedupe(violations),
      score: structural.score,
    };
  }

  /**
   * Enforces the password policy by throwing an HTTP 400 error when validation
   * fails. This is useful when a caller must reject invalid passwords rather
   * than handle a validation result manually.
   *
   * All violations are grouped by field so the client can display every
   * applicable error in a single response.
   *
   * @param password - The value to validate.
   * @param field - The name of the field being validated.
   */
  assert(password: unknown, field = 'password'): void {
    // Run the shared validation logic so assert() and check() stay consistent.
    const result = this.check(password, field);

    // Return immediately when the password satisfies every required rule.
    if (result.isValid) {
      return;
    }

    // Group messages by field, allowing the API response to support
    // field-level error display on the frontend.
    const details: Record<string, string[]> = {};

    for (const violation of result.violations) {
      // Initialize the field's error list if it does not exist, then append
      // the current violation message.
      (details[violation.field] ??= []).push(violation.message);
    }

    // Return a structured Bad Request response that clients can handle
    // consistently without parsing a single combined error string.
    throw new BadRequestException({
      statusCode: 400,
      code: 'PASSWORD_POLICY_VIOLATION',
      message: 'Password does not meet the security policy',
      errors: details,
    });
  }

  /**
   * Removes duplicate violation messages while preserving their original order.
   *
   * A Set tracks messages already encountered so the same error is not
   * returned multiple times when different validation checks overlap.
   *
   * @param violations - The collected password policy violations.
   * @returns A list containing only the first occurrence of each message.
   */
  private dedupe(violations: PasswordPolicyViolation[]): PasswordPolicyViolation[] {
    const seen = new Set<string>();

    return violations.filter((violation) => {
      // Skip a violation if its message has already been included.
      if (seen.has(violation.message)) {
        return false;
      }

      // Remember this message so later duplicates can be excluded.
      seen.add(violation.message);
      return true;
    });
  }
}
