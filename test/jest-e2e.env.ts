import { TestDatabaseManager } from './database-manager';
import { useTestDatabaseEnvironment } from './database-config';

// Runs before AppModule imports; validate before any application connection.
useTestDatabaseEnvironment(TestDatabaseManager.getInstance().settings);
process.env.JWT_SECRET ||= 'e2e-only-jwt-secret';
process.env.JWT_REFRESH_SECRET ||= 'e2e-only-refresh-secret';
