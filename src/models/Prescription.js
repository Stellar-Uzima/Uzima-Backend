import mongoose from 'mongoose';
import crypto from 'crypto';

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  dosage: {
    type: String,
    required: true,
    trim: true,
  },
  frequency: {
    type: String,
    required: true,
    trim: true,
  },
  duration: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  prescriptionNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  patientName: {
    type: String,
    required: true,
    trim: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  doctorName: {
    type: String,
    required: true,
    trim: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  medications: {
    type: [medicationSchema],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one medication is required',
    },
  },
  instructions: {
    type: String,
    trim: true,
  },
  issuedDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  expiryDate: {
    type: Date,
    required: true,
    index: true,
  },
  // Cryptographic signature
  signature: {
    type: String,
    required: true,
  },
  // QR code data URL
  qrCode: {
    type: String,
    required: true,
  },
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'verified', 'rejected', 'expired'],
    default: 'active',
    index: true,
  },
  // Verification tracking
  verifiedAt: {
    type: Date,
    default: null,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  verificationResult: {
    type: String,
    enum: ['valid', 'invalid', 'expired', 'tampered'],
    default: null,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Generate prescription number
prescriptionSchema.statics.generatePrescriptionNumber = function() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `RX-${timestamp}-${random}`;
};

// Generate cryptographic signature
prescriptionSchema.methods.generateSignature = function() {
  const dataToSign = {
    prescriptionNumber: this.prescriptionNumber,
    patientName: this.patientName,
    patientId: this.patientId.toString(),
    doctorName: this.doctorName,
    doctorId: this.doctorId.toString(),
    medications: this.medications,
    issuedDate: this.issuedDate.toISOString(),
    expiryDate: this.expiryDate.toISOString(),
  };
  
  const dataString = JSON.stringify(dataToSign);
  const secret = process.env.PRESCRIPTION_SECRET || process.env.JWT_SECRET || 'default-secret';
  const signature = crypto.createHmac('sha256', secret).update(dataString).digest('hex');
  
  return signature;
};

// Verify signature
prescriptionSchema.methods.verifySignature = function() {
  const expectedSignature = this.generateSignature();
  return this.signature === expectedSignature;
};

// Check if prescription is expired
prescriptionSchema.methods.isExpired = function() {
  return new Date() > this.expiryDate;
};

// Indexes for efficient querying
prescriptionSchema.index({ patientId: 1, issuedDate: -1 });
prescriptionSchema.index({ doctorId: 1, issuedDate: -1 });
prescriptionSchema.index({ status: 1, expiryDate: 1 });
prescriptionSchema.index({ signature: 1 });
// Text index for search functionality
prescriptionSchema.index({
  patientName: 'text',
  doctorName: 'text',
  'medications.name': 'text',
  instructions: 'text'
});

export default mongoose.model('Prescription', prescriptionSchema);
