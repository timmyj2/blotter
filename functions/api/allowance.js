import { emailFromAccess } from "../_auth.js";
import { chicagoWeek, weeklyAllowance } from "../_week.js";

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
  if (!context.env.DB) return Response.json({ error: "Database is not connected." }, { status: 500 });
  await ready(context.env);
  const week = chicagoWeek();
  const allowance = weeklyAllowance(context.env);
  const row = await context.env.DB.prepare(
    "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS used FROM usage WHERE email = ? AND week = ?",
  )
    .bind(email, week.key)
    .first();
  const used = Number(row?.used) || 0;
  return Response.json({
    used,
    allowance,
    left: Math.max(0, allowance - used),
    resets: week.resets,
    week: week.key,
  });
}
