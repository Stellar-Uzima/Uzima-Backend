import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { User } from '@/entities/user.entity';
import { TwoFactor } from '@/database/entities/two-factor.entity';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TwoFactor)
    private readonly twoFactorRepository: Repository<TwoFactor>,
  ) {
    authenticator.options = { window: 1 };
  }

  async setupTwoFactor(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = authenticator.generateSecret();
    const backupCodes = await this.generateBackupCodes();
    const backupCodeHashes = await Promise.all(
      backupCodes.map(async (code) => ({ codeHash: await bcrypt.hash(code, 12), used: false })),
    );

    const existing = await this.twoFactorRepository.findOne({ where: { user: { id: userId } } });
    const record = existing
      ? Object.assign(existing, {
          secret,
          enabled: false,
          backupCodes: backupCodeHashes,
        })
      : this.twoFactorRepository.create({
          user,
          userId,
          secret,
          enabled: false,
          backupCodes: backupCodeHashes,
        });

    await this.twoFactorRepository.save(record);
    const otpauthUrl = authenticator.keyuri(user.email || userId, 'Stellar Uzima', secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return {
      otpauthUrl,
      qrCodeDataUrl,
      backupCodes,
    };
  }

  async confirmTwoFactor(userId: string, code: string) {
    const record = await this.findRecord(userId);
    if (!authenticator.check(code, record.secret)) {
      throw new BadRequestException('Invalid authentication code');
    }

    record.enabled = true;
    await this.twoFactorRepository.save(record);
    return { message: 'Two-factor authentication enabled successfully' };
  }

  async disableTwoFactor(userId: string, code: string) {
    const record = await this.findRecord(userId);
    if (!record.enabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    if (!authenticator.check(code, record.secret)) {
      throw new BadRequestException('Invalid authentication code');
    }

    record.enabled = false;
    await this.twoFactorRepository.save(record);
    return { message: 'Two-factor authentication disabled successfully' };
  }

  async verifyBackupCode(userId: string, backupCode: string) {
    const record = await this.findRecord(userId);
    if (!record.backupCodes?.length) {
      throw new BadRequestException('No backup codes available');
    }

    const codeEntry = await this.findBackupCodeEntry(record, backupCode);
    codeEntry.used = true;
    await this.twoFactorRepository.save(record);
    return { message: 'Backup code accepted. Two-factor authentication recovery successful' };
  }

  async getStatus(userId: string) {
    const record = await this.twoFactorRepository.findOne({ where: { user: { id: userId } } });
    return {
      enabled: !!record?.enabled,
      hasSetup: !!record,
    };
  }

  private async findRecord(userId: string) {
    const record = await this.twoFactorRepository.findOne({ where: { user: { id: userId } } });
    if (!record) {
      throw new NotFoundException('Two-factor authentication is not configured for this user');
    }
    return record;
  }

  private async findBackupCodeEntry(record: TwoFactor, code: string) {
    for (const entry of record.backupCodes || []) {
      if (!entry.used && (await bcrypt.compare(code, entry.codeHash))) {
        return entry;
      }
    }
    throw new BadRequestException('Invalid or already used backup code');
  }

  private async generateBackupCodes(): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(raw.slice(0, 8));
    }
    return codes;
  }
}
