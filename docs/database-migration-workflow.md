# Database Migration Workflow (#1326)

## Naming Convention
Migrations live in `src/database/migrations/` and are named
`<unix-timestamp-ms>-<PascalCaseDescription>.ts` (matches existing files,
e.g. `1700000000000-InitialSchema.ts`). The timestamp keeps ordering
unambiguous across contributors.

## Generating a Migration
```bash
npm run typeorm migration:generate -- src/database/migrations/<Name>
```

## Rollback / Recovery
- Every migration must implement both `up()` and `down()`.
- Before applying to a shared environment, run the migration against a
  restored snapshot of that environment's database first.
- If a migration must be reverted in production, run
  `typeorm migration:revert` and confirm row counts on affected tables
  before resuming traffic.

## CI Validation
CI should run `typeorm migration:run` against a disposable database on
every PR touching `src/database/migrations/**`, failing the build if any
migration errors or if `down()` does not cleanly reverse `up()`.
