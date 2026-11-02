import type { PageLoad } from './$types';

export const load: PageLoad = () => ({ mode: 'local' as const });
