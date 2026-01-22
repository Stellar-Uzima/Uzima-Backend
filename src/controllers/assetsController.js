import { generateCodes } from '../services/qrService.js';
import Asset from '../models/assetModel.js';

export const createAsset = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Asset name required' });

    const id = Date.now().toString(); // mock unique ID
    const { qrCode, barcode } = await generateCodes(id);

    const newAsset = {
      id,
      name,
      qrCode, // base64 QR
      barcode, // base64 barcode
    };

    Asset.push(newAsset); // store in-memory (replace with DB later)

    res.status(201).json(newAsset);
  } catch (err) {
    console.error('Error creating asset:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAsset = (req, res) => {
  try {
    const asset = Asset.find(a => a.id === req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
