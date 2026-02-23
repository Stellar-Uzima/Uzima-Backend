import { IsString, Matches } from 'class-validator';

export class LinkWalletDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Invalid Stellar address format',
  })
  address: string;
}
