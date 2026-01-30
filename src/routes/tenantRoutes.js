import express from 'express';
import {
    getAllTenants,
    createTenant,
    getTenantById,
    updateTenant,
    deleteTenant
} from '../controllers/tenantController.js';
import protect from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.use(protect);
router.use(requireRole('admin'));

router.route('/')
    .get(getAllTenants)
    .post(createTenant);

router.route('/:id')
    .get(getTenantById)
    .put(updateTenant)
    .delete(deleteTenant);

export default router;
