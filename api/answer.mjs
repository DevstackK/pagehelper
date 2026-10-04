import { verifyRequestUser } from './_lib/auth.mjs';
import { supabaseAdmin } from './_lib/supabaseAdmin.mjs';
import { answerRequest } from './_lib/answerLogic.mjs';

const ALLOWED_ORIGIN = 'chrome-extension://alghjoipnkeciohjfabepieijhbfjcgb';
const ACTIVE_STATUSES = ['active', 'trialing'];

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
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!sub || !ACTIVE_STATUSES.includes(sub.status)) {
    return send(res, 402, { error: 'subscription_required' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return send(res, 400, { error: 'Invalid JSON' });
  }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid JSON' });

  try {
    const result = await answerRequest(body, {
      endpoint: process.env.API_URL || (process.env.AI_PROVIDER === 'anthropic' ? 'https://api.anthropic.com/v1/messages' : 'http://127.0.0.1:11434/v1/chat/completions'),
      model: process.env.AI_MODEL || (process.env.AI_PROVIDER === 'anthropic' ? 'claude-sonnet-5-5' : 'llama3.2'),
      apiKey: process.env.AI_PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.AI_API_KEY,
      provider: process.env.AI_PROVIDER || 'compatible',
      timeoutMs: 8000,
    });
    return send(res, 200, result);
  } catch (e) {
    return send(res, e.status || 502, { error: e.message || 'Unable to reach the AI provider' });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
