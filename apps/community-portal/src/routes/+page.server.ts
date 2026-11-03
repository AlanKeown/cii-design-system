import type { PageServerLoad } from './$types';
import { loadWorkspace } from '#lib/server/workspace.ts';
export const load: PageServerLoad = async (event) =>
  event.locals.user
    ? {
        mode: 'live' as const,
        requestedModule: event.url.searchParams.get('module'),
        ...(await loadWorkspace(event))
      }
    : {
        mode: 'local' as const,
        requestedModule: event.url.searchParams.get('module'),
        workspace: null,
        session: null
      };
