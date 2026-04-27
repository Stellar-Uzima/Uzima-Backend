import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456', description: '6-digit authenticator code' })
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/, { message: 'Code must be a 6-digit number' })
  code: string;
}

export class TwoFactorBackupDto {
  @ApiProperty({ example: 'ABCDEF12', description: 'Backup code generated for 2FA recovery' })
  @IsString()
  @Length(6, 20)
  backupCode: string;
}
