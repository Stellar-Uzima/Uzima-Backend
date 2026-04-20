# Utilities

Shared utility functions and helpers.

## Files to Create

- `validators.ts` - Custom validators
- `constants.ts` - Application constants
- `helpers.ts` - Helper functions
- `errors.ts` - Custom error classes

## Example Structure

```typescript
// validators.ts
export class CustomValidators {
  static isValidPhoneNumber(phone: string): boolean {
    // Phone validation logic
  }
}

// constants.ts
export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

// helpers.ts
export function generateRandomCode(length: number): string {
  // Generate code
}

// errors.ts
export class NotFoundException extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}
```
