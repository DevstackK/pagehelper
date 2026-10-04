import { verifyRequestUser } from './_lib/auth.mjs';
import { supabaseAdmin } from './_lib/supabaseAdmin.mjs';
import { stripeClient } from './_lib/stripe.mjs';

const ALLOWED_ORIGIN = 'chrome-extension://alghjoipnkeciohjfabepieijhbfjcgb';

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) return send(res, 403, { error: 'Origin not allowed' });
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(204);
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  let user;
  try {
    user = await verifyRequestUser(req);
  } catch (e) {
    return send(res, e.status || 401, { error: e.message });
  }

  const { data: sub } = await supabaseAdmin()
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) return send(res, 404, { error: 'No subscription found' });

  try {
    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.PUBLIC_BASE_URL}/login.html`,
    });
    send(res, 200, { url: session.url });
  } catch (e) {
    send(res, 502, { error: 'Unable to open billing portal' });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
