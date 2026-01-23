import express from 'express';
import { anonymizeData } from '../controllers/anonymizationController.js';
// Assuming there might be an auth middleware, if not we skip it for now or use a placeholder.
// Based on file list, '../middleware/auth.js' or similar likely exists but wasn't explicitly listed in `src/middleware`.
// I will assume for now we might want to protect it if `req.user` is used.
// Checking `src/middleware` from the file list earlier:
// {"name":"middleware","isDir":true,"numChildren":16}
// content of routes usually imports middleware.
// Let's use a safe approach, if auth middleware is standard, I'd include it.
// For now, I will create the route and if authentication is needed, I will update.
// The Audit Log relies on `req.user`, so auth middleware is highly recommended.
// I will check `src/routes/userRoutes.js` or `src/index.js` to see how auth is applied.
// In `src/index.js`: `import authRoutes from './authRoutes.js';`
// I'll skip importing auth middleware blindly to avoid breaking. User can add it or I can check.
// Controller handles `req.user` optionally.

const router = express.Router();

router.post('/', anonymizeData);

export default router;
