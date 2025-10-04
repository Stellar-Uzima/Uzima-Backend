import mongoose from "mongoose";

const patientSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  address: String,
});

// Full-text index for patient search
patientSchema.index({
  firstName: "text",
  lastName: "text",
  email: "text",
  address: "text",
});

export default mongoose.model("Patient", patientSchema);
