import mongoose from 'mongoose';
import { getConfig } from './index.js';

/**
 * Connect to MongoDB using configuration from the unified config loader.
 * Config is validated on load, so we can assume db.uri is always present.
 */
const connectDB = async () => {
  const { db } = getConfig();

  try {
    await mongoose.connect(db.uri, db.options);
    // eslint-disable-next-line no-console
    console.log('MongoDB connected successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
