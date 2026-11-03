import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../backend/database.types.ts';

export const authFailure =
  'Unable to sign in. Check your details or request a new code and try again shortly.';

/** Keep transport, provider and rate-limit details out of public form responses. */
export async function requestSignInEmail(
  client: SupabaseClient<Database>,
  email: string,
  emailRedirectTo: string,
  captcha: { captchaToken?: string }
) {
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo, ...captcha }
    });
    return error ? { error: authFailure } : { sent: true as const };
  } catch {
    return { error: authFailure };
  }
}
