import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';

export interface UploadResult {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  path: string;
}

export interface DataExportResult {
  exportId: string;
  filePath: string;
  downloadToken: string;
  expiresAt: Date;
}

@Injectable()
export class StorageService {
  private readonly uploadDir = join(process.cwd(), 'uploads');

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(
    file: Buffer,
    originalName: string,
    mimetype: string,
    subfolder?: string,
  ): Promise<UploadResult> {
    const filename = `${uuidv4()}-${originalName}`;
    const targetDir = subfolder ? join(this.uploadDir, subfolder) : this.uploadDir;
    
    await this.ensureDirectoryExists(targetDir);
    
    const filePath = join(targetDir, filename);
    await fs.writeFile(filePath, file);

    const relativePath = subfolder ? `${subfolder}/${filename}` : filename;
    const url = `/uploads/${relativePath}`;

    return {
      filename,
      originalName,
      mimetype,
      size: file.length,
      url,
      path: filePath,
    };
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }

  async deleteFileByUrl(url: string): Promise<void> {
    const relativePath = url.replace('/uploads/', '');
    const filePath = join(this.uploadDir, relativePath);
    await this.deleteFile(filePath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStats(filePath: string): Promise<{ size: number; modified: Date } | null> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        modified: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  getUploadDir(): string {
    return this.uploadDir;
  }

  /**
   * Persist a GDPR JSON export and return a time-limited download token (24h).
   */
  async saveDataExport(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<DataExportResult> {
    const exportId = uuidv4();
    const downloadToken = randomBytes(32).toString('hex');
    const subfolder = join('exports', userId);
    const filename = `${exportId}.json`;
    const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');

    const saved = await this.saveFile(content, filename, 'application/json', subfolder);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const tokenPath = join(this.uploadDir, 'exports', '.tokens', `${downloadToken}.json`);
    await this.ensureDirectoryExists(join(this.uploadDir, 'exports', '.tokens'));
    await fs.writeFile(
      tokenPath,
      JSON.stringify({
        userId,
        exportId,
        filePath: saved.path,
        expiresAt: expiresAt.toISOString(),
      }),
      'utf-8',
    );

    return { exportId, filePath: saved.path, downloadToken, expiresAt };
  }

  async resolveDataExportDownload(
    downloadToken: string,
  ): Promise<{ filePath: string; userId: string; exportId: string } | null> {
    const tokenPath = join(
      this.uploadDir,
      'exports',
      '.tokens',
      `${downloadToken}.json`,
    );

    if (!(await this.fileExists(tokenPath))) {
      return null;
    }

    const raw = await fs.readFile(tokenPath, 'utf-8');
    const meta = JSON.parse(raw) as {
      userId: string;
      exportId: string;
      filePath: string;
      expiresAt: string;
    };

    if (new Date(meta.expiresAt).getTime() < Date.now()) {
      await this.deleteFile(tokenPath);
      if (await this.fileExists(meta.filePath)) {
        await this.deleteFile(meta.filePath);
      }
      return null;
    }

    if (!(await this.fileExists(meta.filePath))) {
      return null;
    }

    return {
      filePath: meta.filePath,
      userId: meta.userId,
      exportId: meta.exportId,
    };
  }

  buildDataExportDownloadUrl(downloadToken: string, baseUrl?: string): string {
    const appBase =
      baseUrl ?? process.env.APP_URL ?? 'http://localhost:3001';
    return `${appBase.replace(/\/$/, '')}/users/data-export/download?token=${downloadToken}`;
  }

  hashDownloadToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
