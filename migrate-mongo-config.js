// migrate-mongo-config.js
require('dotenv').config();

const config = {
  mongodb: {
    url: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/uzima",
    databaseName: "uzima",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  migrationFileExtension: ".js",

  moduleSystem: "commonjs",
};

module.exports = config;
