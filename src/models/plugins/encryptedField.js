import mongoose from 'mongoose';
import { encrypt, decrypt, isEncrypted, hashData } from '../../utils/encryptionUtils.js';
import { isClientEncrypted } from '../../utils/clientEncryptionServer.js';

const encryptedFieldPlugin = (schema, options) => {
  const fields = options.fields || [];

  // Add hash fields for searching
  const hashFields = {};
  fields.forEach(field => {
    // Add _hash field.
    hashFields[`${field}_hash`] = { type: String };
  });
  schema.add(hashFields);

  // Pre-save: Encrypt fields and populate hash
  schema.pre('save', function (next) {
    const doc = this;

    fields.forEach(field => {
      // Only encrypt if modified and exists
      if (doc.isModified(field) && doc[field]) {
        // If it's already encrypted (client-side or server-side), don't encrypt again
        const isAlreadyEncrypted = isClientEncrypted(doc[field]) || isEncrypted(doc[field]);
        
        if (!isAlreadyEncrypted) {
          // Check if field has lowercase option
          const fieldPath = schema.path(field);
          const shouldLowercase = fieldPath && fieldPath.options && fieldPath.options.lowercase;

          let val = doc[field];
          if (shouldLowercase && typeof val === 'string') val = val.toLowerCase();

          // Set the hash
          doc[`${field}_hash`] = hashData(val);
          // Encrypt the field
          doc[field] = encrypt(doc[field]);
        }
        // If already encrypted (client-side), store as-is without hashing
        // Note: Client-encrypted data cannot be searched via hash
      }
    });
    next();
  });

  // Post-init: Decrypt fields (only server-side encrypted fields)
  // Client-encrypted fields remain encrypted and are decrypted by the client
  schema.post('init', function (doc) {
    fields.forEach(field => {
      if (doc[field] && isEncrypted(doc[field]) && !isClientEncrypted(doc[field])) {
        doc[field] = decrypt(doc[field]);
      }
    });
  });

  // Post-save: Decrypt fields (only server-side encrypted fields)
  // Client-encrypted fields remain encrypted and are decrypted by the client
  schema.post('save', function (doc) {
    fields.forEach(field => {
      if (doc[field] && isEncrypted(doc[field]) && !isClientEncrypted(doc[field])) {
        doc[field] = decrypt(doc[field]);
      }
    });
  });

  // Intercept queries to use hash for search
  const queryMiddleware = function (next) {
    const query = this.getQuery();
    fields.forEach(field => {
      if (query[field] !== undefined) {
        // Check if field has lowercase option
        const fieldPath = schema.path(field);
        const shouldLowercase = fieldPath && fieldPath.options && fieldPath.options.lowercase;

        if (typeof query[field] === 'string') {
          let val = query[field];
          if (shouldLowercase) val = val.toLowerCase();
          query[`${field}_hash`] = hashData(val);
          delete query[field];
        } else if (typeof query[field] === 'object' && query[field] !== null) {
          // Handle $in operator
          if (query[field].$in && Array.isArray(query[field].$in)) {
            query[`${field}_hash`] = {
              ...query[field],
              $in: query[field].$in.map(val => {
                let v = val;
                if (shouldLowercase && typeof v === 'string') v = v.toLowerCase();
                return hashData(v);
              }),
            };
            delete query[field];
          }
        }
      }
    });
    next();
  };

  // Helper to decrypt a single document (only server-side encrypted fields)
  const decryptDocument = doc => {
    if (!doc) return;
    fields.forEach(field => {
      if (doc[field] && isEncrypted(doc[field]) && !isClientEncrypted(doc[field])) {
        doc[field] = decrypt(doc[field]);
      }
    });
  };

  schema.pre('find', queryMiddleware);
  schema.pre('findOne', queryMiddleware);
  schema.pre('findOneAndUpdate', queryMiddleware);
  schema.pre('countDocuments', queryMiddleware);
  schema.pre('deleteOne', queryMiddleware);
  schema.pre('deleteMany', queryMiddleware);
  schema.pre('updateOne', queryMiddleware);
  schema.pre('updateMany', queryMiddleware);

  // Post-find middleware to decrypt results explicitly
  // This is important for lean() queries or when init hooks might be bypassed
  schema.post('find', function (docs) {
    if (Array.isArray(docs)) {
      docs.forEach(doc => decryptDocument(doc));
    }
  });

  schema.post('findOne', function (doc) {
    decryptDocument(doc);
  });

  schema.post('findOneAndUpdate', function (doc) {
    decryptDocument(doc);
  });
};

export default encryptedFieldPlugin;
