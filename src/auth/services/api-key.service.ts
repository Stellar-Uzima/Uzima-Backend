// #818 – Reconcile duplicate api-key services between auth trees.
// The full implementation (generateApiKey, validateApiKey, revokeApiKey, getApiKeysByUser)
// lives in src/modules/auth/services/api-key.service.ts.
// This re-export points all imports from src/auth/services/ to that single source of truth.
export { ApiKeyService } from '../../modules/auth/services/api-key.service';
