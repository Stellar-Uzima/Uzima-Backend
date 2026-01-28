/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import softDeletePlugin from './plugins/softDeletePlugin.js';

const permissionSchema = new mongoose.Schema(
  {
    resource: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 50,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: ['read', 'create', 'update', 'delete', 'manage'],
      index: true,
    },
    roles: {
      type: [String],
      required: true,
      enum: ['admin', 'doctor', 'educator', 'patient'],
      validate: {
        validator: function (roles) {
          return roles && roles.length > 0;
        },
        message: 'At least one role must be specified',
      },
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index on resource and action
permissionSchema.index({ resource: 1, action: 1 }, { unique: true });

// Index on roles array for fast lookups
permissionSchema.index({ roles: 1 });

// Instance method to check if a role has this permission
permissionSchema.methods.hasRole = function (role) {
  return this.roles.includes(role);
};

// Static method to find permissions by role
permissionSchema.statics.findByRole = function (role) {
  return this.find({ roles: role });
};

// Static method to find permission by resource and action
permissionSchema.statics.findByResourceAction = function (resource, action) {
  return this.findOne({ resource, action });
};

// Apply soft delete plugin
permissionSchema.plugin(softDeletePlugin);

const Permission = mongoose.model('Permission', permissionSchema);

export default Permission;
