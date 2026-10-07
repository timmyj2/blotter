function scrapText(root) {
  if (!root) return "";
  const parts = [...root.childNodes].map((node) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, " ");
    return marksFromNode(node).replace(/\n+$/, "");
  });
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function marksFromNode(node) {
  if (!node) return "";
  if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, " ");
  if (node.nodeType !== 1) return "";
  const tag = node.tagName;
  if (tag === "BR") return "\n";
  let inner = [...node.childNodes].map(marksFromNode).join("");
  const style = node.style || {};
  const bold = tag === "B" || tag === "STRONG" || style.fontWeight === "bold" || Number(style.fontWeight) >= 600;
  const under = tag === "U" || (style.textDecorationLine || "").includes("underline") || (style.textDecoration || "").includes("underline");
  if (under && inner.trim()) inner = `++${inner}++`;
  if (bold && inner.trim()) inner = `**${inner}**`;
  if (tag === "LI") return `- ${inner.replace(/\n+/g, " ").trim()}\n`;
  if (tag === "UL" || tag === "OL") return inner;
  if (tag === "DIV" || tag === "P") return `${inner.replace(/\n+$/, "")}\n`;
  return inner;
}

function htmlFromMarks(text) {
  const lines = String(text || "").split("\n");
  let html = "";
  let inList = false;
  const closeList = () => {
    if (!inList) return;
    html += "</ul>";
    inList = false;
  };
  const inline = (line) => {
    let body = esc(line);
    body = body.replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>");
    body = body.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return body || "<br>";
  };
  for (const line of lines) {
    if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(line.slice(2))}</li>`;
    } else {
      closeList();
      html += `<div>${inline(line)}</div>`;
    }
  }
  closeList();
  return html;
}

function rich(text) {
  return String(text || "").split("\n").map((line) => {
    const bullet = line.startsWith("- ");
    let body = esc(bullet ? line.slice(2) : line);
    body = body.replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>");
    body = body.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    body = body.replace(/(^|\s)(#[A-Za-z][\w-]{0,40})/g, '$1<span class="hash">$2</span>');
    return bullet ? `<span class="bullet">${body}</span>` : body;
  }).join("<br>");
}

function dumpView() {
  const recent = db.scraps.slice(0, 5);
  return `<p class="kicker">Dump</p><h1>Put it down.</h1>
    <p class="sub">Bold, underline, or a bullet. Ctrl+Enter keeps it.</p>
    <div class="row" id="templates">
      <button type="button" class="btn" data-template="quick">Quick</button>
      <button type="button" class="btn" data-template="meeting">Meeting</button>
      <button type="button" class="btn" data-template="decision">Decision</button>
      <button type="button" class="btn" data-template="follow">Follow-up</button>
      <button type="button" class="btn" data-template="idea">Idea</button>
    </div>
    <form id="dump" class="stack">
      <div class="formatbar" aria-label="Format">
        <button type="button" data-fmt="bold" title="Bold"><b>B</b></button>
        <button type="button" data-fmt="underline" title="Underline"><u>U</u></button>
        <button type="button" data-fmt="bullet" title="Bullet">•</button>
      </div>
      <div class="field composer">
        <div id="scrap" class="write" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Scrap" data-placeholder="What’s on your mind"></div>
        <textarea name="text" tabindex="-1" aria-hidden="true" hidden></textarea>
        <div class="duebar">
          <button type="button" data-stamp="today">Due today</button>
          <button type="button" data-stamp="tomorrow">Due tomorrow</button>
          <button type="button" data-stamp="eow">Due EOW</button>
          <button type="button" data-stamp="eom">Due EOM</button>
        </div>
      </div>
      <div class="row">
        <select class="field due" id="due" aria-label="Due date">
          <option value="">No date</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="friday">Friday</option>
          <option value="eow">End of week</option>
          <option value="eom">End of month</option>
          <option value="week">Next week</option>
          <option value="pick">Pick a day</option>
        </select>
        <input class="field due" id="due-pick" type="date" aria-label="Pick a due date" hidden>
        <button class="btn ink" type="submit">Keep it</button>
        <label class="btn file">Open a file<input id="file" type="file" accept=".md,.markdown,.txt,.text,text/markdown,text/plain" multiple></label>
      </div>
    </form>
    ${recent.length ? `<div class="stack">${recent.map((s) => { const title = s.text.length > 90 ? s.text.slice(0, 72).trim() + "…" : s.text; return `<article class="card"><button type="button" class="read" data-edit="${esc(s.id)}">${rich(title)}</button>${s.targetDate ? `<div class="meta"><span>${esc(s.targetDate)}</span></div>` : ""}</article>`; }).join("")}</div>` : `<p class="empty">Nothing here yet.</p>`}`;
}

function applyFormat(box, fmt) {
  if (!box) return;
  box.focus();
  if (fmt === "bold") document.execCommand("bold");
  else if (fmt === "underline") document.execCommand("underline");
  else if (fmt === "bullet") document.execCommand("insertUnorderedList");
}

function wireFormat(bar, getBox) {
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = "1";
  bar.onmousedown = (event) => {
    if (event.target.closest("button")) event.preventDefault();
  };
  bar.onclick = (event) => {
    const fmt = event.target.closest("button")?.dataset.fmt;
    if (!fmt) return;
    applyFormat(getBox(), fmt);
  };
}

function formatKeys(event, box) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "b") {
    event.preventDefault();
    applyFormat(box, "bold");
  } else if (key === "u") {
    event.preventDefault();
    applyFormat(box, "underline");
  }
}

function keepScrap(text, kind, picked) {
  db.scraps.unshift({ id: uid(), text, createdAt: new Date().toISOString(), threadId: null, projectId: null, targetDate: dueWhen(kind, picked || ""), done: false });
  save();
}

function bindDump(dump) {
  const box = document.getElementById("scrap");
  const hidden = dump.querySelector("textarea");
  const due = document.getElementById("due");
  const pick = document.getElementById("due-pick");
  const sync = () => { if (hidden && box) hidden.value = scrapText(box); };
  if (box && !box.dataset.wired) {
    box.dataset.wired = "1";
    box.addEventListener("keydown", (event) => {
      formatKeys(event, box);
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        dump.requestSubmit();
      }
    });
  }
  wireFormat(dump.querySelector(".formatbar"), () => document.getElementById("scrap"));
  const templates = document.getElementById("templates");
  if (templates && box) templates.onclick = (event) => {
    const key = event.target.closest("button")?.dataset.template;
    if (!TEMPLATES[key]) return;
    const current = scrapText(box);
    box.innerHTML = htmlFromMarks(current ? `${current}\n\n${TEMPLATES[key]}` : TEMPLATES[key]);
    sync();
    box.focus();
  };
  const duebar = dump.querySelector(".duebar");
  if (duebar) duebar.onclick = (event) => {
    const kind = event.target.closest("button")?.dataset.stamp;
    if (!kind || !box) return;
    const text = scrapText(box);
    if (!text) return;
    keepScrap(text, kind, "");
    view = "now";
    render();
  };
  dump.onsubmit = (event) => {
    event.preventDefault();
    if (!box) return;
    const text = scrapText(box);
    if (!text) {
      box.focus();
      return;
    }
    keepScrap(text, due?.value || "", pick?.value || "");
    render();
  };
}

function paintEdit() {
  const form = document.getElementById("note-edit");
  const write = document.getElementById("edit-write");
  if (!form || !write) return;
  write.innerHTML = htmlFromMarks(form.text?.value || "");
  write.focus();
}

function bindEdit() {
  const form = document.getElementById("note-edit");
  const write = document.getElementById("edit-write");
  if (!form || !write || form.dataset.fmt) return;
  form.dataset.fmt = "1";
  form.addEventListener("submit", () => {
    if (form.text) form.text.value = scrapText(write);
  }, true);
  write.addEventListener("keydown", (event) => formatKeys(event, write));
  wireFormat(document.getElementById("edit-format"), () => document.getElementById("edit-write"));
}

function hideTagMenu() {
  const menu = document.getElementById("tag-menu");
  if (menu) menu.hidden = true;
}

function tagMenu(event, action) {
  const menu = document.getElementById("tag-menu");
  if (!menu) return;
  event.preventDefault();
  event.stopPropagation();
  menu.hidden = false;
  menu.dataset.kind = action.kind;
  menu.dataset.id = action.id || "";
  menu.dataset.name = action.name || "";
  const label = menu.querySelector("button");
  if (label) label.textContent = action.kind === "project" ? "Delete project" : "Delete tag";
  const width = 148;
  menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - 44))}px`;
}

