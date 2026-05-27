import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../../database/entities/api-key.entity';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async generateApiKey(userId: number, scopes: string[] = []): Promise<ApiKey> {
    const key = crypto.randomBytes(32).toString('hex');
    const apiKey = this.apiKeyRepository.create({
      key,
      userId,
      scopes,
    });
    return this.apiKeyRepository.save(apiKey);
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { key, isRevoked: false } });
    return apiKey || null;
  }

  async revokeApiKey(id: number): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException('API Key not found');
    }
    apiKey.isRevoked = true;
    apiKey.revokedAt = new Date();
    await this.apiKeyRepository.save(apiKey);
  }

  async getApiKeysByUser(userId: number): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({ where: { userId } });
  }

  // Track usage - for now, just return the key, can add metrics later
  async trackUsage(key: string): Promise<void> {
    // Placeholder for usage tracking
    // Could increment a counter or log to metrics
  }
}