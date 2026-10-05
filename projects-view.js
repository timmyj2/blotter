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
function spanInYear(dates, year) {
  const inside = dates.filter((day) => day.slice(0, 4) === String(year));
  if (!inside.length) return null;
  return { start: inside[0], end: inside[inside.length - 1] };
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
  const spans = db.projects.map((project) => ({ project, span: spanInYear(projectDates(project), chartYear) }));
  const heat = months.map((_, index) => spans.filter(({ span }) => span && Number(span.start.slice(5, 7)) <= index + 1 && Number(span.end.slice(5, 7)) >= index + 1).length);
  const peak = Math.max(1, ...heat);
  const todayLine = chartYear === new Date().getFullYear() ? yearPos(today(), chartYear) : null;
  const lanes = spans.map(({ project, span }) => {
    const bar = span ? `<b style="left:${yearPos(span.start, chartYear)}%;width:${Math.max(1.5, yearPos(span.end, chartYear) - yearPos(span.start, chartYear))}%"></b>` : "";
    const mark = todayLine == null ? "" : `<i class="now" style="left:${todayLine}%"></i>`;
    const label = span ? `${span.start.slice(5)}–${span.end.slice(5)}` : "no dates";
    return `<button type="button" class="lane" data-open="${esc(project.id)}" title="${esc(label)}"><span class="lane-name">${esc(project.name)}</span><span class="track">${bar}${mark}</span></button>`;
  }).join("");
  const windows = openBoards.filter((id) => db.projects.some((project) => project.id === id)).map((id) => {
    const project = db.projects.find((item) => item.id === id);
    const threads = db.threads.filter((thread) => thread.projectId === id && !thread.done);
    const notes = db.scraps.filter((scrap) => scrap.projectId === id && !scrap.threadId && !scrap.done);
    const done = db.threads.filter((thread) => thread.projectId === id && thread.done).length + db.scraps.filter((scrap) => scrap.projectId === id && !scrap.threadId && scrap.done).length;
    const rows = [
      ...threads.map((thread) => `<button type="button" class="scraplink" data-thread="${esc(thread.id)}">${esc(thread.title)}${thread.targetDate ? ` · ${esc(thread.targetDate)}` : ""}</button>`),
      ...notes.map((scrap) => `<button type="button" class="read" data-edit="${esc(scrap.id)}">${rich(scrap.text.length > 110 ? scrap.text.slice(0, 88).trim() + "…" : scrap.text)}</button>${scrap.targetDate ? `<p class="muted">${esc(scrap.targetDate)}</p>` : ""}`),
    ].join("") || `<p class="empty">No open notes.</p>`;
    return `<section class="win"><header><i class="dot"></i><strong>${esc(project.name)}</strong><span class="muted">${threads.length + notes.length}</span><button type="button" class="x" data-close="${esc(id)}" aria-label="Close ${esc(project.name)}">×</button></header><div class="win-body">${rows}${done ? `<p class="muted">${done} done</p>` : ""}</div></section>`;
  }).join("");
  return `<div class="yearbar"><button type="button" class="btn" id="year-prev" aria-label="Previous year">‹</button><h1>${chartYear}</h1><button type="button" class="btn" id="year-next" aria-label="Next year">›</button></div>
    <p class="sub">Each bar runs from a project’s first date to its last this year. The clay row is how many overlap.</p>
    <div class="stack">
      <div class="lane"><span class="lane-name"></span><span class="scale">${months.map((month) => `<i>${month}</i>`).join("")}</span></div>
      <div class="lane"><span class="lane-name">Overlap</span><span class="heat">${heat.map((count) => `<i style="opacity:${count ? 0.25 + (count / peak) * 0.75 : 0.08}" title="${count}"></i>`).join("")}</span></div>
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
}
