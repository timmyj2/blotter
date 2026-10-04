import { emailFromAccess } from "../_auth.js";
import { chicagoWeek, weeklyAllowance } from "../_week.js";

async function ready(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS desks (
      email TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
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

function clean(body) {
  const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);
  return {
    scraps: list(body?.scraps, 2000),
    threads: list(body?.threads, 500),
    projects: list(body?.projects, 200),
  };
}

function loose(desk) {
  return desk.scraps.filter((scrap) => !scrap.done && !scrap.threadId && !scrap.projectId && !scrap.targetDate).slice(0, 40);
}

function parsePlan(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function applyPlan(desk, plan, allowedIds) {
  const allowed = new Set(allowedIds);
  const used = new Set();
  let threadsMade = 0;
  let notesTied = 0;
  const threads = Array.isArray(plan?.threads) ? plan.threads.slice(0, 20) : [];
  for (const thread of threads) {
    const ids = [...new Set((Array.isArray(thread.scrapIds) ? thread.scrapIds : []).filter((id) => allowed.has(id) && !used.has(id)))];
    if (!ids.length) continue;
    const projectName = String(thread.project || "").trim().slice(0, 60);
    let projectId = null;
    if (projectName) {
      let project = desk.projects.find((item) => item.name.toLowerCase() === projectName.toLowerCase());
      if (!project) {
        project = { id: crypto.randomUUID(), name: projectName, createdAt: new Date().toISOString() };
        desk.projects.push(project);
      }
      projectId = project.id;
    }
    const id = crypto.randomUUID();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(thread.targetDate || "") ? thread.targetDate : null;
    const title = String(thread.title || "").trim().slice(0, 140) || "Untitled";
    desk.threads.unshift({
      id,
      title,
      why: "Organized.",
      projectId,
      targetDate: date,
      scrapIds: ids,
      next: null,
      done: false,
      updatedAt: new Date().toISOString(),
    });
    desk.scraps = desk.scraps.map((scrap) => (ids.includes(scrap.id) ? { ...scrap, threadId: id, projectId: projectId ?? scrap.projectId } : scrap));
    ids.forEach((scrapId) => used.add(scrapId));
    threadsMade += 1;
    notesTied += ids.length;
  }
  return { threadsMade, notesTied };
}

export async function onRequestPost(context) {
  const email = await emailFromAccess(context.request, context.env);
  if (!email) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!context.env.DB) return Response.json({ error: "Database is not connected." }, { status: 500 });
  if (!context.env.XAI_API_KEY) return Response.json({ error: "The organize key is not connected yet." }, { status: 500 });
  await ready(context.env);
  const row = await context.env.DB.prepare("SELECT data FROM desks WHERE email = ?").bind(email).first();
  const desk = clean(row ? JSON.parse(row.data) : {});
  const notes = loose(desk);
  if (!notes.length) return Response.json({ summary: "No loose notes to organize.", desk });
  const week = chicagoWeek();
  const allowance = weeklyAllowance(context.env);
  const spent = await context.env.DB.prepare(
    "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS used FROM usage WHERE email = ? AND week = ?",
  )
    .bind(email, week.key)
    .first();
  const used = Number(spent?.used) || 0;
  if (used >= allowance) {
    return Response.json({ error: "Weekly allowance is used up.", allowance: { used, allowance, left: 0, resets: week.resets } }, { status: 429 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const model = context.env.XAI_MODEL || "grok-4.7";
  const packet = {
    today,
    projects: desk.projects.map((project) => project.name).slice(0, 40),
    notes: notes.map((scrap) => ({ id: scrap.id, text: String(scrap.text || "").slice(0, 500) })),
  };
  const ai = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${context.env.XAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Group the user's loose notes into threads. Use only the given note ids. Reuse a project name when it fits, or make a short new one. Set targetDate only when the note states a day, as YYYY-MM-DD, otherwise null. Do not invent notes or rewrite them. Return JSON: {\"threads\":[{\"title\":\"\",\"project\":\"\",\"targetDate\":null,\"scrapIds\":[]}]}",
        },
        { role: "user", content: JSON.stringify(packet) },
      ],
    }),
  });
  if (!ai.ok) return Response.json({ error: "Organize failed." }, { status: 502 });
  const body = await ai.json();
  const usage = body.usage || {};
  await context.env.DB.prepare(
    "INSERT INTO usage (id, email, at, input_tokens, output_tokens, model, week) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      email,
      new Date().toISOString(),
      Number(usage.prompt_tokens) || 0,
      Number(usage.completion_tokens) || 0,
      model,
      week.key,
    )
    .run();
  const plan = parsePlan(body.choices?.[0]?.message?.content || "");
  const { threadsMade, notesTied } = applyPlan(desk, plan, notes.map((scrap) => scrap.id));
  const data = JSON.stringify(clean(desk));
  await context.env.DB.prepare(
    `INSERT INTO desks (email, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(email, data, new Date().toISOString())
    .run();
  const summary = notesTied
    ? `Tied ${notesTied} note${notesTied === 1 ? "" : "s"} into ${threadsMade} thread${threadsMade === 1 ? "" : "s"}.`
    : "Nothing was tied.";
  const left = Math.max(0, allowance - used - (Number(usage.prompt_tokens) || 0) - (Number(usage.completion_tokens) || 0));
  return Response.json({
    summary,
    desk: clean(desk),
    allowance: { used: allowance - left, allowance, left, resets: week.resets },
  });
}
