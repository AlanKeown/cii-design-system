import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { accuracyOracleImage } from '../../tests/support/accuracy-cases.ts';
const run = promisify(execFile);
export const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Disposable pinned oracle only. No application connection strings or host ports. */
export async function withPostgis<T>(
  work: (query: (sql: string) => Promise<string>, port?: number) => Promise<T>,
  options: {
    publishLoopback?: boolean;
    grids?: readonly { path: string; name: string }[];
  } = {}
): Promise<T> {
  const name = `cii-maps-spike-${randomUUID()}`;
  try {
    await run(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        name,
        ...(options.publishLoopback
          ? ['--publish', '127.0.0.1::5432']
          : ['--network', 'none']),
        '--tmpfs',
        '/var/lib/postgresql/data:rw',
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        accuracyOracleImage
      ],
      { timeout: 60_000 }
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await run(
          'docker',
          ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
          { timeout: 5000 }
        );
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!ready) throw new Error('Disposable PostGIS did not become ready.');
    for (const grid of options.grids ?? []) {
      if (!/^[a-zA-Z0-9_.-]+\.tif$/.test(grid.name))
        throw new Error('Invalid grid basename.');
      await run('docker', [
        'cp',
        grid.path,
        `${name}:/usr/share/proj/${grid.name}`
      ]);
    }
    const query = (sql: string) =>
      new Promise<string>((resolve, reject) => {
        const child = execFile(
          'docker',
          [
            'exec',
            '-i',
            name,
            'psql',
            '-X',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-Atq',
            '-v',
            'ON_ERROR_STOP=1'
          ],
          { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error)
              reject(new Error(`Disposable PostGIS query failed: ${stderr}`));
            else resolve(stdout.trim());
          }
        );
        child.stdin?.on('error', () => {});
        child.stdin?.end(sql);
      });
    await query('CREATE EXTENSION IF NOT EXISTS postgis;');
    const port = options.publishLoopback
      ? Number(
          (await run('docker', ['port', name, '5432/tcp'])).stdout
            .trim()
            .split(':')
            .at(-1)
        )
      : undefined;
    return await work(query, port);
  } finally {
    await run('docker', ['rm', '--force', name], { timeout: 15_000 }).catch(
      () => {}
    );
  }
}
