// #1082 – Reconcile duplicate auth services between auth trees.
// The full implementation lives in src/modules/auth/services/jwt.service.ts.
// This re-export points all imports from src/auth/services/ to that single source of truth.
export { JwtTokenService } from '../../modules/auth/services/jwt.service';