import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Patient from '../src/models/patient.model.js';
import Record from '../src/models/Record.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const ENCRYPTED_MODELS = [
  { model: User, fields: ['email'] },
  { model: Patient, fields: ['email', 'phoneNumber', 'address'] },
  { model: Record, fields: ['diagnosis', 'treatment', 'history'] },
];

async function rotateKeys() {
  console.log('Starting key rotation...');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const currentVersion = process.env.ENCRYPTION_KEY_CURRENT_VERSION;
    console.log(`Current encryption key version in env: ${currentVersion}`);

    if (!currentVersion) {
      throw new Error('ENCRYPTION_KEY_CURRENT_VERSION is not defined');
    }

    for (const { model, fields } of ENCRYPTED_MODELS) {
      console.log(`Processing model: ${model.modelName}`);

      const cursor = model.find({}).cursor();
      let count = 0;

      for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        // Just by saving, the pre-save hook will re-encrypt with the current key version
        // We need to mark fields as modified if they are not already (though finding them triggers decryption, saving triggers encryption)
        // Actually, the plugin decrypts on init/find. So doc properties are plain text in memory.
        // When we save, the pre-save hook encrypts them using the CURRENT version from env.
        // So we just need to save the document.

        // To be safe, we can explicitly mark them as modified
        fields.forEach(field => {
          if (doc[field]) {
            doc.markModified(field);
          }
        });

        await doc.save();
        count++;
        if (count % 100 === 0) {
          console.log(`Processed ${count} documents for ${model.modelName}`);
        }
      }
      console.log(`Finished ${model.modelName}: ${count} documents re-encrypted.`);
    }

    console.log('Key rotation completed successfully.');
  } catch (error) {
    console.error('Key rotation failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

rotateKeys();
