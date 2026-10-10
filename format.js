let editingId = "";

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
  const scrap = editingId ? db.scraps.find((item) => item.id === editingId) : null;
  const projectId = scrap?.projectId || "";
  const projects = `<option value="">No project</option>` +
    db.projects.map((project) => `<option value="${esc(project.id)}" ${project.id === projectId ? "selected" : ""}>${esc(project.name)}</option>`).join("") +
    `<option value="__new__">New project</option>`;
  const dueValue = scrap?.targetDate || "";
  const recent = db.scraps.filter((item) => !item.done).slice(0, 12);
  const list = recent.map((item) => {
    const line = String(item.text).split("\n").map((part) => part.trim()).find(Boolean) || "Empty note";
    const title = line.replace(/^(?:- |\*\*|## |\+\+)/, "").replace(/\*\*/g, "");
    const shown = title.length > 72 ? title.slice(0, 64).trim() + "…" : title;
    const project = item.projectId ? projectName(item.projectId) : "";
    return `<div class="line-row"><label class="check"><input type="checkbox" data-id="${esc(item.id)}" ${selected.has(item.id) ? "checked" : ""} aria-label="Select note"></label><button type="button" class="line${item.id === editingId ? " on" : ""}" data-load="${esc(item.id)}"><span>${esc(shown)}</span><span class="when">${project ? esc(project) + " · " : ""}${item.targetDate ? esc(item.targetDate) : "No date"}</span></button></div>`;
  }).join("");
  return `<div class="note-page">
    <p class="kicker">Dump</p>
    <h1>${scrap ? "Edit note" : "Notes"}</h1>
    <p class="sub">Bold, underline, and bullets. Enter continues a list. Ctrl+Enter saves.</p>
    <form id="dump" class="stack">
      <div class="formatbar" aria-label="Format">
        <button type="button" data-fmt="bold" title="Bold"><b>B</b></button>
        <button type="button" data-fmt="underline" title="Underline"><u>U</u></button>
        <button type="button" data-fmt="bullet" title="Bullet">Bullet</button>
      </div>
      <div class="field composer">
        <div id="scrap" class="write" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note" data-placeholder="Write the note">${scrap ? htmlFromMarks(scrap.text) : ""}</div>
        <textarea name="text" tabindex="-1" aria-hidden="true" hidden></textarea>
      </div>
      <div class="row note-meta">
        <select class="field due" id="dump-project" aria-label="Project">${projects}</select>
        <input class="field due" id="dump-project-name" aria-label="New project name" placeholder="Project name" hidden>
        <select class="field due" id="due" aria-label="Due date">
          <option value="">No date</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="friday">Friday</option>
          <option value="eow">End of week</option>
          <option value="eom">End of month</option>
          <option value="week">Next week</option>
          <option value="pick" ${dueValue ? "selected" : ""}>Pick a day</option>
        </select>
        <input class="field due" id="due-pick" type="date" aria-label="Pick a due date" value="${esc(dueValue)}" ${dueValue ? "" : "hidden"}>
        <button class="btn ink" type="submit">${scrap ? "Save note" : "Keep note"}</button>
        ${scrap ? `<button class="btn" type="button" id="dump-new">New note</button>` : ""}
      </div>
      <div class="row note-actions">
        <button class="btn" type="button" id="export-open">Export this note</button>
        <button class="btn" type="button" id="export-selected">Export selected</button>
        <label class="btn file">Open a file<input id="file" type="file" accept=".md,.markdown,.txt,.text,text/markdown,text/plain" multiple></label>
      </div>
    </form>
    <section class="note-list">
      <p class="kicker">Recent</p>
      ${list || `<p class="empty">Nothing here yet.</p>`}
    </section>
  </div>`;
}

function placeCaret(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function applyFormat(box, fmt) {
  if (!box) return;
  box.focus();
  if (fmt === "bold") {
    document.execCommand("bold");
    return;
  }
  if (fmt === "underline") {
    document.execCommand("underline");
    return;
  }
  if (fmt !== "bullet") return;
  let listed = false;
  try { listed = document.queryCommandState("insertUnorderedList"); } catch { listed = false; }
  if (listed) {
    document.execCommand("insertUnorderedList");
    return;
  }
  if (!box.textContent.trim() && !box.querySelector("li")) {
    box.innerHTML = "<ul><li><br></li></ul>";
    placeCaret(box.querySelector("li"));
    return;
  }
  const ok = document.execCommand("insertUnorderedList");
  if (!ok || !box.querySelector("li")) {
    document.execCommand("insertHTML", false, "<ul><li>" + (getSelection().toString() || "<br>") + "</li></ul>");
  }
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

function dumpProjectId() {
  const project = document.getElementById("dump-project");
  const name = document.getElementById("dump-project-name");
  const id = resolveProject(project?.value || "", name?.value || "");
  if (project?.value === "__new__" && !id) return undefined;
  return id || null;
}

function keepScrap(text, kind, picked, projectId) {
  db.scraps.unshift({ id: uid(), text: text.slice(0, 12000), createdAt: new Date().toISOString(), threadId: null, projectId: projectId || null, targetDate: dueWhen(kind, picked || ""), done: false });
  save();
}

function bindDump(dump) {
  const box = document.getElementById("scrap");
  const hidden = dump.querySelector("textarea");
  const due = document.getElementById("due");
  const pick = document.getElementById("due-pick");
  const project = document.getElementById("dump-project");
  const projectName = document.getElementById("dump-project-name");
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
  if (project && projectName) project.onchange = () => {
    projectName.hidden = project.value !== "__new__";
    if (!projectName.hidden) projectName.focus();
  };
  if (due && pick) due.onchange = () => {
    pick.hidden = due.value !== "pick";
    if (!pick.hidden) pick.focus();
  };
  const fresh = document.getElementById("dump-new");
  if (fresh) fresh.onclick = () => { editingId = ""; render(); };
  document.querySelectorAll("[data-load]").forEach((btn) => {
    btn.onclick = () => { editingId = btn.dataset.load; render(); };
  });
  if (box) sync();
  dump.onsubmit = (event) => {
    event.preventDefault();
    if (!box) return;
    const textValue = scrapText(box);
    if (!textValue) {
      box.focus();
      return;
    }
    const projectId = dumpProjectId();
    if (projectId === undefined) return;
    const targetDate = dueWhen(due?.value || "", pick?.value || "");
    const current = editingId ? db.scraps.find((item) => item.id === editingId) : null;
    if (current) {
      current.text = textValue.slice(0, 12000);
      current.projectId = projectId;
      current.targetDate = targetDate;
      notice = "Saved.";
      save();
    } else {
      keepScrap(textValue, due?.value || "", pick?.value || "", projectId);
      editingId = "";
      notice = "Kept.";
    }
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
  if (typeof bindExport === "function") bindExport();
  document.querySelectorAll("#tags [data-hash], #tags [data-project], [data-open], .win [data-project]").forEach((el) => {
    if (!el.title) el.title = "Right-click to delete";
  });
}
