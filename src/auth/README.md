# Password Strength Validation Service

A comprehensive, injectable password validation service for the Uzima-Backend that enforces strong password policies with detailed feedback and scoring.

## Features

### ✅ Core Validation Requirements
- **Minimum Length**: Validates minimum 8 characters (configurable)
- **Character Complexity**: Requires uppercase, lowercase, numbers, and special characters
- **Common Password Detection**: Rejects passwords from top 100 common passwords list
- **Specific Feedback**: Returns detailed error messages for each failed requirement

### ✅ Advanced Security Features
- **Password Strength Scoring**: 0-100 score calculation
- **Pattern Detection**: Identifies sequential characters, repeated characters, and weak patterns
- **Customizable Rules**: Flexible configuration for different security levels
- **Class-Validator Integration**: Seamless DTO validation with decorators

### ✅ Developer Experience
- **TypeScript Support**: Full type safety with interfaces and enums
- **Comprehensive Testing**: 100+ test cases covering all scenarios
- **Reusable Service**: Injectable across the auth module
- **Password Suggestions**: Generates secure password suggestions

## Installation

The service requires `class-validator` for DTO integration:

```bash
npm install class-validator
```

## Quick Start

### Basic Usage

```typescript
import { PasswordValidatorService } from './auth/services/password-validator.service';

const validator = new PasswordValidatorService();
const result = validator.validatePassword('MySecureP@ssw0rd!');

console.log(result);
// Output:
// {
//   isValid: true,
//   errors: [],
//   score: 85
// }
```

### Class-Validator Integration

```typescript
import { IsEmail } from 'class-validator';
import { IsStrongPassword } from '../decorators/strong-password.decorator';

export class RegisterUserDto {
  @IsEmail()
  email: string;

  @IsStrongPassword({
    message: 'Password must meet security requirements'
  })
  password: string;
}
```

## API Reference

### PasswordValidatorService

#### Main Methods

##### `validatePassword(password: string, config?: Partial<PasswordStrengthConfig>): PasswordValidationResult`

Comprehensive password validation with detailed feedback.

**Parameters:**
- `password`: The password to validate
- `config`: Optional configuration overrides

**Returns:**
```typescript
interface PasswordValidationResult {
  isValid: boolean;           // Overall validation status
  errors: PasswordValidationError[];  // Detailed error list
  score: number;              // 0-100 strength score
}
```

##### `isStrongPassword(password: string, config?: Partial<PasswordStrengthConfig>): boolean`

Quick boolean validation check.

##### `getPasswordStrength(password: string): number`

Returns password strength score (0-100).

##### `getPasswordStrengthCategory(password: string): PasswordStrengthCategory`

Returns strength category: `'very_weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very_strong'`

##### `generatePasswordSuggestions(length?: number): string[]`

Generates 5 secure password suggestions.

### Configuration Options

```typescript
interface PasswordStrengthConfig {
  minLength: number;              // Default: 8
  requireUppercase: boolean;      // Default: true
  requireLowercase: boolean;      // Default: true
  requireNumbers: boolean;        // Default: true
  requireSpecialChars: boolean;   // Default: true
  maxConsecutiveRepeats: number;   // Default: 2
  enableCommonPasswordCheck: boolean;  // Default: true
  enablePatternCheck: boolean;    // Default: true
}
```

### Error Types

```typescript
enum PasswordErrorType {
  TOO_SHORT = 'TOO_SHORT',
  NO_UPPERCASE = 'NO_UPPERCASE',
  NO_LOWERCASE = 'NO_LOWERCASE',
  NO_NUMBER = 'NO_NUMBER',
  NO_SPECIAL_CHARACTER = 'NO_SPECIAL_CHARACTER',
  COMMON_PASSWORD = 'COMMON_PASSWORD',
  SEQUENTIAL_CHARS = 'SEQUENTIAL_CHARS',
  REPEATED_CHARS = 'REPEATED_CHARS',
  WEAK_PATTERN = 'WEAK_PATTERN'
}
```

## Decorators

### @IsStrongPassword

Validates password with customizable requirements.

```typescript
@IsStrongPassword({
  minLength: 12,
  requireSpecialChars: true,
  message: 'Please choose a stronger password'
})
password: string;
```

### @HasMinPasswordStrength

Requires minimum password strength score.

```typescript
@HasMinPasswordStrength(80, {
  message: 'Password strength score must be at least 80'
})
password: string;
```

### @IsStrongPasswordCategory

Requires password to be in specific strength categories.

```typescript
@IsStrongPasswordCategory(['good', 'strong', 'very_strong'], {
  message: 'Password must be at least good strength'
})
password: string;
```

## Usage Examples

### Custom Configuration

```typescript
const validator = new PasswordValidatorService();

// Lenient configuration for basic users
const lenientConfig = {
  minLength: 6,
  requireSpecialChars: false,
  enablePatternCheck: false
};

const result = validator.validatePassword('simple123', lenientConfig);

// Strict configuration for admin users
const strictConfig = {
  minLength: 12,
  maxConsecutiveRepeats: 1,
  enableCommonPasswordCheck: true,
  enablePatternCheck: true
};

const adminResult = validator.validatePassword('VerySecureP@ssw0rd!', strictConfig);
```

### Error Handling

