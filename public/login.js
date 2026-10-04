const SUPABASE_URL = 'https://uhikahumlkvfseyrrnct.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoaWthaHVtbGt2ZnNleXJybmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTI1MDUsImV4cCI6MjEwNjY4ODUwNX0.bJyo9AasArvQWVeX2HtkZkvXhM7rcDqh2plDuHqFASQ';
const EXTENSION_ID = 'alghjoipnkeciohjfabepieijhbfjcgb';

const $ = (id) => document.getElementById(id);

async function handleRedirect() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  const expiresIn = hash.get('expires_in');
  if (!accessToken || !refreshToken) return false;

  $('intro').textContent = 'Signed in. Returning you to the extension…';
  $('form').hidden = true;

  history.replaceState(null, '', location.pathname);

  if (!chrome?.runtime?.sendMessage) {
    $('status').textContent = 'Signed in, but this page must be opened in Chrome to connect to the extension.';
    return true;
  }
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: 'PAH_SESSION', access_token: accessToken, refresh_token: refreshToken, expires_in: Number(expiresIn) || 3600 },
        (response) => {
          if (chrome.runtime.lastError || !response?.ok) reject(chrome.runtime.lastError || new Error('no response'));
          else resolve();
        }
      );
    });
    $('status').textContent = "You're signed in — you can close this tab.";
  } catch {
    $('status').textContent = 'Signed in, but could not reach the extension. Make sure it is installed, then try the link again.';
  }
  return true;
}

async function sendMagicLink(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, create_user: true, options: { email_redirect_to: location.origin + location.pathname } }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error_description || data.msg || 'Could not send sign-in link');
  }
}

(async () => {
  if (await handleRedirect()) return;

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    if (!email) return;
    $('submit').disabled = true;
    $('status').textContent = 'Sending…';
    try {
      await sendMagicLink(email);
      $('status').textContent = `Check ${email} for a sign-in link.`;
    } catch (err) {
      $('status').textContent = err.message;
    } finally {
      $('submit').disabled = false;
    }
  });
})();
