import mongoose from 'mongoose';
import encryptedFieldPlugin from './plugins/encryptedField.js';

const patientSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, lowercase: true },
  phone: String,
  address: String,
});

patientSchema.plugin(encryptedFieldPlugin, { fields: ['email', 'phone', 'address'] });

// Full-text index for patient search
patientSchema.index({
  firstName: 'text',
  lastName: 'text',
  email: 'text',
  address: 'text',
});

export default mongoose.model('Patient', patientSchema);
