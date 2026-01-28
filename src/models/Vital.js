import mongoose from 'mongoose';

const vitalSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedAt: { type: Date, required: true, index: true },
    heartRate: { type: Number },
    systolic: { type: Number },
    diastolic: { type: Number },
    temperatureC: { type: Number },
    spo2: { type: Number },
    respiratoryRate: { type: Number },
  },
  { timestamps: true }
);

// Compound index to accelerate range queries per patient
vitalSchema.index({ patientId: 1, recordedAt: 1 });

export default mongoose.model('Vital', vitalSchema);
