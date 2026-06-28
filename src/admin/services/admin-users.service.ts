// #790 - Reconcile triplicated admin-users service.
// The canonical, fully-featured AdminUsersService lives in
// src/modules/admin/services/admin-users.service.ts (uses @/ aliases and AuditService).
// This file re-exports it so existing imports from src/admin/services/ continue to resolve
// while pointing to the single source of truth.
export { AdminUsersService } from '../../modules/admin/services/admin-users.service';
