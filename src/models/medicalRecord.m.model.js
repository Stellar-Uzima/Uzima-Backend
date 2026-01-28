import mongoose from 'mongoose';
import * as elasticsearchService from '../services/elasticsearchService.js';

const medicalRecordSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
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
  diagnosis: 'text',
  treatment: 'text',
  notes: 'text',
});

// Elasticsearch auto-sync hooks
// Post-save hook: Index new or updated records
medicalRecordSchema.post('save', async function (doc) {
  try {
    // Populate patient data before indexing
    const populated = await doc.populate('patientId', 'firstName lastName email');

    const indexData = {
      diagnosis: doc.diagnosis || '',
      treatment: doc.treatment || '',
      notes: doc.notes || '',
      patientId: populated.patientId?._id?.toString() || '',
      patientName: populated.patientId
        ? `${populated.patientId.firstName || ''} ${populated.patientId.lastName || ''}`.trim()
        : '',
      patientEmail: populated.patientId?.email || '',
      createdAt: doc.createdAt,
    };

    await elasticsearchService.indexDocument(doc._id.toString(), indexData);
  } catch (error) {
    // Log error but don't fail the save operation
    console.error(`Failed to index medical record ${doc._id} to Elasticsearch:`, error.message);
  }
});

// Post-remove hook: Delete from Elasticsearch index
medicalRecordSchema.post('remove', async function (doc) {
  try {
    await elasticsearchService.deleteDocument(doc._id.toString());
  } catch (error) {
    console.error(`Failed to delete medical record ${doc._id} from Elasticsearch:`, error.message);
  }
});

// Post-findOneAndDelete hook: Handle deletion via findOneAndDelete
medicalRecordSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    try {
      await elasticsearchService.deleteDocument(doc._id.toString());
    } catch (error) {
      console.error(
        `Failed to delete medical record ${doc._id} from Elasticsearch:`,
        error.message
      );
    }
  }
});

export default mongoose.model('MedicalRecord', medicalRecordSchema);
