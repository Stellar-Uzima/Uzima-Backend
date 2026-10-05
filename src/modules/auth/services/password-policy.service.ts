import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isWithinBcryptLimit,
} from './credential-normalizer';
import { PasswordValidatorService } from './password-validator.service';

export interface PasswordPolicyViolation {
  field: string;
  message: string;
}

export interface PasswordPolicyResult {
  isValid: boolean;
  violations: PasswordPolicyViolation[];
  /** 0-100, exposed to the client so a form can show live strength feedback. */
  score: number;
}

/**
 * The single authority on what a password may be (#1283, #1285).
 *
 * Enforcing the policy in the DTO *and* here is deliberate. The DTO stops an
 * HTTP caller, but `AuthService` is also reachable from other services, event
 * handlers and tests. A rule that only lives in the validation layer is one
 * refactor away from being bypassed, and a bypassed password policy is not a
 * partial failure: it writes an unhashed-weak credential straight to the
 * database.
 */
@Injectable()
export class PasswordPolicyService {
  private readonly validator = new PasswordValidatorService();

  check(password: unknown, field = 'password'): PasswordPolicyResult {
    const violations: PasswordPolicyViolation[] = [];

    if (typeof password !== 'string' || password.length === 0) {
      return {
        isValid: false,
        violations: [{ field, message: `${field} is required` }],
        score: 0,
      };
    }

    // The bcrypt limit is checked first: it is a hard correctness constraint,
    // and reporting "needs an uppercase letter" for a 200-character password
    // would be a misleading way to describe the actual problem.
    if (!isWithinBcryptLimit(password)) {
      violations.push({
        field,
        message:
          `${field} must be at most ${BCRYPT_MAX_PASSWORD_BYTES} bytes ` +
          `(currently ${Buffer.byteLength(password, 'utf8')})`,
      });
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      violations.push({
        field,
        message: `${field} must be at most ${PASSWORD_MAX_LENGTH} characters`,
      });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      violations.push({
        field,
        message: `${field} must be at least ${PASSWORD_MIN_LENGTH} characters`,
      });
    }

    const structural = this.validator.validatePassword(password);
    for (const error of structural.errors) {
      if (error.severity === 'error') {
        violations.push({ field, message: error.message });
      }
    }

    return {
      isValid: violations.length === 0,
      violations: this.dedupe(violations),
      score: structural.score,
    };
  }

  /**
   * Throws a 400 listing every violation, so a form can highlight all failing
   * rules at once instead of revealing them one submission at a time.
   */
  assert(password: unknown, field = 'password'): void {
    const result = this.check(password, field);

    if (result.isValid) {
      return;
    }

    const details: Record<string, string[]> = {};
    for (const violation of result.violations) {
      (details[violation.field] ??= []).push(violation.message);
    }

    throw new BadRequestException({
      statusCode: 400,
      code: 'PASSWORD_POLICY_VIOLATION',
      message: 'Password does not meet the security policy',
      errors: details,
    });
  }

  private dedupe(violations: PasswordPolicyViolation[]): PasswordPolicyViolation[] {
    const seen = new Set<string>();
    return violations.filter((violation) => {
      if (seen.has(violation.message)) {
        return false;
      }
      seen.add(violation.message);
      return true;
    });
  }
}
