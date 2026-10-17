import { InitialSchema1700000000000 } from '../../src/database/migrations/1700000000000-InitialSchema';
import { TestDatabaseManager } from '../database-manager';

// Exercise the actual Jest lifecycle against an existing project migration.
// The complete application suite continues to use its default entities/migrations.
TestDatabaseManager.getInstance({ entities: [], migrations: [InitialSchema1700000000000] });