```typescript
const validator = new PasswordValidatorService();
const result = validator.validatePassword('weak');

if (!result.isValid) {
  const errorMessages = result.errors
    .filter(error => error.severity === 'error')
    .map(error => error.message);
  
  console.log('Password validation failed:', errorMessages);
  // Output: [
  //   'Password must be at least 8 characters long',
  //   'Password must contain at least one uppercase letter',
  //   'Password must contain at least one number',
  //   'Password must contain at least one special character'
  // ]
}
```

### Password Strength Assessment

```typescript
const validator = new PasswordValidatorService();

const passwords = [
  '123',           // very_weak
  'weak123',       // weak
  'Password123',   // fair
  'Password123!',  // good
  'SecureP@ssw0rd!', // strong
  'VerySecureP@ssw0rd123!' // very_strong
];

passwords.forEach(password => {
  const score = validator.getPasswordStrength(password);
  const category = validator.getPasswordStrengthCategory(password);
  console.log(`${password}: ${score}/100 (${category})`);
});
```

### Password Generation

```typescript
const validator = new PasswordValidatorService();

// Generate 12-character passwords
const suggestions = validator.generatePasswordSuggestions(12);
console.log(suggestions);
// Example output: [
//   'xK9#mP2@nQ5!',
//   'R7w$L4pY8zA&',
//   'B3f@H6jK9mN#',
//   'T5q*W2rY8uP!',
//   'M7c@V4xZ9nL$'
// ]
```

## Security Features

### Common Password Detection

The service includes a curated list of the top 100 common passwords:
- Basic passwords: `123456`, `password`, `qwerty`
- Variations: `Password123!`, `admin123`, `welcome123`
- Pattern-based: `abc123`, `letmein`, `trustno1`

### Pattern Analysis

- **Sequential Characters**: Detects `abc`, `123`, `qwe` sequences
- **Repeated Characters**: Identifies `aaa`, `111`, `!!!` repetitions
- **Weak Patterns**: Recognizes `password123`, `qwerty123` patterns

### Strength Scoring Algorithm

The password strength score (0-100) is calculated based on:
- Length (up to 20 points)
- Character diversity (up to 60 points)
- Complexity bonuses (up to 20 points)
- Pattern penalties (subtract up to 35 points)

## Testing

Run the comprehensive test suite:

```bash
npm run test -- src/auth/services/password-validator.service.spec.ts
```

### Test Coverage

The test suite includes 100+ test cases covering:
- ✅ Basic validation requirements
- ✅ Common password detection
- ✅ Pattern detection (sequential, repeated, weak)
- ✅ Password strength scoring
- ✅ Custom configuration options
- ✅ Utility methods
- ✅ Class-validator integration
- ✅ Edge cases and error handling

## Integration with Existing Auth System

### Service Registration

```typescript
// In your auth module or app module
import { PasswordValidatorService } from './auth/services/password-validator.service';

// The service is ready to use as-is
const passwordValidator = new PasswordValidatorService();
```

### Controller Usage

```typescript
import { PasswordValidatorService } from '../services/password-validator.service';

@Controller('auth')
export class AuthController {
  constructor(private passwordValidator: PasswordValidatorService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterUserDto) {
    // Additional validation if needed
    const result = this.passwordValidator.validatePassword(registerDto.password);
    
    if (!result.isValid) {
      throw new BadRequestException({
        message: 'Password validation failed',
        errors: result.errors
      });
    }
    
    // Proceed with registration...
  }
}
```

## Performance Considerations

- **Memory Efficient**: Common passwords list is stored as a static array
- **Fast Validation**: Optimized regex patterns and algorithms
- **Minimal Dependencies**: Only requires `class-validator` for decorators
- **Lazy Loading**: Passwords list is initialized only when needed

## Security Best Practices

1. **Customize for User Types**: Use stricter requirements for admin accounts
2. **Regular Updates**: Update the common passwords list periodically
3. **User Education**: Provide specific feedback to help users choose better passwords
4. **Rate Limiting**: Implement rate limiting for password attempts
5. **Secure Storage**: Always hash passwords before storage

## Troubleshooting

### Common Issues

**Q: Password validation is too strict**
A: Adjust the configuration to be more lenient:
```typescript
const config = {
  minLength: 6,
  requireSpecialChars: false,
  enablePatternCheck: false
};
```

**Q: False positives for common passwords**
A: The service checks for partial matches. Consider disabling common password check:
```typescript
const config = { enableCommonPasswordCheck: false };
```

**Q: Performance concerns**
A: The service is optimized for performance. For bulk validation, consider batching requests.

### Debug Mode

Enable detailed logging by checking the error details:

```typescript
const result = validator.validatePassword(password);
console.log('Validation errors:', result.errors);
console.log('Password score:', result.score);
```

## File Structure

```
src/auth/
├── services/
│   ├── password-validator.service.ts      # Main service implementation
│   └── password-validator.service.spec.ts # Comprehensive tests
├── decorators/
│   └── strong-password.decorator.ts       # Class-validator decorators
├── dto/
│   └── password-validation-examples.dto.ts # Usage examples
└── README.md                               # This documentation
```

## Contributing

When contributing to the password validator:
1. Add comprehensive tests for new features
2. Update the common passwords list if needed
3. Consider backward compatibility
4. Document any breaking changes
5. Ensure all tests pass before submitting

## License

This service is part of the Uzima-Backend project and follows the same licensing terms.
