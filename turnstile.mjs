// Cloudflare Turnstile: dist/form.js puts an invisible human check on the consultation form, and the
// function checks its token here before anything reaches GoHighLevel.
// The widget is "Howards Draperies lead forms" in the gbp@shadestrategy.com Cloudflare account.
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TOKEN_FIELD = 'cf-turnstile-response';

// Resolves true when the request may go on. Without TURNSTILE_SECRET_KEY the check is off and
// the other checks still apply, so the code can ship before the secret is set in Netlify.
export async function verifyHuman(token, ip, {fetcher = fetch, env = process.env} = {}) {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  // Cloudflare's tokens are at most 2048 characters.
  if (typeof token !== 'string' || !token || token.length > 2048) {
    console.error('[turnstile] token refused: missing-or-invalid-token');
    return false;
  }
  const body = new URLSearchParams({secret, response: token});
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  try {
    const response = await fetcher(SITEVERIFY_URL, {method: 'POST', body, signal: AbortSignal.timeout(3000)});
    if (!response.ok) {
      // A Cloudflare outage, not a verdict on the visitor: let the lead through.
      console.error(`[turnstile] siteverify unavailable, lead allowed: HTTP ${response.status}`);
      return true;
    }
    const result = await response.json();
    if (result?.success === true) return true;
    console.error(`[turnstile] token refused: ${(result?.['error-codes'] ?? []).join(',') || 'no error codes'}`);
    return false;
  } catch (error) {
    // Cloudflare unreachable, slow or answering oddly: let the lead through rather than lose
    // it; the other checks still apply.
    console.error(`[turnstile] siteverify unavailable, lead allowed: ${error.name}`);
    return true;
  }
}
