// migrate-mongo config file (default name that migrate-mongo looks for)
// This uses CommonJS format to work with migrate-mongo and .cjs migration files
require('dotenv').config();

const config = {
  mongodb: {
    url: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/uzima',
    databaseName: process.env.DB_NAME || 'uzima',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  migrationsDir: 'src/migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.cjs',
  moduleSystem: 'commonjs'
};

module.exports = config;
