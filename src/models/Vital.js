import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenantPlugin.js';

const vitalSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedAt: { type: Date, required: true, index: true },
    heartRate: { type: Number },
    systolic: { type: Number },
    diastolic: { type: Number },
    temperatureC: { type: Number },
    spo2: { type: Number },
    respiratoryRate: { type: Number }
  },
  { timestamps: true }
);

vitalSchema.plugin(tenantPlugin);

// Compound index to accelerate range queries per patient
vitalSchema.index({ tenantId: 1, patientId: 1, recordedAt: 1 });

export default mongoose.model('Vital', vitalSchema);


