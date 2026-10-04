import { createClient } from '@supabase/supabase-js';

const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

/**
 * Verifies the bearer token on a request against Supabase Auth.
 * Returns { id, email } on success, or throws an Error with .status=401.
 */
export async function verifyRequestUser(req) {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) throw unauthorized();
  const { data, error } = await supabaseAnon.auth.getUser(match[1]);
  if (error || !data?.user) throw unauthorized();
  return { id: data.user.id, email: data.user.email };
}

function unauthorized() {
  const e = new Error('Sign in required');
  e.status = 401;
  return e;
}
