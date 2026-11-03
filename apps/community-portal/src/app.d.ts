import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/backend/database.types.ts';

declare global {
  namespace App {
    interface Error {
      code?: import('#lib/backend/types.ts').BackendError['code'];
      fieldErrors?: import('#lib/model.ts').FormErrors;
    }
    interface Locals {
      supabase: SupabaseClient<Database> | null;
      user: { id: string; email: string | null } | null;
      mode: 'local' | 'signed-in' | 'signed-out';
      configured: boolean;
    }
  }
}
export {};
