// #1082 – Reconcile duplicate auth controllers between auth trees.
// The full implementation lives in src/modules/auth/healer.controller.ts.
// This re-export points all imports from src/auth/ to that single source of truth.
export { HealerController } from '../modules/auth/healer.controller';