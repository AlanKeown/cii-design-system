import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nextCookie } from '#lib/server/auth.ts';
export const POST: RequestHandler = async (event) => {
  try {
    await event.locals.supabase?.auth.signOut({ scope: 'local' });
  } catch {
    /* Always clear this browser's session when the provider is unavailable. */
  }
  for (const { name } of event.cookies.getAll())
    if (name.startsWith('sb-') || name === 'portal-mode' || name === nextCookie)
      event.cookies.delete(name, { path: '/' });
  redirect(303, '/auth');
};
