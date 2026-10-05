(() => {
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
  const style = document.createElement("style");
  style.textContent = `#edit-note{max-height:min(85vh,36rem);width:min(34rem,calc(100% - 32px))}#edit-note .stack{margin-top:10px}#edit-note textarea.field{min-height:8rem}`;
  document.head.append(style);
  document.body.append(dialog);

  let editId = "";
  const form = dialog.querySelector("#note-edit");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&",
    "<": "<",
    ">": ">",
    "\"": """,
    "'": "&#39;"
  })[c]);

  function fill(scrap) {
    const project = form.project;
    const opts = [`<option value="">No project</option>`]
      .concat((window.__blotterDb?.projects || []).map((p) => `<option value="${esc(p.id)}" ${p.id === (scrap.projectId || "") ? "selected" : ""}>${esc(p.name)}</option>`))
      .concat([`<option value="__new__">New project</option>`]);
    project.innerHTML = opts.join("");
    form.projectName.value = "";
    form.projectName.hidden = true;
    form.text.value = scrap.text;
    form.date.value = scrap.targetDate || "";
  }

  function openEdit(id) {
    const scrap = window.__blotterDb?.scraps?.find((item) => item.id === id);
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
    const scrap = window.__blotterDb?.scraps?.find((item) => item.id === editId);
    if (!scrap) { closeEdit(); return; }
    const text = form.text.value.trim();
    if (!text) return;
    let projectId = form.project.value || null;
    if (form.project.value === "__new__") {
      const name = form.projectName.value.trim().slice(0, 60);
      if (!name) return;
      const existing = window.__blotterDb.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) projectId = existing.id;
      else {
        projectId = crypto.randomUUID();
        window.__blotterDb.projects.push({ id: projectId, name, createdAt: new Date().toISOString() });
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
    const db = window.__blotterDb;
    if (!db) return;
    document.querySelectorAll("[data-read]").forEach((btn) => {
      const id = scrapIdFromRead(btn.dataset.read);
      if (id && db.scraps.some((s) => s.id === id)) btn.dataset.edit = id;
    });
    document.querySelectorAll(".scraplink:not([data-thread]):not([data-edit]):not([data-map])").forEach((btn) => {
      const label = btn.textContent.replace(/\s+/g, " ").trim().replace(/…$/, "");
      const scrap = db.scraps.find((s) => !s.done && (s.text === label || s.text.startsWith(label.slice(0, 48))));
      if (scrap) btn.dataset.edit = scrap.id;
    });
    document.querySelectorAll("article.card").forEach((card) => {
      if (card.querySelector("[data-edit],[data-thread],[data-map]")) return;
      const text = card.textContent.replace(/\s+/g, " ").trim();
      const scrap = db.scraps.find((s) => !s.done && text.includes(s.text.slice(0, 40)));
      if (scrap) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "read";
        btn.dataset.edit = scrap.id;
        btn.textContent = "Edit";
        const meta = card.querySelector(".meta") || card;
        meta.append(btn);
      }
    });
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-edit]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    openEdit(btn.dataset.edit);
  }, true);

  // Prefer expand-clicks becoming edits for scraps
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-read]");
    if (!btn || btn.dataset.edit) return;
    const id = scrapIdFromRead(btn.dataset.read);
    if (!id) return;
    if (!window.__blotterDb?.scraps?.some((s) => s.id === id)) return;
    event.preventDefault();
    event.stopPropagation();
    openEdit(id);
  }, true);

  function hook() {
    if (typeof window.render !== "function") return false;
    // Capture db from save/render closure via a one-time monkeypatch of save
    const origSave = window.save;
    const origRender = window.render;
    // Probe: functions declared with function keyword are global; db is let — sync from API/localStorage after render by reading account state
    window.render = function patchedRender() {
      const result = origRender.apply(this, arguments);
      // try to keep a mirror: if signed-out, localStorage has it
      try {
        const local = JSON.parse(localStorage.getItem("return-site-v1") || "null");
        if (local && Array.isArray(local.scraps)) window.__blotterDb = local;
      } catch {}
      // When signed in, save() only pushes remote and does not write localStorage.
      // Mirror by intercepting fetch to /api/desk PUT body.
      enhance();
      return result;
    };
    if (typeof origSave === "function") {
      window.save = function patchedSave() {
        if (window.__blotterDb && !document.getElementById("who")?.textContent) {
          try { localStorage.setItem("return-site-v1", JSON.stringify(window.__blotterDb)); } catch {}
        }
        return origSave.apply(this, arguments);
      };
    }
    const origFetch = window.fetch;
    window.fetch = function(input, init) {
      const url = String(input);
      if (url.includes("/api/desk") && init && init.method === "PUT" && init.body) {
        try { window.__blotterDb = JSON.parse(init.body); } catch {}
      }
      return origFetch.apply(this, arguments).then(async (res) => {
        if (url.includes("/api/desk") && (!init || !init.method || init.method === "GET") && res.ok) {
          try {
            const clone = res.clone();
            const data = await clone.json();
            if (data && Array.isArray(data.scraps)) window.__blotterDb = data;
          } catch {}
        }
        return res;
      });
    };
    enhance();
    return true;
  }

  const t = setInterval(() => { if (hook()) clearInterval(t); }, 50);
  setTimeout(() => clearInterval(t), 15000);
  window.openEdit = openEdit;
})();
