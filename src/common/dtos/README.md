# DTOs (Data Transfer Objects)

Common DTOs shared across modules.

## Files to Create

- `pagination.dto.ts` - Pagination query parameters
- `api-response.dto.ts` - Standard API response format
- `error-response.dto.ts` - Error response format

## Example

```typescript
// pagination.dto.ts
export class PaginationDto {
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}

// api-response.dto.ts
export class ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: Date;
}
```
