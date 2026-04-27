import { Injectable, Logger } from '@nestjs/common';
import { ConfigService, registerAs } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export default registerAs('secrets', () => ({
  vaultFilePath: process.env.SECRETS_VAULT_FILE || '.secrets-vault.json',
  auditLogPath: process.env.SECRETS_AUDIT_LOG || '.secrets-access.log',
  vaultKey: process.env.SECRETS_VAULT_KEY || process.env.JWT_SECRET || 'default-vault-key-please-change',
}));

interface SecretRecord {
  iv: string;
  authTag: string;
  ciphertext: string;
  version: number;
  updatedAt: string;
  history?: Array<{ version: number; updatedAt: string }>;
}

interface VaultFile {
  [name: string]: SecretRecord;
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly vaultFilePath: string;
  private readonly auditLogPath: string;
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    this.vaultFilePath = path.resolve(
      process.cwd(),
      this.configService.get<string>('secrets.vaultFilePath'),
    );
    this.auditLogPath = path.resolve(
      process.cwd(),
      this.configService.get<string>('secrets.auditLogPath'),
    );
    const rawKey = this.configService.get<string>('secrets.vaultKey');
    this.encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  async getSecret(key: string): Promise<string> {
    const vault = await this.readVault();
    const record = vault[key];
    if (!record) {
      this.logAccess('get', key, false);
      throw new Error('Secret not found');
    }
    this.logAccess('get', key, true);
    return this.decrypt(record);
  }

  async setSecret(key: string, value: string): Promise<void> {
    const vault = await this.readVault();
    const existing = vault[key];
    if (existing) {
      existing.history = existing.history || [];
      existing.history.push({
        version: existing.version,
        updatedAt: existing.updatedAt,
      });
    }

    vault[key] = {
      ...this.encrypt(value),
      version: existing ? existing.version + 1 : 1,
      updatedAt: new Date().toISOString(),
      history: existing?.history,
    };

    await this.writeVault(vault);
    this.logAccess('set', key, true);
  }

  async rotateSecret(key: string, newValue?: string): Promise<string> {
    const value = newValue || crypto.randomBytes(32).toString('hex');
    await this.setSecret(key, value);
    this.logAccess('rotate', key, true);
    return value;
  }

  async listSecrets(): Promise<Array<{ name: string; version: number; updatedAt: string }>> {
    const vault = await this.readVault();
    return Object.entries(vault).map(([name, record]) => ({
      name,
      version: record.version,
      updatedAt: record.updatedAt,
    }));
  }

  async getAuditTrail(): Promise<string> {
    try {
      return await fs.readFile(this.auditLogPath, 'utf-8');
    } catch (err) {
      return '';
    }
  }

  private async readVault(): Promise<VaultFile> {
    try {
      const content = await fs.readFile(this.vaultFilePath, 'utf-8');
      return JSON.parse(content) as VaultFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw err;
    }
  }

  private async writeVault(vault: VaultFile): Promise<void> {
    await fs.writeFile(this.vaultFilePath, JSON.stringify(vault, null, 2), 'utf-8');
  }

  private encrypt(value: string): Omit<SecretRecord, 'version' | 'updatedAt' | 'history'> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
    };
  }

  private decrypt(record: SecretRecord): string {
    const iv = Buffer.from(record.iv, 'hex');
    const authTag = Buffer.from(record.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private async logAccess(action: string, key: string, success: boolean) {
    const entry = `${new Date().toISOString()} | ${action.toUpperCase()} | ${key} | ${success ? 'SUCCESS' : 'FAIL'}\n`;
    await fs.appendFile(this.auditLogPath, entry, 'utf-8');
  }
}
