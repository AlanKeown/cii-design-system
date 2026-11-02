import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Capture first: a failed generation must never truncate checked-in types.
const types = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 8 * 1024 * 1024
  }
);
if (!types.includes('export type Database'))
  throw new Error('Supabase returned no database types.');
await writeFile(
  new URL(
    '../apps/community-portal/src/lib/backend/database.types.ts',
    import.meta.url
  ),
  types
);
