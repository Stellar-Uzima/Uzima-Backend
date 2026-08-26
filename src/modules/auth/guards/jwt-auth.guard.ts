import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Enforces JWT bearer-token authentication using the `jwt` Passport
 * strategy (see `JwtStrategy`). Extracts the token from the
 * `Authorization: Bearer <token>` header, verifies it against
 * `JWT_SECRET`, and attaches the decoded `{ sub, email, role }` payload
 * to `request.user` for downstream handlers/guards (e.g. `RolesGuard`).
 *
 * Denies access with a 401 Unauthorized response when the token is
 * missing, malformed, expired, or fails signature verification.
 * Guards routes by requiring a valid JWT authentication token.
 * Access is denied when the request is not authenticated.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
