export function resolveAuthConfig(url?: string, key?: string) {
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error(
      'Set both PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  const parsed = new URL(url);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error('Invalid PUBLIC_SUPABASE_URL.');
  return { url, key };
}
