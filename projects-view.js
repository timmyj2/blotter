let chartYear = new Date().getFullYear();
let openBoards = [];
try { openBoards = JSON.parse(localStorage.getItem("blotter-boards") || "[]"); } catch { openBoards = []; }
if (!Array.isArray(openBoards)) openBoards = [];

function projectDates(project) {
  const dates = [];
  for (const thread of db.threads) if (thread.projectId === project.id && /^\d{4}-\d{2}-\d{2}$/.test(thread.targetDate || "")) dates.push(thread.targetDate);
  for (const scrap of db.scraps) if (scrap.projectId === project.id && /^\d{4}-\d{2}-\d{2}$/.test(scrap.targetDate || "")) dates.push(scrap.targetDate);
  return dates.sort();
}
function clipToYear(from, to, year) {
  if (!from || !to) return null;
  if (to < from) { const swap = from; from = to; to = swap; }
  const y0 = year + "-01-01";
  const y1 = year + "-12-31";
  if (to < y0 || from > y1) return null;
  return { start: from < y0 ? y0 : from, end: to > y1 ? y1 : to };
}
function chartSpan(project, year) {
  const dates = projectDates(project);
  const planned = /^\d{4}-\d{2}-\d{2}$/.test(project.start || "") && /^\d{4}-\d{2}-\d{2}$/.test(project.end || "");
  const from = planned ? project.start : dates[0];
  const to = planned ? project.end : dates[dates.length - 1];
  const span = clipToYear(from, to, year);
  if (span) span.planned = planned;
  return span;
}
function yearPos(day, year) {
  const [y, m, d] = day.split("-").map(Number);
  const len = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  const index = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(year, 0, 1)) / 86400000);
  return Math.max(0, Math.min(100, (index / len) * 100));
}
function rememberBoards() {
  openBoards = openBoards.filter((id) => db.projects.some((project) => project.id === id));
  localStorage.setItem("blotter-boards", JSON.stringify(openBoards));
}
function openBoard(id) {
  if (!db.projects.some((project) => project.id === id)) return;
  if (!openBoards.includes(id)) openBoards.push(id);
  rememberBoards();
  view = "projects";
  render();
}
function projectsView() {
  const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const thisMonth = chartYear === new Date().getFullYear() ? new Date().getMonth() : -1;
  const tone = (id) => (typeof projectTone === "function" ? projectTone(id) : "var(--clay)");
  const spans = db.projects.map((project) => ({ project, span: chartSpan(project, chartYear), dates: projectDates(project) }));
  const heat = months.map((_, index) => spans.filter(({ span }) => span && Number(span.start.slice(5, 7)) <= index + 1 && Number(span.end.slice(5, 7)) >= index + 1).length);
  const peak = Math.max(1, ...heat);
  const todayLine = chartYear === new Date().getFullYear() ? yearPos(today(), chartYear) : null;
  const lanes = spans.map(({ project, span, dates }) => {
    const bar = span ? `<b class="${span.planned ? "planned" : ""}" style="left:${yearPos(span.start, chartYear)}%;width:${Math.max(span.planned ? 1.5 : 1.2, yearPos(span.end, chartYear) - yearPos(span.start, chartYear))}%"></b>` : "";
    const ticks = dates.filter((day) => day.slice(0, 4) === String(chartYear)).map((day) => `<i class="tick" style="left:${yearPos(day, chartYear)}%"></i>`).join("");
    const mark = todayLine == null ? "" : `<i class="now" style="left:${todayLine}%"></i>`;
    const label = span ? `${span.start} to ${span.end}${span.planned ? " planned" : ""}` : "no dates";
    return `<section class="prow" style="--tone:${tone(project.id)}"><div class="prow-top"><button type="button" class="lane-name" data-open="${esc(project.id)}"><i class="swatch"></i>${esc(project.name)}<span class="lane-meta">${dates.length ? `${dates.length} dated` : ""}</span></button><form class="plan" data-plan="${esc(project.id)}"><label>Start <input type="date" name="start" value="${esc(project.start || "")}" aria-label="Plan start for ${esc(project.name)}"></label><label>End <input type="date" name="end" value="${esc(project.end || "")}" aria-label="Plan end for ${esc(project.name)}"></label></form></div><button type="button" class="track" data-open="${esc(project.id)}" title="${esc(label)}">${bar}${ticks}${mark}</button></section>`;
  }).join("");
  const windows = openBoards.filter((id) => db.projects.some((project) => project.id === id)).map((id) => {
    const project = db.projects.find((item) => item.id === id);
    const threads = db.threads.filter((thread) => thread.projectId === id && !thread.done);
    const notes = db.scraps.filter((scrap) => scrap.projectId === id && !scrap.threadId && !scrap.done);
    const done = db.threads.filter((thread) => thread.projectId === id && thread.done).length + db.scraps.filter((scrap) => scrap.projectId === id && !scrap.threadId && scrap.done).length;
    const rows = [
      ...threads.map((thread) => `<article class="win-note"><button type="button" class="scraplink" data-thread="${esc(thread.id)}"><span>${esc(thread.title)}</span></button>${thread.targetDate ? `<p class="muted">Due ${esc(thread.targetDate)}</p>` : ""}</article>`),
      ...notes.map((scrap) => `<article class="win-note"><button type="button" class="read" data-edit="${esc(scrap.id)}"><span>${rich(scrap.text.length > 160 ? scrap.text.slice(0, 140).trim() + "…" : scrap.text)}</span></button>${scrap.targetDate ? `<p class="muted">Due ${esc(scrap.targetDate)}</p>` : ""}</article>`),
    ].join("") || `<p class="empty">No open notes.</p>`;
    return `<section class="win" style="--tone:${tone(id)}"><header><i class="dot"></i><strong>${esc(project.name)}</strong><span class="muted">${threads.length + notes.length}</span><button type="button" class="x" data-close="${esc(id)}" aria-label="Close ${esc(project.name)}">×</button></header><div class="win-body">${rows}${done ? `<p class="muted">${done} done</p>` : ""}</div></section>`;
  }).join("");
  return `<div class="yearbar"><button type="button" class="btn" id="year-prev" aria-label="Previous year">‹</button><h1>${chartYear}</h1><button type="button" class="btn" id="year-next" aria-label="Next year">›</button></div>
    <p class="sub">Start and end draw the bar. Dots are note dates.</p>
    <div class="stack year-card">
      <div class="scale wide">${months.map((month, index) => `<i class="${index === thisMonth ? "this" : ""}${index % 2 ? " alt" : ""}"><span class="long">${monthNames[index]}</span><span class="short">${month}</span></i>`).join("")}</div>
      <div class="prow overlap"><span class="lane-name">Overlap</span><span class="heat">${heat.map((count, index) => `<i class="${count ? "on" : ""}${count && count / peak > 0.55 ? " hot" : ""}${index === thisMonth ? " this" : ""}" style="--heat:${count ? Math.round(22 + (count / peak) * 78) : 0}%" title="${monthNames[index]}: ${count} project${count === 1 ? "" : "s"}">${count || ""}</i>`).join("")}</span></div>
      ${lanes || `<p class="empty">No projects yet.</p>`}
    </div>
    <form id="make-project" class="row" style="margin-top:12px"><input class="field" name="name" aria-label="New project" placeholder="New project" required style="width:auto;flex:1"><button class="btn ink" type="submit">Open a window</button></form>
    <div class="windows">${windows || `<p class="empty">Click a project to open a window. Open as many as you want.</p>`}</div>`;
}
function bindProjects() {
  document.querySelectorAll("[data-open]").forEach((btn) => { btn.onclick = () => openBoard(btn.dataset.open); });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation();
      openBoards = openBoards.filter((id) => id !== btn.dataset.close);
      rememberBoards();
      render();
    };
  });
  const yearPrev = document.getElementById("year-prev");
  if (yearPrev) yearPrev.onclick = () => { chartYear -= 1; render(); };
  const yearNext = document.getElementById("year-next");
  if (yearNext) yearNext.onclick = () => { chartYear += 1; render(); };
  const makeProject = document.getElementById("make-project");
  if (makeProject) makeProject.onsubmit = (event) => {
    event.preventDefault();
    const name = new FormData(makeProject).get("name").toString().trim();
    const id = resolveProject("__new__", name);
    if (id) openBoard(id);
  };
  document.querySelectorAll("form.plan").forEach((form) => {
    const savePlan = () => {
      const project = db.projects.find((item) => item.id === form.dataset.plan);
      if (!project) return;
      const data = new FormData(form);
      project.start = String(data.get("start") || "") || null;
      project.end = String(data.get("end") || "") || null;
      save();
      notice = "Plan saved.";
      render();
    };
    form.onchange = savePlan;
    form.onsubmit = (event) => {
      event.preventDefault();
      savePlan();
    };
  });
}
