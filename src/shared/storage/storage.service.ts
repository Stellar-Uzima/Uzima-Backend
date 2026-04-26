import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  path: string;
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
}
