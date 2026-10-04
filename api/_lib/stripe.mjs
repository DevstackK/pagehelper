import Stripe from 'stripe';

let client;

export function stripeClient() {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
