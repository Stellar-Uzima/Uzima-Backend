import mongoose from "mongoose";

const medicalRecordSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  diagnosis: String,
  treatment: String,
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Full-text index for record search
medicalRecordSchema.index({
  diagnosis: "text",
  treatment: "text",
  notes: "text",
});

export default mongoose.model("MedicalRecord", medicalRecordSchema);
