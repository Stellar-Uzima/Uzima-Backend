/* eslint-disable prettier/prettier */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import i18next from 'i18next';
import i18nextMiddleware from 'i18next-http-middleware';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let replset;

beforeAll(async () => {
  // Setup MongoDB as a replica set to support transactions
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const mongoUri = replset.getUri();
  await mongoose.connect(mongoUri);

  // Setup i18next
  await i18next
    .use(Backend)
    .use(i18nextMiddleware.LanguageDetector)
    .init({
      backend: {
        loadPath: path.join(__dirname, '../locales/{{lng}}/translation.json'),
      },
      fallbackLng: 'en',
      preload: ['en', 'fr', 'sw'],
      supportedLngs: ['en', 'fr', 'sw'],
      ns: ['translation'],
      defaultNS: 'translation',
      detection: {
        order: ['query', 'header'],
        lookupQuerystring: 'lang',
        lookupHeader: 'accept-language',
      },
    });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});
