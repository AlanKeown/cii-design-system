import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals, url }) => {
  // A path dependency reruns the server hook on client navigation between
  // auth and workspace routes, even when the shared layout is reused.
  void url.pathname;
  return {
    workspaceRoute: url.pathname === '/',
    configured: locals.configured,
    authMode: locals.mode,
    identity: locals.user
  };
};
