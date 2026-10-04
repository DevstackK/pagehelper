import { verifyRequestUser } from './_lib/auth.mjs';
import { supabaseAdmin } from './_lib/supabaseAdmin.mjs';

const ALLOWED_ORIGIN = 'chrome-extension://alghjoipnkeciohjfabepieijhbfjcgb';
const ACTIVE_STATUSES = ['active', 'trialing'];

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) return send(res, 403, { error: 'Origin not allowed' });
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(204);
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 404, { error: 'Not found' });

  let user;
  try {
    user = await verifyRequestUser(req);
  } catch (e) {
    return send(res, e.status || 401, { error: e.message });
  }

  const { data: sub } = await supabaseAdmin()
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  const status = sub?.status || null;
  send(res, 200, { email: user.email, subscriptionStatus: status, subscribed: ACTIVE_STATUSES.includes(status) });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
