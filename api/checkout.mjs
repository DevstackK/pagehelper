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

  const stripe = stripeClient();
  const admin = supabaseAdmin();

  // Find an existing Stripe customer for this user, or let Checkout create one.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: user.id,
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      success_url: `${process.env.PUBLIC_BASE_URL}/checkout-success.html`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/login.html`,
    });
    send(res, 200, { url: session.url });
  } catch (e) {
    send(res, 502, { error: 'Unable to start checkout' });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