function stripTag(text, name) {
  const safe = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!safe) return text;
  const re = new RegExp(`(^|\\s)#${safe}(?![\\w-])`, "gi");
  return String(text).replace(re, "$1").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function deleteTagTarget() {
  const menu = document.getElementById("tag-menu");
  if (!menu) return;
  const kind = menu.dataset.kind;
  if (kind === "hash") {
    const name = menu.dataset.name.replace(/^#/, "").trim();
    if (!name) return;
    for (const scrap of db.scraps) scrap.text = stripTag(scrap.text, name);
    for (const thread of db.threads) thread.title = stripTag(thread.title, name);
    notice = "Tag deleted.";
  } else if (kind === "project") {
    const id = menu.dataset.id;
    if (!id || !db.projects.some((project) => project.id === id)) return;
    db.projects = db.projects.filter((project) => project.id !== id);
    for (const scrap of db.scraps) if (scrap.projectId === id) scrap.projectId = null;
    for (const thread of db.threads) if (thread.projectId === id) thread.projectId = null;
    if (typeof openBoards !== "undefined") openBoards = openBoards.filter((board) => board !== id);
    if (typeof rememberBoards === "function") rememberBoards();
    if (projectFilter === id) projectFilter = "";
    notice = "Project deleted. Notes kept.";
  } else return;
  save();
  render();
}

function bindTagMenu() {
  if (document.body.dataset.tagMenu) return;
  document.body.dataset.tagMenu = "1";
  document.addEventListener("click", hideTagMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTagMenu();
  });
  document.addEventListener("contextmenu", (event) => {
    const hash = event.target.closest?.(".hash");
    const hit = event.target.closest?.("[data-hash], [data-project], [data-open]");
    if (hash) {
      tagMenu(event, { kind: "hash", name: hash.textContent.replace(/^#/, "") });
      return;
    }
    if (!hit || hit.disabled) return;
    if (hit.dataset.hash) tagMenu(event, { kind: "hash", name: hit.dataset.hash });
    else if (hit.dataset.project || hit.dataset.open) tagMenu(event, { kind: "project", id: hit.dataset.project || hit.dataset.open });
  });
  const menu = document.getElementById("tag-menu");
  if (menu) menu.onclick = (event) => {
    event.stopPropagation();
    if (event.target.closest("[data-act=delete]")) deleteTagTarget();
    hideTagMenu();
  };
}

function bindFormat() {
  bindTagMenu();
  const dump = document.getElementById("dump");
  if (dump) bindDump(dump);
  bindEdit();
  document.querySelectorAll("#tags [data-hash], #tags [data-project], [data-open], .win [data-project]").forEach((el) => {
    if (!el.title) el.title = "Right-click to delete";
  });
}
