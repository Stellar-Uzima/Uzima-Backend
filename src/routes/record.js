import express from 'express';
import MedicalRecord from '../models/MedicalRecord';
import { generateHash } from '../utils/hash';
import { authenticate } from '../middleware/auth';
import { Request, Response } from 'express';

const router = express.Router();

// POST /records - create a new medical record
router.post('/', authenticate, async (req, res) => {
  try {
    const { recordData } = req.body;
    const userId = req.user?.id;

    if (!recordData) {
      return res.status(400).json({ message: 'recordData is required' });
    }

    const hash = generateHash(recordData);
    const newRecord = new MedicalRecord({ userId, recordData, hash });

    await newRecord.save();

    return res.status(201).json({ id: newRecord._id, hash });
  } catch (err) {
    console.error('Error creating record:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/:id', authenticate, async (req, res) => {
  try {
    const record = await MedicalRecord.findById(req.params.id);

    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    if (record.userId.toString() !== req.user?.id) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    return res.status(200).json(record);
  } catch (err) {
    console.error('Error retrieving record:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
