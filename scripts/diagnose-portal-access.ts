// Read-only access checks. Never print response bodies, API keys or the token.
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN for this diagnostic.');
const base = 'https://api.supabase.com/v1/projects/kykbgwewulzceunbbsfa';
for (const [label, path] of [
  ['Project details', ''],
  ['Auth configuration', '/config/auth'],
  ['API keys without reveal', '/api-keys?reveal=false'],
  ['API keys with reveal (used by supabase link)', '/api-keys?reveal=true']
]) {
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000)
  });
  await response.body?.cancel();
  console.log(`${label}: HTTP ${response.status}`);
}
