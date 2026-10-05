function nowView() {
  const start = today();
  const end = addDays(start, 6);
  const tasks = [];
  for (const thread of db.threads) {
    if (thread.done || !thread.targetDate) continue;
    tasks.push({ kind: "thread", id: thread.id, title: thread.title, projectId: thread.projectId, next: thread.next || "", day: thread.targetDate });
  }
  for (const scrap of db.scraps) {
    if (scrap.done || scrap.threadId || !scrap.targetDate) continue;
    tasks.push({ kind: "scrap", id: scrap.id, title: scrap.text, projectId: scrap.projectId, next: "", day: scrap.targetDate });
  }
  tasks.sort((a, b) => a.day.localeCompare(b.day));
  const overdue = tasks.filter((item) => item.day < start);
  const week = tasks.filter((item) => item.day >= start && item.day <= end);
  const next = overdue[0] || week.find((item) => item.day === start) || null;
  const same = (item) => next && item.kind === next.kind && item.id === next.id;
  const later = overdue.filter((item) => !same(item));
  const soon = week.filter((item) => !same(item));
  const undo = priorDesk ? `<button type="button" class="btn" id="undo-sort">Undo the last sort</button>` : "";
  const blocks = `${later.length ? `<h2 class="late" style="font-family:var(--serif);font-weight:500;margin-top:18px">Overdue</h2><div class="stack">${later.map((item) => taskCard(item, true)).join("")}</div>` : ""}
    <h2 style="font-family:var(--serif);font-weight:500;margin-top:18px">This week</h2>
    <div class="stack">${soon.length ? soon.map((item) => taskCard(item, false)).join("") : `<p class="empty">Nothing else in the next 7 days.</p>`}</div>`;
  const lead = next ? `<h2 style="font-family:var(--serif);font-weight:500;margin-top:18px">Do this next</h2><div class="stack">${taskCard(next, next.day < start)}</div>` : "";
  return `<form id="quick" class="capture"><input class="field" name="text" aria-label="Dump a thought" placeholder="Start here. Dump a thought, then Enter." autocomplete="off"><button class="btn ink" type="submit">Keep</button></form>
    <p class="kicker">Now</p><h1>What’s due</h1>
    ${account ? `<div class="row" style="margin-top:10px"><button type="button" class="btn ink" id="compile" ${compiling ? "disabled" : ""}>Organize loose notes</button>${undo}</div>` : ""}
    ${lead}
    ${blocks}`;
}
