import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  description: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'inactive'],
    default: 'active',
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

tenantSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

tenantSchema.index({ slug: 1 });
tenantSchema.index({ status: 1 });

export default mongoose.model('Tenant', tenantSchema);
