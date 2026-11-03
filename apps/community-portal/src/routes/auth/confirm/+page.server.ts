import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { signedIn } from '#lib/server/auth.ts';
export const load: PageServerLoad = () => ({});
export const actions: Actions = {
  default: async (event) => {
    const token_hash = event.url.searchParams.get('token_hash') ?? '';
    const type = event.url.searchParams.get('type');
    if (
      !event.locals.supabase ||
      type !== 'email' ||
      !/^(?:pkce_)?(?:[a-f0-9]{56}|[a-f0-9]{64})$/i.test(token_hash)
    )
      return fail(400, {
        error: 'This link is invalid or expired. Request a new sign-in email.'
      });
    const { error } = await event.locals.supabase.auth.verifyOtp({
      token_hash,
      type
    });
    if (error)
      return fail(400, {
        error: 'This link is invalid or expired. Request a new sign-in email.'
      });
    signedIn(event);
  }
};
