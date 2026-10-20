import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class LinkStellarAccountDto {
  @ApiProperty({
    description: 'Stellar ed25519 public key (G…) to link to the user profile',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'Invalid Stellar public key format' })
  publicKey: string;

  @ApiPropertyOptional({
    description:
      'Stellar network the account belongs to. Must match the network configured on the server.',
    enum: ['testnet', 'public'],
  })
  @IsOptional()
  @IsIn(['testnet', 'public'])
  network?: 'testnet' | 'public';

  @ApiProperty({
    description:
      'Base64 ed25519 signature over the sha256 digest of the UTF-8 message ' +
      '"Uzima Stellar linking:<userId>:<publicKey>" produced by the account private key. ' +
      'Proves ownership of the Stellar account.',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;
}
