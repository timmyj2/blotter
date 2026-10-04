import { emailFromAccess } from "../_auth.js";
import { planDesk } from "../_organize.js";

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
  const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);
  return {
    scraps: list(body?.scraps, 2000),
    threads: list(body?.threads, 500),
    projects: list(body?.projects, 200),
  };
}

function projectFor(desk, name) {
  const projectName = String(name || "").trim().slice(0, 60);
  if (!projectName) return null;
  let project = desk.projects.find((item) => item.name.toLowerCase() === projectName.toLowerCase());
  if (!project) {
    project = { id: crypto.randomUUID(), name: projectName, createdAt: new Date().toISOString() };
    desk.projects.push(project);
  }
  return project.id;
}

function applyPlan(desk, plan, allowedIds) {
  const allowed = new Set(allowedIds);
  const used = new Set();
  let threadsMade = 0;
  let notesTied = 0;
  for (const thread of (plan.threads || []).slice(0, 20)) {
    const ids = [...new Set((thread.scrapIds || []).filter((id) => allowed.has(id) && !used.has(id)))];
    if (ids.length < 2) continue;
    const projectId = projectFor(desk, thread.project);
    const id = crypto.randomUUID();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(thread.targetDate || "") ? thread.targetDate : null;
    desk.threads.unshift({
      id,
      title: String(thread.title || "").trim().slice(0, 140) || "Untitled",
      why: "Sorted from shared words, names, and dates.",
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
  let placed = 0;
  for (const place of plan.places || []) {
    if (!allowed.has(place.scrapId) || used.has(place.scrapId)) continue;
    const scrap = desk.scraps.find((item) => item.id === place.scrapId);
    if (!scrap || scrap.threadId) continue;
    scrap.projectId = projectFor(desk, place.project) || scrap.projectId;
    if (/^\d{4}-\d{2}-\d{2}$/.test(place.targetDate || "")) scrap.targetDate = place.targetDate;
    placed += 1;
  }
  return { threadsMade, notesTied, placed };
}

export async function onRequestPost(context) {
  const email = await emailFromAccess(context.request, context.env);
  if (!email) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!context.env.DB) return Response.json({ error: "Database is not connected." }, { status: 500 });
  let today = "";
  try {
    const body = await context.request.json();
    today = body?.today || "";
  } catch {
    today = "";
  }
  await ready(context.env);
  const row = await context.env.DB.prepare("SELECT data FROM desks WHERE email = ?").bind(email).first();
  const desk = clean(row ? JSON.parse(row.data) : {});
  const allowed = desk.scraps.filter((scrap) => !scrap.done && !scrap.threadId && !scrap.projectId && !scrap.targetDate).map((scrap) => scrap.id);
  if (!allowed.length) return Response.json({ summary: "No loose notes to organize.", desk });
  const plan = planDesk(desk, today);
  const { threadsMade, notesTied, placed } = applyPlan(desk, plan, allowed);
  const data = JSON.stringify(clean(desk));
  await context.env.DB.prepare(
    `INSERT INTO desks (email, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(email, data, new Date().toISOString())
    .run();
  const parts = [];
  if (notesTied) parts.push(`tied ${notesTied} into ${threadsMade} thread${threadsMade === 1 ? "" : "s"}`);
  if (placed) parts.push(`dated or tagged ${placed}`);
  return Response.json({ summary: parts.length ? parts.join(", ") + "." : "Nothing was tied.", desk: clean(desk) });
}
