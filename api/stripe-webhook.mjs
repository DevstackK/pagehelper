import { supabaseAdmin } from './_lib/supabaseAdmin.mjs';
import { stripeClient } from './_lib/stripe.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  const sig = req.headers['stripe-signature'];
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;

  const stripe = stripeClient();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return send(res, 400, { error: 'Invalid signature' });
  }

  const admin = supabaseAdmin();

  // Idempotency: skip if we've already processed this event id.
  const { error: insertError } = await admin.from('stripe_events').insert({ event_id: event.id });
  if (insertError) {
    // Unique violation means we've already handled this event.
    return send(res, 200, { received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (userId) {
          const subscription = session.subscription
            ? await stripe.subscriptions.retrieve(session.subscription)
            : null;
          await admin.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: subscription?.id || null,
            status: subscription?.status || 'active',
            price_id: subscription?.items?.data?.[0]?.price?.id || null,
            current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: subscription?.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await admin
          .from('subscriptions')
          .update({
            status: subscription.status,
            stripe_subscription_id: subscription.id,
            price_id: subscription.items?.data?.[0]?.price?.id || null,
            current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: subscription.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', subscription.customer);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await admin
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }
      default:
        break; // no-op for unhandled event types
    }
    send(res, 200, { received: true });
  } catch (e) {
    send(res, 500, { error: 'Webhook handling failed' });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
