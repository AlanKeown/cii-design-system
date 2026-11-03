import { redirect, type RequestEvent } from '@sveltejs/kit';
import { safeNext } from './redirect.ts';
export const nextCookie = 'portal-auth-next';
export function rememberNext(event: RequestEvent, value: unknown) {
  event.cookies.set(nextCookie, safeNext(value), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: event.url.protocol === 'https:',
    maxAge: 900
  });
}
export function signedIn(event: RequestEvent): never {
  for (const { name } of event.cookies.getAll())
    if (name.startsWith('sb-') && name.endsWith('-code-verifier'))
      event.cookies.delete(name, { path: '/' });
  const next = safeNext(event.cookies.get(nextCookie));
  event.cookies.delete(nextCookie, { path: '/' });
  event.cookies.delete('portal-mode', { path: '/' });
  redirect(303, next);
}
