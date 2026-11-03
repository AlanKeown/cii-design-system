import { sessionCookiePolicy } from '#lib/server/cookie-policy.ts';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit/hooks';
import * as env from '$app/env/public';
import { resolveAuthConfig } from '#lib/server/auth-config.ts';
import { safeNext } from '#lib/server/redirect.ts';
import type { Database } from '#lib/backend/database.types.ts';

export const handle: Handle = async ({ event, resolve }) => {
  const config = resolveAuthConfig(
    env.PUBLIC_SUPABASE_URL,
    env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  Object.assign(event.locals, {
    supabase: null,
    user: null,
    configured: !!config,
    mode: 'local'
  });
  const cacheHeaders = new Headers();
  const changedCookies: string[] = [];
  if (config) {
    const policy = sessionCookiePolicy(event.url);
    const client = createServerClient<Database>(config.url, config.key, {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookies, headers) => {
          for (const { name, value, options } of cookies) {
            const attributes = { ...options, ...policy };
            event.cookies.set(name, value, attributes);
            changedCookies.push(
              event.cookies.serialize(name, value, attributes)
            );
          }
          for (const [name, value] of Object.entries(headers ?? {}))
            cacheHeaders.set(name, value);
        }
      }
    });
    event.locals.supabase = client;
    try {
      const { data, error } = await client.auth.getClaims();
      if (!error && data?.claims.sub)
        event.locals.user = {
          id: data.claims.sub,
          email:
            typeof data.claims.email === 'string' ? data.claims.email : null
        };
    } catch {
      /* Bad or expired cookies recover through the sign-in page. */
    }
    event.locals.mode = event.locals.user
      ? 'signed-in'
      : event.cookies.get('portal-mode') === 'local'
        ? 'local'
        : 'signed-out';
  }
  const path = event.url.pathname;
  const authRoute = [
    '/auth',
    '/auth/confirm',
    '/auth/callback',
    '/auth/signout'
  ].includes(path);
  let response: Response;
  let resolved = false;
  if (
    config &&
    event.locals.mode === 'signed-out' &&
    path.startsWith('/api/')
  ) {
    response = Response.json({ error: 'Sign in required.' }, { status: 401 });
  } else if (
    config &&
    event.locals.mode === 'signed-out' &&
    !authRoute &&
    path !== '/privacy' &&
    event.route.id !== null
  ) {
    const location =
      '/auth?next=' + encodeURIComponent(safeNext(path + event.url.search));
    // Return data redirects directly: Kit's conversion of hook 303 responses
    // otherwise discards cookie deletions made while recovering a bad session.
    response = event.isDataRequest
      ? Response.json({ type: 'redirect', status: 303, location })
      : new Response(null, { status: 303, headers: { location } });
  } else {
    response = await resolve(event);
    resolved = true;
  }
  if (!resolved)
    for (const cookie of changedCookies)
      response.headers.append('set-cookie', cookie);
  if (config || authRoute || event.request.headers.has('cookie')) {
    // Clone so endpoint redirects with immutable headers are safe too.
    response = new Response(response.body, response);
    cacheHeaders.forEach((value, name) => response.headers.set(name, value));
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('pragma', 'no-cache');
    response.headers.set('expires', '0');
    response.headers.set('referrer-policy', 'strict-origin');
  }
  return response;
};
