import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TwoFactorEnableDto {
  @ApiPropertyOptional({ description: 'TOTP code to confirm setup (optional on first enable)' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;
}

export class TwoFactorDisableDto {
  @ApiPropertyOptional({ description: 'TOTP code required to disable 2FA' })
  @IsString()
  @Length(6, 6)
  code: string;
}
