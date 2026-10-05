(() => {
  const style = document.createElement("style");
  style.textContent = "#edit-note{max-height:min(85vh,36rem);width:min(34rem,calc(100% - 32px))}#edit-note .stack{margin-top:10px}#edit-note textarea.field{min-height:8rem}";
  document.head.append(style);

  const dialog = document.createElement("dialog");
  dialog.id = "edit-note";
  dialog.innerHTML = `<form id="note-edit" class="stack" style="margin-top:0">
    <p class="kicker">Edit note</p>
    <h2>Change it</h2>
    <textarea class="field" name="text" aria-label="Note text" required></textarea>
    <select class="field" name="project" aria-label="Project"></select>
    <input class="field" name="projectName" aria-label="New project name" placeholder="Name the project" hidden>
    <div class="row">
      <input class="field due" name="date" type="date" aria-label="Due date">
      <button class="btn" type="button" id="clear-date">Clear date</button>
    </div>
    <div class="row" style="margin-top:6px">
      <button class="btn ink" type="submit">Save</button>
      <button class="btn" type="button" id="cancel-edit">Cancel</button>
    </div>
  </form>`;
  document.body.append(dialog);

  let editId = "";
  const form = dialog.querySelector("#note-edit");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  function db() { return window.__blotterDb; }

  function fill(scrap) {
    const desk = db();
    const project = form.project;
    const opts = [`<option value="">No project</option>`]
      .concat((desk?.projects || []).map((p) => `<option value="${esc(p.id)}" ${p.id === (scrap.projectId || "") ? "selected" : ""}>${esc(p.name)}</option>`))
      .concat([`<option value="__new__">New project</option>`]);
    project.innerHTML = opts.join("");
    form.projectName.value = "";
    form.projectName.hidden = true;
    form.text.value = scrap.text;
    form.date.value = scrap.targetDate || "";
  }

  function openEdit(id) {
    const scrap = db()?.scraps?.find((item) => item.id === id);
    if (!scrap) return;
    editId = id;
    fill(scrap);
    if (!dialog.open) dialog.showModal();
    form.text.focus();
  }

  function closeEdit() {
    editId = "";
    if (dialog.open) dialog.close();
  }

  form.project.onchange = () => {
    form.projectName.hidden = form.project.value !== "__new__";
    if (!form.projectName.hidden) form.projectName.focus();
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const desk = db();
    const scrap = desk?.scraps?.find((item) => item.id === editId);
    if (!scrap) { closeEdit(); return; }
    const text = form.text.value.trim();
    if (!text) return;
    let projectId = form.project.value || null;
    if (form.project.value === "__new__") {
      const name = form.projectName.value.trim().slice(0, 60);
      if (!name) return;
      const existing = desk.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) projectId = existing.id;
      else {
        projectId = crypto.randomUUID();
        desk.projects.push({ id: projectId, name, createdAt: new Date().toISOString() });
      }
    } else if (projectId === "") projectId = null;
    scrap.text = text.slice(0, 12000);
    scrap.projectId = projectId;
    scrap.targetDate = form.date.value || null;
    closeEdit();
    if (typeof window.save === "function") window.save();
    if (typeof window.render === "function") window.render();
  };

  dialog.querySelector("#clear-date").onclick = () => { form.date.value = ""; };
  dialog.querySelector("#cancel-edit").onclick = () => closeEdit();
  dialog.addEventListener("close", () => { editId = ""; });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeEdit(); });

  function scrapIdFromRead(value) {
    if (!value) return "";
    if (value.startsWith("thread:")) return "";
    if (value.startsWith("scrap:")) return value.slice(6);
    return value;
  }

  function enhance() {
    const desk = db();
    if (!desk) return;
    document.querySelectorAll("[data-read]").forEach((btn) => {
      const id = scrapIdFromRead(btn.dataset.read);
      if (id && desk.scraps.some((s) => s.id === id)) btn.dataset.edit = id;
    });
    document.querySelectorAll(".scraplink:not([data-thread]):not([data-edit]):not([data-map])").forEach((btn) => {
      const label = btn.textContent.replace(/\s+/g, " ").trim().replace(/…$/, "");
      const scrap = desk.scraps.find((s) => !s.done && (s.text === label || s.text.startsWith(label.slice(0, 48))));
      if (scrap) btn.dataset.edit = scrap.id;
    });
    document.querySelectorAll("article.card").forEach((card) => {
      if (card.querySelector("[data-edit],[data-thread],[data-map],.check")) return;
      const body = card.querySelector("p, .read, h2")?.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!body) return;
      const scrap = desk.scraps.find((s) => !s.done && (s.text === body || s.text.startsWith(body.replace(/…$/, "").slice(0, 48))));
      if (!scrap) return;
      if (!card.querySelector("[data-edit]")) {
        const meta = card.querySelector(".meta") || card.appendChild(Object.assign(document.createElement("div"), { className: "meta" }));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.edit = scrap.id;
        btn.textContent = "Edit";
        meta.append(btn);
      }
    });
  }

  document.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit]");
    if (editBtn) {
      event.preventDefault();
      event.stopPropagation();
      openEdit(editBtn.dataset.edit);
      return;
    }
    const readBtn = event.target.closest("[data-read]");
    if (!readBtn) return;
    const id = scrapIdFromRead(readBtn.dataset.read);
    if (!id || !db()?.scraps?.some((s) => s.id === id)) return;
    event.preventDefault();
    event.stopPropagation();
    openEdit(id);
  }, true);

  function hook() {
    if (typeof window.render !== "function") return false;
    const origRender = window.render;
    window.render = function () {
      const result = origRender.apply(this, arguments);
      enhance();
      return result;
    };
    if (typeof window.openNode === "function") {
      const origOpen = window.openNode;
      window.openNode = function (ref) {
        const value = String(ref || "");
        if (value.startsWith("scrap:")) {
          openEdit(value.slice(6));
          return;
        }
        return origOpen.apply(this, arguments);
      };
    }
    enhance();
    return true;
  }

  const timer = setInterval(() => { if (hook()) clearInterval(timer); }, 50);
  setTimeout(() => clearInterval(timer), 20000);
  window.openEdit = openEdit;
})();
