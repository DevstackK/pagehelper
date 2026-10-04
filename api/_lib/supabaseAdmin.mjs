import { createClient } from '@supabase/supabase-js';

let client;

/** Service-role Supabase client. Server-side only — never expose this key to the extension. */
export function supabaseAdmin() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
