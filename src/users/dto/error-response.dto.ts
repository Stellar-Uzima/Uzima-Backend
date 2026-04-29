import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'Error message describing what went wrong',
    example: 'Validation failed: fullName is required',
  })
  message: string;

  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Detailed validation errors (for 422 responses)',
    example: ['fullName must be between 1 and 100 characters'],
    required: false,
    isArray: true,
  })
  errors?: string[];

  @ApiProperty({
    description: 'Error timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'API path that generated the error',
    example: '/api/users/me',
  })
  path: string;
}
