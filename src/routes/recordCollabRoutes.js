import express from 'express';
import { getCollaborators } from '../services/collabService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /records/:id/collaborators
router.get('/:id/collaborators', authenticate, (req, res) => {
  try {
    const documentId = req.params.id;
    const activeCollaborators = getCollaborators(documentId);
    res.json(activeCollaborators);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch collaborators' });
  }
});

export default router;
