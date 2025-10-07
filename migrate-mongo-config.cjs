// migrate-mongo CommonJS config to support CommonJS migration files
require('dotenv').config();

const config = {
  mongodb: {
    url: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/uzima',
    databaseName: process.env.DB_NAME || 'uzima',
    options: {}
  },
  migrationsDir: 'src/migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.cjs',
  moduleSystem: 'commonjs'
};

module.exports = config;


