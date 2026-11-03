export function sessionCookiePolicy(url: URL) {
  const secure = url.protocol === 'https:';
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!secure && !localhost)
    throw new Error('Configured authentication requires HTTPS.');
  return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure };
}
