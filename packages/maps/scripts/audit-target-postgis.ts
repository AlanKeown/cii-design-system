import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { runTargetAudit } from './support/target-audit.ts';

/** Credentials remain in authorised libpq service/passfile configuration, never command arguments. */
const output = process.argv[2];
if (!output)
  throw new Error('Pass an output JSON path to retain the target audit.');
const service = process.env.CII_MAPS_AUDIT_SERVICE;
if (!service || !/^[\w.-]+$/.test(service))
  throw new Error(
    'Set CII_MAPS_AUDIT_SERVICE to an authorised read-only libpq service profile.'
  );
const run = promisify(execFile);
const report = await runTargetAudit(async (sql) => {
  const { stdout } = await run(
    'psql',
    [
      '-X',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=sqlstate',
      '-c',
      `BEGIN READ ONLY; SET LOCAL statement_timeout=15000; ${sql} COMMIT;`
    ],
    {
      env: {
        ...process.env,
        PGSERVICE: service,
        PGOPTIONS:
          '-c default_transaction_read_only=on -c statement_timeout=15000'
      },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024
    }
  );
  return JSON.parse(stdout.trim());
}, process.env.CII_MAPS_AUDIT_LABEL ?? service);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  `Wrote target audit: ${report.status}; ${report.comparisons.executed}/${report.comparisons.planned} comparisons, ${report.comparisons.unsupported} unsupported, ${report.comparisons.failed} failed.`
);
if (report.status === 'failed' || report.status === 'postgis-unavailable')
  process.exitCode = 1;
