import { execFileSync, spawnSync } from 'node:child_process';

let started = false;
function status(): Record<string, string> {
  // Never print this output: status also contains local service credentials.
  return JSON.parse(
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  );
}
try {
  let config: Record<string, string>;
  try {
    config = status();
  } catch {
    try {
      execFileSync('npm', ['run', 'db:start'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch {
      throw new Error(
        'Local Supabase could not start. Check Docker and run npm run db:start.'
      );
    }
    started = true;
    config = status();
  }
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--project', 'portal-live'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORTAL_LIVE: '1',
        PUBLIC_SUPABASE_URL: config.API_URL,
        PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          config.PUBLISHABLE_KEY ?? config.ANON_KEY
      }
    }
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (started) execFileSync('npm', ['run', 'db:stop'], { stdio: 'inherit' });
}
