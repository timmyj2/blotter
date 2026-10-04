import { emailFromAccess, isOwner } from "../_auth.js";

async function ready(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS usage (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      at TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      model TEXT NOT NULL,
      week TEXT
    )`,
  ).run();
  try {
    await env.DB.prepare("ALTER TABLE usage ADD COLUMN week TEXT").run();
  } catch {
    /* column already exists */
  }
}

export async function onRequestGet(context) {
  const email = await emailFromAccess(context.request, context.env);
  if (!email) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!isOwner(email, context.env)) return Response.json({ error: "Not available." }, { status: 403 });
  if (!context.env.DB) return Response.json({ error: "Database is not connected." }, { status: 500 });
  await ready(context.env);
  const rows = await context.env.DB.prepare(
    "SELECT email, at, input_tokens, output_tokens, model, week FROM usage ORDER BY at DESC LIMIT 100",
  ).all();
  return Response.json({ rows: rows.results || [] });
}
