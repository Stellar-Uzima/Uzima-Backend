import mongoose from 'mongoose';
import encryptedFieldPlugin from './plugins/encryptedField.js';
import tenantPlugin from './plugins/tenantPlugin.js';

const patientSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, lowercase: true },
  phone: String,
  address: String,
});

patientSchema.plugin(tenantPlugin);

patientSchema.plugin(encryptedFieldPlugin, { fields: ['email', 'phone', 'address'] });

patientSchema.index({ tenantId: 1 });

// Full-text index for patient search
patientSchema.index({
  firstName: 'text',
  lastName: 'text',
  email: 'text',
  address: 'text',
});

export default mongoose.model('Patient', patientSchema);
