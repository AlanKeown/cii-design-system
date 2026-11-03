import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_AUTH_GITHUB_ENABLED } from '$app/env/public';
import { signedIn } from '#lib/server/auth.ts';
export const GET: RequestHandler = async (event) => {
  const code = event.url.searchParams.get('code');
  if (
    event.locals.supabase &&
    PUBLIC_AUTH_GITHUB_ENABLED === 'true' &&
    code &&
    code.length <= 2048
  ) {
    const { error } =
      await event.locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) signedIn(event);
  }
  redirect(303, '/auth?error=callback');
};
