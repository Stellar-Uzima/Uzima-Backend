import express from 'express';
import { createAsset, getAsset } from '../controllers/assetController.js';

const router = express.Router();

// Create asset + generate QR & barcode
router.post('/', createAsset);

// Retrieve asset info + codes
router.get('/:id', getAsset);

export default router;
