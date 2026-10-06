import { emailFromAccess } from "../_auth.js";

async function ready(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS desks (
      email TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

function clean(body) {
  if (!body || typeof body !== "object") return null;
  const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);
  return {
    scraps: list(body.scraps, 2000),
    threads: list(body.threads, 500),
    projects: list(body.projects, 200),
  };
}

export async function onRequestGet(context) {
  const email = await emailFromAccess(context.request, context.env);
  if (!email) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!context.env.DB) return Response.json({ error: "Database is not connected." }, { status: 500 });
  await ready(context.env);
  const row = await context.env.DB.prepare("SELECT data, updated_at FROM desks WHERE email = ?").bind(email).first();
  if (!row) return Response.json({ scraps: [], threads: [], projects: [] });
  const headers = { "x-desk-updated": String(row.updated_at || ""), "cache-control": "no-store" };
  try {
    return Response.json(clean(JSON.parse(row.data)), { headers });
  } catch {
    return Response.json({ scraps: [], threads: [], projects: [] }, { headers });
  }
}

export async function onRequestPut(context) {
  const email = await emailFromAccess(context.request, context.env);
  if (!email) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!context.env.DB) return Response.json({ error: "Database is not connected." }, { status: 500 });
  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Bad notes." }, { status: 400 });
  }
  const data = JSON.stringify(clean(body));
  if (data.length > 900000) return Response.json({ error: "Too many notes for one account." }, { status: 413 });
  await ready(context.env);
  await context.env.DB.prepare(
    `INSERT INTO desks (email, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(email, data, new Date().toISOString())
    .run();
  return Response.json({ ok: true });
}
