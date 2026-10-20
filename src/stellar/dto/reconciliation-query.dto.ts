import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ReconciliationQueryDto {
  @ApiProperty({
    description: 'Start of the reconciliation window (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    description: 'End of the reconciliation window (ISO 8601)',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsDateString()
  to: string;
}
