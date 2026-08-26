import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStellarDto {
  @ApiProperty({
    description: 'The Stellar public key (G… address) to register',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Invalid Stellar address format',
  })
  address: string;

  @ApiPropertyOptional({
    description:
      'Optional memo associated with this Stellar record (text, id, or hash)',
    example: 'user-wallet-123',
  })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({
    description:
      'Stellar network passphrase. Defaults to the public network if omitted.',
    example: 'Public Global Stellar Network ; September 2015',
  })
  @IsString()
  @IsOptional()
  networkPassphrase?: string;
}
