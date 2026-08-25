import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guards routes by requiring a valid JWT authentication token.
 * Access is denied when the request is not authenticated.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
