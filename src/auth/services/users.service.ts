// #1082 – Reconcile duplicate auth services between auth trees.
// The full implementation lives in src/modules/auth/services/users.service.ts.
// This re-export points all imports from src/auth/services/ to that single source of truth.
export { UsersService } from '../../modules/auth/services/users.service';