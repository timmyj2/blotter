let exportNotes = [];

function noteTitle(text) {
  const line = String(text || "").split("\n").map((part) => part.trim()).find(Boolean) || "Note";
  return line.replace(/^(?:- |\*\*|## |\+\+)/, "").replace(/\*\*/g, "").replace(/\+\+/g, "").slice(0, 80);
}

function noteMarkdown(scrap) {
  const tags = [...String(scrap.text || "").matchAll(/(^|\s)#([A-Za-z][\w-]{0,40})/g)].map((match) => "#" + match[2]);
  const links = [...String(scrap.text || "").matchAll(/\[\[([^\]\n]{1,80})\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
  const thread = scrap.threadId ? db.threads.find((item) => item.id === scrap.threadId) : null;
  const project = scrap.projectId ? projectName(scrap.projectId) : "";
  const lines = [
    `## ${noteTitle(scrap.text)}`,
    "",
    `- Id: ${scrap.id || "draft"}`,
    `- Project: ${project || "none"}`,
    `- Due: ${scrap.targetDate || "none"}`,
    `- Written: ${scrap.createdAt || ""}`,
  ];
  if (thread) lines.push(`- Thread: ${thread.title}`);
  if (tags.length) lines.push(`- Tags: ${[...new Set(tags)].join(" ")}`);
  if (links.length) lines.push(`- Links: ${links.map((link) => `[[${link}]]`).join(" ")}`);
  lines.push("", String(scrap.text || "").trim(), "");
  return lines.join("\n");
}

function buildExport(scraps) {
  const who = account?.email || "";
  return [
    "# Blotter notes",
    "",
    `Exported: ${new Date().toISOString()}`,
    who ? `Account: ${who}` : "",
    "",
    "Bold is **like this**. Underline is ++like this++. A line that starts with \"- \" is a bullet.",
    "",
    "---",
    "",
    scraps.map(noteMarkdown).join("\n---\n\n"),
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

function exportFilename() {
  const day = new Date().toISOString().slice(0, 10);
  if (exportNotes.length === 1) {
    const slug = noteTitle(exportNotes[0].text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return `blotter-${slug || "note"}-${day}.md`;
  }
  return `blotter-notes-${day}.md`;
}

function downloadMarkdown(name, body) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openExport(scraps) {
  exportNotes = scraps.filter((scrap) => scrap && String(scrap.text || "").trim());
  const dialog = document.getElementById("export-mail");
  const count = document.getElementById("export-count");
  const to = document.getElementById("export-to");
  if (!dialog || !exportNotes.length) {
    notice = "Nothing to export.";
    render();
    return;
  }
  if (count) count.textContent = exportNotes.length === 1 ? "1 note, with the project, date, tags, and full text." : `${exportNotes.length} notes, with the project, date, tags, and full text.`;
  if (to && !to.value) to.value = account?.email || "";
  if (!dialog.open) dialog.showModal();
}

function liveDumpNote() {
  const box = document.getElementById("scrap");
  if (!box || typeof scrapText !== "function") return null;
  const text = scrapText(box).trim();
  if (!text) return null;
  const current = typeof editingId !== "undefined" && editingId ? db.scraps.find((item) => item.id === editingId) : null;
  const projectId = typeof dumpProjectId === "function" ? dumpProjectId() : current?.projectId || null;
  if (projectId === undefined) return null;
  const due = document.getElementById("due");
  const pick = document.getElementById("due-pick");
  return {
    id: current?.id || "draft",
    text,
    createdAt: current?.createdAt || new Date().toISOString(),
    projectId: projectId || null,
    targetDate: dueWhen(due?.value || "", pick?.value || ""),
    threadId: current?.threadId || null,
    done: false,
  };
}

function bindExport() {
  const openBtn = document.getElementById("export-open");
  if (openBtn) openBtn.onclick = () => {
    const note = liveDumpNote();
    if (!note) {
      notice = "Write a note before exporting it.";
      render();
      return;
    }
    openExport([note]);
  };
  const selectedBtn = document.getElementById("export-selected");
  if (selectedBtn) selectedBtn.onclick = () => {
    const notes = [...selected].map((id) => db.scraps.find((item) => item.id === id)).filter(Boolean);
    openExport(notes);
  };
  document.querySelectorAll("[data-export-project]").forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation();
      const id = btn.dataset.exportProject;
      const notes = [
        ...db.threads.filter((thread) => thread.projectId === id && !thread.done).flatMap((thread) => db.scraps.filter((scrap) => scrap.threadId === thread.id)),
        ...db.scraps.filter((scrap) => scrap.projectId === id && !scrap.threadId),
      ];
      const seen = new Set();
      openExport(notes.filter((scrap) => seen.has(scrap.id) ? false : seen.add(scrap.id)));
    };
  });
  const editing = document.getElementById("export-editing");
  if (editing && !editing.dataset.bound) {
    editing.dataset.bound = "1";
    editing.onclick = () => {
      const form = document.getElementById("note-edit");
      const write = document.getElementById("edit-write");
      const scrap = db.scraps.find((item) => item.id === editId);
      const text = write && typeof scrapText === "function" ? scrapText(write).trim() : scrap?.text || "";
      if (!text) return;
      const projectId = form ? resolveProject(form.project.value, form.projectName.value || "") : scrap?.projectId || null;
      openExport([{
        id: scrap?.id || "draft",
        text,
        createdAt: scrap?.createdAt || new Date().toISOString(),
        projectId: projectId || null,
        targetDate: form?.date?.value || scrap?.targetDate || null,
        threadId: scrap?.threadId || null,
        done: !!scrap?.done,
      }]);
    };
  }
  const dialog = document.getElementById("export-mail");
  const form = document.getElementById("export-form");
  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.onsubmit = (event) => {
      event.preventDefault();
      const to = new FormData(form).get("to").toString().trim();
      if (!to || !exportNotes.length) return;
      const body = buildExport(exportNotes);
      const subject = exportNotes.length === 1 ? noteTitle(exportNotes[0].text) : `Blotter notes (${exportNotes.length})`;
      const file = exportFilename();
      if (body.length > 1500) {
        downloadMarkdown(file, body);
        const short = `The full markdown is in ${file}, which just downloaded. Attach that file.\n\n${exportNotes.map((scrap) => "- " + noteTitle(scrap.text)).join("\n")}`;
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(short)}`, "_blank", "noopener");
      } else {
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
      }
    };
    document.getElementById("export-download").onclick = () => {
      if (!exportNotes.length) return;
      downloadMarkdown(exportFilename(), buildExport(exportNotes));
    };
    document.getElementById("export-close").onclick = () => dialog.close();
    dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
  }
}
