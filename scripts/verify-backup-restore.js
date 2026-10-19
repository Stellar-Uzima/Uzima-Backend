#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_CRITICAL_TABLES = ['users', 'health_tasks', 'organizations'];
const DEFAULT_MAINTENANCE_DATABASE = 'postgres';
const DEFAULT_RESTORE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_TAIL = 8000;
const TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const PRODUCTION_ENVIRONMENT_PATTERN =
  /^((prod|production)([-_].*)?|.*[-_](prod|production))$/i;

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDatabaseUrl(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('RESTORE_VERIFY_DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('RESTORE_VERIFY_DATABASE_URL must use the postgres:// scheme');
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('RESTORE_VERIFY_DATABASE_URL contains an invalid port');
  }
  return {
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || DEFAULT_MAINTENANCE_DATABASE,
    sslmode: url.searchParams.get('sslmode') || undefined,
  };
}

function parseCriticalTables(value) {
  if (!value) return [...DEFAULT_CRITICAL_TABLES];
  const tables = value
    .split(',')
    .map((table) => table.trim())
    .filter(Boolean);
  if (tables.length === 0) return [...DEFAULT_CRITICAL_TABLES];
  for (const table of tables) {
    if (!TABLE_NAME_PATTERN.test(table)) {
      throw new Error(`RESTORE_VERIFY_CRITICAL_TABLES contains an invalid table name: ${table}`);
    }
  }
  return tables;
}

