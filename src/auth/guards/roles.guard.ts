// #1082 – Reconcile duplicate auth guards between auth trees.
// The full implementation lives in src/modules/auth/guards/roles.guard.ts.
// This re-export points all imports from src/auth/guards/ to that single source of truth.
export { RolesGuard } from '../../modules/auth/guards/roles.guard';