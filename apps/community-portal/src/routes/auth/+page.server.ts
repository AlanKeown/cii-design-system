import { authFailure, requestSignInEmail } from '#lib/server/auth-email.ts';
import { captchaOptions, textValue } from '#lib/server/auth-input.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  PUBLIC_TURNSTILE_SITE_KEY,
  PUBLIC_AUTH_GITHUB_ENABLED
} from '$app/env/public';
import { rememberNext, signedIn } from '#lib/server/auth.ts';

export const load: PageServerLoad = (event) => {
  if (event.url.searchParams.has('next'))
    rememberNext(event, event.url.searchParams.get('next'));
  return {
    siteKey: PUBLIC_TURNSTILE_SITE_KEY || '',
    github: PUBLIC_AUTH_GITHUB_ENABLED === 'true',
    callbackError: event.url.searchParams.has('error')
  };
};
const message = authFailure;
export const actions: Actions = {
  local: (event) => {
    event.cookies.set('portal-mode', 'local', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: event.url.protocol === 'https:',
      maxAge: 60 * 60 * 24 * 30
    });
    redirect(303, '/');
  },
  send: async (event) => {
    const form = await event.request.formData();
    const email = textValue(form, 'email', 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return fail(400, { email, error: 'Enter a valid email address.' });
    const options = captchaOptions(form, !!PUBLIC_TURNSTILE_SITE_KEY);
    if (
      !event.locals.supabase ||
      (PUBLIC_TURNSTILE_SITE_KEY && !options.captchaToken)
    )
      return fail(400, { email, error: message });
    const result = await requestSignInEmail(
      event.locals.supabase,
      email,
      event.url.origin + '/auth/confirm',
      options
    );
    return result.error
      ? fail(400, { email, error: result.error })
      : { email, sent: true };
  },
  verify: async (event) => {
    const form = await event.request.formData();
    const email = textValue(form, 'email', 254);
    const token = textValue(form, 'code', 6);
    if (
      !event.locals.supabase ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(token)
    )
      return fail(400, { email, error: message });
    const { error } = await event.locals.supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) return fail(400, { email, error: message });
    signedIn(event);
  },
  github: async (event) => {
    if (!event.locals.supabase || PUBLIC_AUTH_GITHUB_ENABLED !== 'true')
      return fail(400, { error: message });
    const { data, error } = await event.locals.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: event.url.origin + '/auth/callback',
        skipBrowserRedirect: true
      }
    });
    if (error || !data.url) return fail(400, { error: message });
    redirect(303, data.url);
  }
};
