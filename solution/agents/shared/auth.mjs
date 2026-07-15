/**
 * Shared auth helper for agent tools calling the CAP service.
 *
 * Auth resolution order:
 * 1. JWT token forwarded from caller (e.g. Joule → A2A → agent)
 * 2. Client credentials from XSUAA binding (CF production — agent fetches its own token)
 * 3. Basic auth fallback (local dev with CDS mocked auth)
 */

let _cachedToken = null;
let _tokenExpiry = 0;

async function getClientCredentialsToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const vcap = process.env.VCAP_SERVICES;
  if (!vcap) return null;

  const xsuaa = JSON.parse(vcap).xsuaa?.[0]?.credentials;
  if (!xsuaa) return null;

  const res = await fetch(`${xsuaa.url}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: xsuaa.clientid,
      client_secret: xsuaa.clientsecret,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _cachedToken;
}

export async function resolveAuthHeaders(authToken) {
  let auth;
  if (authToken) {
    auth = `Bearer ${authToken}`;
  } else {
    const ccToken = await getClientCredentialsToken();
    if (ccToken) {
      auth = `Bearer ${ccToken}`;
    } else {
      const user = process.env.CAP_USER || "cafe-user";
      const pass = process.env.CAP_PASSWORD || "initial";
      auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    }
  }
  return { "Content-Type": "application/json", "Authorization": auth };
}
