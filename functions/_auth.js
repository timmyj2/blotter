let certsCache = { at: 0, iss: "", keys: [] };

function teamIssuer(env) {
  return String(env.ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
}

function bytes(part) {
  const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
  const bin = atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function certs(iss) {
  if (certsCache.iss === iss && Date.now() - certsCache.at < 60 * 60 * 1000) return certsCache.keys;
  const res = await fetch(`${iss}/cdn-cgi/access/certs`);
  if (!res.ok) return [];
  const body = await res.json();
  certsCache = { at: Date.now(), iss, keys: body.keys || [] };
  return certsCache.keys;
}

export function logoutUrl(env) {
  const iss = teamIssuer(env);
  if (!iss) return "/";
  const back = encodeURIComponent("https://blotters.pages.dev/");
  return `${iss}/cdn-cgi/access/logout?returnTo=${back}`;
}

export async function emailFromAccess(request, env) {
  const iss = teamIssuer(env);
  const aud = env.ACCESS_AUD;
  if (!iss || !aud) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes(h)));
    payload = JSON.parse(new TextDecoder().decode(bytes(p)));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== iss || !audiences.includes(aud) || payload.exp < now) return null;
  const jwk = (await certs(iss)).find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const email = String(payload.email || "").trim().toLowerCase();
  return email || null;
}
