import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyStellarTransactionDto {
  @ApiProperty({
    description: 'Signed transaction envelope in base64 XDR',
  })
  @IsString()
  @IsNotEmpty()
  xdr: string;

  @ApiProperty({
    description: 'Base64 ed25519 signature over the transaction signature base',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    description: 'Public key of the expected signer (G…)',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'Invalid Stellar public key format' })
  publicKey: string;
}
