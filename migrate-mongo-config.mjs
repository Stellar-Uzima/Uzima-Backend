import { config as dotenvConfig } from "dotenv";
dotenvConfig();

const config = {
  mongodb: {
    url: process.env.MONGO_URI || "mongodb://localhost:27017/uzima_dev",
    databaseName: process.env.DB_NAME || "uzima_dev",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  migrationFileExtension: ".js",
};

export default config;
