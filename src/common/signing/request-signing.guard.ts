import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SigningService } from './signing.service';

@Injectable()
export class RequestSigningGuard implements CanActivate {
  private readonly logger = new Logger(RequestSigningGuard.name);

  constructor(
    private readonly signingService: SigningService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const signature = request.headers['x-signature'];
    const timestampHeader = request.headers['x-timestamp'];
    const keyId = request.headers['x-key-id'];

    if (!signature || !timestampHeader || !keyId) {
      throw new UnauthorizedException('Missing signing headers');
    }

    const timestamp = parseInt(timestampHeader as string, 10);
    if (isNaN(timestamp)) {
      throw new UnauthorizedException('Invalid timestamp format');
    }

    // 1. Prevent replay attacks
    if (!this.signingService.isTimestampValid(timestamp)) {
      throw new UnauthorizedException('Request timestamp expired or invalid');
    }

    // 2. Get secret for the given Key ID
    // In a real scenario, you'd fetch this from a DB or vault.
    // For now, we'll check against a configured API secret.
    const expectedSecret = this.configService.get<string>(`API_SECRET_${keyId}`);
    if (!expectedSecret) {
      throw new UnauthorizedException('Invalid Key ID');
    }

    // 3. Verify signature
    const isValid = this.signingService.verifySignature(
      signature as string,
      request.method,
      request.path,
      request.body,
      timestamp,
      expectedSecret,
    );

    if (!isValid) {
      this.logger.warn(`Invalid signature attempt for path: ${request.path} with Key ID: ${keyId}`);
      throw new UnauthorizedException('Invalid request signature');
    }

    return true;
  }
}
