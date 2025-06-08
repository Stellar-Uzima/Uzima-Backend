import mongoose, { Schema, Document } from 'mongoose';

export interface IMedicalRecord extends Document {
  userId: mongoose.Types.ObjectId;
  recordData: string;
  createdAt: Date;
  hash: string;
}

const MedicalRecordSchema: Schema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  recordData: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  hash: { type: String, required: true },
});

export default mongoose.model<IMedicalRecord>('MedicalRecord', MedicalRecordSchema);
