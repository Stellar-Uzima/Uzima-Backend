// migrate-mongo config file (default name that migrate-mongo looks for)
// Uses ES module syntax since package.json has "type": "module"
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const config = {
  mongodb: {
    url: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/uzima',
    databaseName: process.env.DB_NAME || 'uzima',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  migrationsDir: 'src/migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.cjs',
  moduleSystem: 'commonjs',
};

export default config;
