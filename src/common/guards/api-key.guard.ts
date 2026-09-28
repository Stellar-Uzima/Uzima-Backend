import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from '../../modules/auth/services/api-key.service';

/**
 * Guard that validates the presence and authenticity of an API key
 * supplied via the `x-api-key` header (or a Bearer token in the
 * `authorization` header). Requests missing a key or carrying an
 * invalid one are rejected with a 401 Unauthorized response.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey =
      request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      throw new UnauthorizedException('API Key missing');
    }

    const validKey = await this.apiKeyService.validateApiKey(apiKey);
    if (!validKey) {
      throw new UnauthorizedException('Invalid API Key');
    }

    // Attach user or key to request for later use
    request.apiKey = validKey;
    request.user = validKey.user;

    // Track usage
    await this.apiKeyService.trackUsage(apiKey);

    return true;
  }
}
