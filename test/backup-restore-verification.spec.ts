const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertNonProductionEnvironment,
  assertPlainDumpHasNoDatabaseSwitch,
  buildRecord,
  detectBackupFormat,
  determineResult,
  parseCriticalTables,
  parseDatabaseUrl,
  readConfig,
  renderMarkdownEntry,
} = require('../scripts/verify-backup-restore');

describe('backup restore verification', () => {
  let temporaryDirectory: string;
  let backupFile: string;

  const validEnvironment = (): NodeJS.ProcessEnv => ({
    RESTORE_VERIFY_BACKUP_FILE: backupFile,
    RESTORE_VERIFY_DATABASE_URL:
      'postgres://restore_user:p%40ssword@restore-db.example:55432/postgres?sslmode=require',
    RESTORE_VERIFY_ENVIRONMENT: 'staging',
    RESTORE_VERIFY_BACKUP_TIMESTAMP: '2026-10-19T02:00:00Z',
  });

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'uzima-restore-'));
    backupFile = path.join(temporaryDirectory, 'uzima-db.dump');
    fs.writeFileSync(backupFile, 'PGDMP');
  });

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('parses connection URLs and decodes credentials', () => {
    const parsed = parseDatabaseUrl(
      'postgresql://restore_user:p%40ssword@restore-db.example:55432/uzima?sslmode=require'
    );

    expect(parsed).toEqual({
      host: 'restore-db.example',
      port: 55432,
      user: 'restore_user',
      password: 'p@ssword',
      database: 'uzima',
      sslmode: 'require',
    });
    expect(parseDatabaseUrl('postgres://user@host').port).toBe(5432);
  });

  it('refuses production and requires an explicit non-production environment', () => {
    expect(() => assertNonProductionEnvironment('staging', { NODE_ENV: 'production' })).toThrow(
      'NODE_ENV=production'
    );
    expect(() => assertNonProductionEnvironment('', {})).toThrow('RESTORE_VERIFY_ENVIRONMENT');
    for (const environment of ['production', 'prod', 'prod-eu', 'eu-prod']) {
      expect(() => assertNonProductionEnvironment(environment, {})).toThrow('production-like');
    }
    expect(() => assertNonProductionEnvironment('staging', {})).not.toThrow();
  });

  it('rejects an unlabeled production-shaped target connection', () => {
    const environment = {
      ...validEnvironment(),
      RESTORE_VERIFY_PRODUCTION_DATABASE_URL:
        'postgres://production@restore-db.example:55432/uzima',
    };

    expect(() => readConfig(environment)).toThrow(
      'same server as RESTORE_VERIFY_PRODUCTION_DATABASE_URL'
    );
  });

  it('requires the backup, target URL, and environment', () => {
    expect(() => readConfig({})).toThrow('RESTORE_VERIFY_BACKUP_FILE is required');
    expect(() => readConfig({})).toThrow('RESTORE_VERIFY_DATABASE_URL is required');
    expect(() => readConfig({})).toThrow('RESTORE_VERIFY_ENVIRONMENT');
  });

  it('rejects missing backup files and unsafe critical table names', () => {
    const environment = validEnvironment();
    expect(() =>
      readConfig({ ...environment, RESTORE_VERIFY_BACKUP_FILE: path.join(temporaryDirectory, 'x') })
    ).toThrow('Backup file not found');
    expect(() =>
      readConfig({ ...environment, RESTORE_VERIFY_CRITICAL_TABLES: 'users;DROP TABLE users' })
    ).toThrow('invalid table name');
    expect(parseCriticalTables('users, health_tasks')).toEqual(['users', 'health_tasks']);
  });

  it('detects custom, plain, and directory backups', () => {
    const plain = path.join(temporaryDirectory, 'backup.sql');
    fs.writeFileSync(plain, 'SELECT 1;');
    const signature = path.join(temporaryDirectory, 'backup.bin');
    fs.writeFileSync(signature, 'PGDMP\x01');
    const directory = path.join(temporaryDirectory, 'backup.dump');
    fs.mkdirSync(directory);

    expect(detectBackupFormat(plain)).toBe('plain');
    expect(detectBackupFormat(signature)).toBe('custom');
    expect(detectBackupFormat(directory)).toBe('directory');
  });

  it('rejects plain dumps that could switch databases during restore', () => {
    const connectDump = path.join(temporaryDirectory, 'connect.sql');
    fs.writeFileSync(connectDump, '\\connect production\nSELECT 1;');
    const createDump = path.join(temporaryDirectory, 'create.sql');
    fs.writeFileSync(createDump, 'CREATE DATABASE production;\n');

    expect(() => assertPlainDumpHasNoDatabaseSwitch(connectDump)).toThrow('database switch');
    expect(() => assertPlainDumpHasNoDatabaseSwitch(createDump)).toThrow('database switch');
    expect(() => assertPlainDumpHasNoDatabaseSwitch(backupFile)).not.toThrow();
  });

  it('classifies results, including cleanup failures', () => {
    const successfulRestore = { exitCode: 0, errors: [] };
    const successfulChecks = { tableCount: 4, errors: [] };

    expect(determineResult(successfulRestore, successfulChecks, null)).toBe('PASS');
    expect(determineResult(successfulRestore, successfulChecks, 'drop failed')).toBe('PARTIAL');
    expect(
      determineResult({ exitCode: 1, errors: ['restore failed'] }, successfulChecks, null)
    ).toBe('FAIL');
    expect(
      determineResult(successfulRestore, { tableCount: 0, errors: ['no tables'] }, null)
    ).toBe('FAIL');
  });

  it('records the backup timestamp, result, and restore errors', () => {
    const config = readConfig(validEnvironment());
    const record = buildRecord(config, {
      startedAt: new Date('2026-10-19T02:05:00Z'),
      backupTimestamp: '2026-10-19T02:00:00Z',
      backupSizeBytes: 5,
      backupSha256: 'abc123',
      format: 'custom',
      restore: { command: 'pg_restore', exitCode: 0, timedOut: false, stdout: '', stderr: '' },
      checks: {
        connection: true,
        tableCount: 3,
        constraintCount: 2,
        indexCount: 4,
        criticalTables: { users: { exists: true, rowCount: 7 } },
        errors: [],
      },
      result: 'PASS',
      restoreErrors: [],
      dropped: true,
      cleanupError: null,
    });

    expect(record.backupTimestamp).toBe('2026-10-19T02:00:00Z');
    expect(record.result).toBe('PASS');
    expect(record.restoreErrors).toEqual([]);
    expect(record.backup.sha256).toBe('abc123');
    expect(record.verification.target.database).toMatch(/^uzima_restore_verify_/);
  });

  it('renders a markdown record with the required fields', () => {
    const entry = renderMarkdownEntry({
      recordedAt: '2026-10-19T02:10:00.000Z',
      backupTimestamp: '2026-10-19T02:00:00Z',
      result: 'FAIL',
      restoreErrors: ['pg_restore exited with status 1'],
      backup: { file: '/backups/uzima-db.dump' },
      verification: {
        operator: 'on-call',
        environment: 'staging',
        target: { database: 'uzima_restore_verify_1' },
        startedAt: '2026-10-19T02:05:00.000Z',
        completedAt: '2026-10-19T02:06:00.000Z',
        durationMs: 60000,
      },
      checks: { tableCount: 0, criticalTables: {}, constraintCount: 0, indexCount: 0 },
    });

    expect(entry).toContain('**Backup timestamp:** 2026-10-19T02:00:00Z');
    expect(entry).toContain('**Result:** FAIL');
    expect(entry).toContain('pg_restore exited with status 1');
    expect(entry).toContain('**Non-prod target:** staging');
  });
});