function assertNonProductionEnvironment(environment, env = process.env) {
  if (!environment || !environment.trim()) {
    throw new Error(
      'RESTORE_VERIFY_ENVIRONMENT must name the non-production target (for example staging or local)'
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run restore verification with NODE_ENV=production');
  }
  const normalized = environment.trim().toLowerCase();
  const explicitlyNonProduction = /^non[-_]/.test(normalized);
  if (!explicitlyNonProduction && PRODUCTION_ENVIRONMENT_PATTERN.test(normalized)) {
    throw new Error(
      `Refusing to run restore verification against production-like environment: ${environment}`
    );
  }
}

function readConfig(env = process.env) {
  const errors = [];
  const backupFile = env.RESTORE_VERIFY_BACKUP_FILE
    ? path.resolve(env.RESTORE_VERIFY_BACKUP_FILE)
    : '';
  const databaseUrl = env.RESTORE_VERIFY_DATABASE_URL || '';
  const environment = (env.RESTORE_VERIFY_ENVIRONMENT || '').trim();

  if (!backupFile) errors.push('RESTORE_VERIFY_BACKUP_FILE is required');
  if (!databaseUrl) errors.push('RESTORE_VERIFY_DATABASE_URL is required');

  try {
    assertNonProductionEnvironment(environment, env);
  } catch (error) {
    errors.push(error.message);
  }

  if (backupFile && !fs.existsSync(backupFile)) {
    errors.push(`Backup file not found: ${backupFile}`);
  }

  let criticalTables = [];
  try {
    criticalTables = parseCriticalTables(env.RESTORE_VERIFY_CRITICAL_TABLES);
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const parsed = parseDatabaseUrl(databaseUrl);
  if (env.RESTORE_VERIFY_PRODUCTION_DATABASE_URL) {
    const production = parseDatabaseUrl(env.RESTORE_VERIFY_PRODUCTION_DATABASE_URL);
    if (production.host === parsed.host && production.port === parsed.port) {
      errors.push(
        'RESTORE_VERIFY_DATABASE_URL points at the same server as RESTORE_VERIFY_PRODUCTION_DATABASE_URL'
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, 'Z');
  const outputFile = env.RESTORE_VERIFY_OUTPUT_FILE
    ? path.resolve(env.RESTORE_VERIFY_OUTPUT_FILE)
    : path.resolve(
        process.cwd(),
        'backup-restore-verifications',
        `restore-verification-${timestamp}.json`
      );

  return {
    backupFile,
    databaseUrl,
    database: parsed,
    environment,
    backupTimestamp: env.RESTORE_VERIFY_BACKUP_TIMESTAMP || null,
    criticalTables,
    maintenanceDatabase: env.RESTORE_VERIFY_MAINTENANCE_DB || DEFAULT_MAINTENANCE_DATABASE,
    targetDatabase: createTargetDatabaseName(),
    outputFile,
    logFile: env.RESTORE_VERIFY_LOG_FILE ? path.resolve(env.RESTORE_VERIFY_LOG_FILE) : null,
    keepDatabase: parseBoolean(env.RESTORE_VERIFY_KEEP_DATABASE),
    restoreTimeoutMs: parseInteger(env.RESTORE_VERIFY_TIMEOUT_MS, DEFAULT_RESTORE_TIMEOUT_MS),
    operator: env.RESTORE_VERIFY_OPERATOR || os.userInfo().username,
  };
}

function createTargetDatabaseName() {
  const suffix = crypto.randomBytes(6).toString('hex');
  return `uzima_restore_verify_${Date.now()}_${suffix}`;
}

function detectBackupFormat(backupFile) {
  const stats = fs.statSync(backupFile);
  if (stats.isDirectory()) return 'directory';
  const extension = path.extname(backupFile).toLowerCase();
  if (extension === '.sql') return 'plain';
  if (['.dump', '.backup', '.tar'].includes(extension)) return 'custom';

  const descriptor = fs.openSync(backupFile, 'r');
  try {
    const header = Buffer.alloc(5);
    fs.readSync(descriptor, header, 0, header.length, 0);
    return header.toString('ascii') === 'PGDMP' ? 'custom' : 'plain';
  } finally {
    fs.closeSync(descriptor);
  }
}

function assertPlainDumpHasNoDatabaseSwitch(backupFile) {
  const stats = fs.statSync(backupFile);
  if (!stats.isFile()) return;
  const descriptor = fs.openSync(backupFile, 'r');
  let content;
  try {
    const buffer = Buffer.alloc(Math.min(stats.size, 1024 * 1024));
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    content = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    fs.closeSync(descriptor);
  }
  const switchPattern = /^\s*(\\connect|CREATE\s+DATABASE)/im;
  if (switchPattern.test(content)) {
    throw new Error(
      'Plain SQL backup contains a database switch (\\connect or CREATE DATABASE). ' +
        'Create a database-scoped dump instead so verification cannot write outside the scratch database.'
    );
  }
}

function restoreEnv(config, parsed) {
  const env = { ...process.env, PGPASSWORD: parsed.password };
  if (parsed.sslmode) env.PGSSLMODE = parsed.sslmode;
  return env;
}

function restoreCommand(format, config, parsed) {
  const connectionArgs = [
    '-h',
    parsed.host,
    '-p',
    String(parsed.port),
    '-U',
    parsed.user,
    '-d',
    config.targetDatabase,
  ];
  if (format === 'plain') {
    return {
      command: 'psql',
      args: ['-v', 'ON_ERROR_STOP=1', ...connectionArgs, '-f', config.backupFile],
    };
  }
  return {
    command: 'pg_restore',
    args: [
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--verbose',
      ...connectionArgs,
      config.backupFile,
    ],
  };
}

function truncate(value) {
  if (!value) return '';
  return value.length > MAX_OUTPUT_TAIL ? value.slice(-MAX_OUTPUT_TAIL) : value;
}

function runRestore(config, parsed, format) {
  if (format === 'plain') {
    assertPlainDumpHasNoDatabaseSwitch(config.backupFile);
  }
  const { command, args } = restoreCommand(format, config, parsed);
  const result = spawnSync(command, args, {
    env: restoreEnv(config, parsed),
    encoding: 'utf8',
    timeout: config.restoreTimeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  const errors = [];
  if (result.error) {
    errors.push(`${command} failed to run: ${result.error.message}`);
  } else if (result.status !== 0) {
    const reason =
      result.status === null
        ? 'terminated before completion'
        : `exited with status ${result.status}`;
    errors.push(`${command} ${reason}${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  }
  return {
    command: [command, ...args].join(' '),
    exitCode: result.status,
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    errors,
  };
}

function quoteIdentifier(identifier) {
  if (!TABLE_NAME_PATTERN.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function createDatabase(client, databaseName) {
  await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
}

async function dropDatabase(client, databaseName) {
  await client.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [databaseName]
  );
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
}

async function runChecks(client, criticalTables) {
  const checks = {
    connection: false,
    tableCount: 0,
    migrationCount: null,
    constraintCount: 0,
    indexCount: 0,
    criticalTables: {},
    errors: [],
  };
  const connectivity = await client.query('SELECT 1 AS ok');
  checks.connection = connectivity.rows[0].ok === 1;

  const tables = await client.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  checks.tableCount = tables.rows[0].count;
  if (checks.tableCount === 0) {
    checks.errors.push('Restored database contains no application tables');
  }

  const constraints = await client.query(
    "SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace = 'public'::regnamespace"
  );
  checks.constraintCount = constraints.rows[0].count;

  const indexes = await client.query(
    "SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname = 'public'"
  );
  checks.indexCount = indexes.rows[0].count;

  const migrations = await client.query("SELECT to_regclass('public.migrations') AS name");
  if (migrations.rows[0].name) {
    const migrationRows = await client.query('SELECT count(*)::int AS count FROM migrations');
    checks.migrationCount = migrationRows.rows[0].count;
  }

  for (const table of criticalTables) {
    const exists = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
    if (!exists.rows[0].name) {
      checks.criticalTables[table] = { exists: false, rowCount: null };
      checks.errors.push(`Critical table is missing after restore: ${table}`);
      continue;
    }
    const rows = await client.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(table)}`);
    checks.criticalTables[table] = { exists: true, rowCount: rows.rows[0].count };
  }

  return checks;
}

async function hashFile(backupFile) {
  const stats = fs.statSync(backupFile);
  if (!stats.isFile()) return null;
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(backupFile);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function determineResult(restore, checks, cleanupError) {
  const restoreFailed = !restore || restore.errors.length > 0 || restore.exitCode !== 0;
  const checksFailed = !checks || checks.errors.length > 0 || checks.tableCount === 0;
  if (restoreFailed || checksFailed) return 'FAIL';
  if (cleanupError) return 'PARTIAL';
  return 'PASS';
}

function buildRecord(config, details) {
  const completedAt = new Date();
  const startedAt = details.startedAt || completedAt;
  return {
    version: 1,
    recordedAt: completedAt.toISOString(),
    backupTimestamp: config.backupTimestamp || details.backupTimestamp,
    result: details.result,
    restoreErrors: details.restoreErrors,
    backup: {
      file: config.backupFile,
      timestamp: config.backupTimestamp || details.backupTimestamp,
      sizeBytes: details.backupSizeBytes,
      sha256: details.backupSha256,
      format: details.format,
    },
    verification: {
      environment: config.environment,
      operator: config.operator,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      target: {
        host: config.database.host,
        port: config.database.port,
        database: config.targetDatabase,
        maintenanceDatabase: config.maintenanceDatabase,
      },
      backupFile: config.backupFile,
    },
    restore: details.restore
      ? {
          command: details.restore.command,
          exitCode: details.restore.exitCode,
          timedOut: details.restore.timedOut,
          stdout: details.restore.stdout,
          stderr: details.restore.stderr,
        }
      : null,
    checks: details.checks,
    cleanup: {
      dropped: details.dropped,
      error: details.cleanupError,
    },
  };
}

function renderMarkdownEntry(record) {
  const errors = record.restoreErrors.length > 0 ? record.restoreErrors.join('; ') : 'none';
  const tableCount = record.checks ? record.checks.tableCount : 0;
  return [
    `### Restore Verification - ${record.recordedAt.slice(0, 10)}`,
    '',
    `- **Backup timestamp:** ${record.backupTimestamp}`,
    `- **Backup identifier/location:** ${record.backup.file}`,
    `- **Verified by:** ${record.verification.operator}`,
    `- **Non-prod target:** ${record.verification.environment} (${record.verification.target.database})`,
    `- **Restore started:** ${record.verification.startedAt}`,
    `- **Restore completed:** ${record.verification.completedAt}`,
    `- **Duration:** ${record.verification.durationMs}ms`,
    `- **Result:** ${record.result}`,
    `- **Errors:** ${errors}`,
    `- **Verification checks:**`,
    `  - Table count: ${tableCount}`,
    `  - Critical tables: ${JSON.stringify(
      record.checks ? record.checks.criticalTables : {}
    )}`,
    `  - Constraints: ${record.checks ? record.checks.constraintCount : 0}`,
    `  - Indexes: ${record.checks ? record.checks.indexCount : 0}`,
    '',
  ].join('\n');
}

function writeRecord(record, outputFile, logFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${renderMarkdownEntry(record)}\n`, 'utf8');
  }
}

async function verifyRestore(config) {
  const { Client } = require('pg');
  const startedAt = new Date();
  const format = detectBackupFormat(config.backupFile);
  const backupSizeBytes = fs.statSync(config.backupFile).size;
  const backupSha256 = await hashFile(config.backupFile);
  const backupTimestamp =
    config.backupTimestamp || fs.statSync(config.backupFile).mtime.toISOString();

  let adminClient = null;
  let restoredClient = null;
  let restore = null;
  let checks = null;
  let dropped = false;
  let cleanupError = null;
  const restoreErrors = [];

  try {
    adminClient = new Client({
      connectionString: config.databaseUrl,
      database: config.maintenanceDatabase,
      connectionTimeoutMillis: 10000,
    });
    await adminClient.connect();
    await createDatabase(adminClient, config.targetDatabase);

    restore = runRestore(config, config.database, format);
    restoreErrors.push(...restore.errors);

    if (restore.exitCode === 0 && restore.errors.length === 0) {
      restoredClient = new Client({
        connectionString: config.databaseUrl,
        database: config.targetDatabase,
        connectionTimeoutMillis: 10000,
      });
      await restoredClient.connect();
      checks = await runChecks(restoredClient, config.criticalTables);
      restoreErrors.push(...checks.errors);
    }
  } catch (error) {
    restoreErrors.push(error.message);
  } finally {
    if (restoredClient) {
      await restoredClient.end().catch((error) => restoreErrors.push(error.message));
    }
    if (adminClient) {
      if (!config.keepDatabase) {
        try {
          await dropDatabase(adminClient, config.targetDatabase);
          dropped = true;
        } catch (error) {
          cleanupError = error.message;
        }
      }
      await adminClient.end().catch((error) => restoreErrors.push(error.message));
    }
  }

  if (!checks && restoreErrors.length > 0) {
    checks = { connection: false, tableCount: 0, criticalTables: {}, errors: [...restoreErrors] };
  }

  const result = determineResult(restore, checks, cleanupError);
  const record = buildRecord(config, {
    startedAt,
    backupTimestamp,
    backupSizeBytes,
    backupSha256,
    format,
    restore,
    checks,
    result,
    restoreErrors,
    dropped,
    cleanupError,
  });
  writeRecord(record, config.outputFile, config.logFile);
  return record;
}

async function main(env = process.env) {
  try {
    const config = readConfig(env);
    const record = await verifyRestore(config);
    process.stdout.write(
      `Restore verification ${record.result}: ${record.backupTimestamp} -> ${record.verification.target.database}\n`
    );
    process.stdout.write(`Record written to ${config.outputFile}\n`);
    if (record.restoreErrors.length > 0) {
      const errors = record.restoreErrors.map((error) => `- ${error}`).join('\n');
      process.stderr.write(`Errors:\n${errors}\n`);
    }
    process.exitCode = record.result === 'PASS' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`Restore verification could not start: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  DEFAULT_CRITICAL_TABLES,
  assertNonProductionEnvironment,
  assertPlainDumpHasNoDatabaseSwitch,
  buildRecord,
  createTargetDatabaseName,
  detectBackupFormat,
  determineResult,
  main,
  parseCriticalTables,
  parseDatabaseUrl,
  readConfig,
  renderMarkdownEntry,
  verifyRestore,
};
