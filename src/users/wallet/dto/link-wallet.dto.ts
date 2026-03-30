import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkWalletDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Invalid Stellar address format',
  })
  @ApiProperty({
    description: 'The Stellar public key (address) to link to the user account',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  address: string;
}
