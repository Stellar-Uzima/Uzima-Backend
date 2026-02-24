import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ example: 'UZIMA1A2', description: 'Coupon code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Specialist UUID' })
  @IsUUID()
  @IsNotEmpty()
  specialistId: string;
}
