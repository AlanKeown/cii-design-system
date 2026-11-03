import { fail, isHttpError, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { checked, requireUser } from '#lib/server/api.ts';
import { selectOrganisation } from '#lib/server/workspace.ts';
import { safeNext } from '#lib/server/redirect.ts';
export const load: PageServerLoad = (event) => {
  if (!event.locals.user)
    redirect(
      303,
      '/auth?next=' + encodeURIComponent(safeNext(event.url.pathname))
    );
  return {};
};
export const actions: Actions = {
  default: async (event) => {
    const { client } = requireUser(event.locals);
    if (!/^[a-f0-9]{64}$/.test(event.params.token))
      return fail(400, {
        error: 'This invitation is invalid. Ask for a new link.'
      });
    let org: string | null;
    try {
      org = checked(
        await client.rpc('accept_invitation', { p_token: event.params.token })
      );
    } catch (error) {
      if (isHttpError(error))
        return fail(error.status, { error: error.body.message });
      throw error;
    }
    if (!org)
      return fail(400, {
        error: 'This invitation could not be accepted. Ask for a new link.'
      });
    selectOrganisation(event, org);
    redirect(303, '/');
  }
};
