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

  /**
   * Validates the request API key and attaches the resolved key/user to the request.
   *
   * Reads the key from the `x-api-key` header, or from a Bearer token in the
   * `authorization` header. On success, sets `request.apiKey` and `request.user`
   * and records key usage. Throws {@link UnauthorizedException} when the key is
   * missing or invalid.
   *
   * @param context - Nest execution context used to access the HTTP request
   * @returns `true` when the API key is present and valid
   * @throws {UnauthorizedException} When the API key is missing or invalid
   */
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
