import { productionSupabase } from './lib/portal-production.ts';
import { recordHeartbeat } from './lib/supabase-heartbeat.ts';
// This workflow uses only a publishable key; no secret key or database password.
const bindings = productionSupabase(process.env);
const timestamp = await recordHeartbeat(
  bindings.PUBLIC_SUPABASE_URL,
  bindings.PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
console.log(`Database heartbeat recorded at ${timestamp}`);
