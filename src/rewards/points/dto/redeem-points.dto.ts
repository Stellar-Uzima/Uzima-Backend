import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RedeemPointsDto {
  @ApiProperty({
    description: 'UUID of the reward catalog item to redeem with points',
    example: '3f1d2c7e-8a4b-4f5e-9c3d-1b2a3c4d5e6f',
  })
  @IsUUID()
  catalogItemId: string;
}
