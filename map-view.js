function mapView() {
  const W = 1200, H = 900, pad = 72;
  const nodes = [];
  const edges = [];
  const cx = W / 2, cy = H / 2;
  const isHeading = (text) => /^#{1,6}\s/.test(String(text || "").trim());
  const projects = db.projects.slice(0, 10);
  const threads = db.threads.filter((thread) => !thread.done).slice(0, 20);
  const scraps = db.scraps.filter((scrap) => !scrap.done && !isHeading(scrap.text)).slice(0, 40);
  const sibAngle = (index, count, base = -Math.PI / 2) => {
    if (count <= 1) return base;
    const sweep = Math.min(Math.PI * 1.65, Math.PI * 0.42 * count);
    return base - sweep / 2 + (sweep * index) / Math.max(count - 1, 1);
  };
  projects.forEach((project, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(projects.length, 1) - Math.PI / 2;
    const rx = projects.length <= 1 ? 0 : 280;
    const ry = projects.length <= 1 ? 0 : 200;
    nodes.push({ id: "project:" + project.id, kind: "project", label: project.name, x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  });
  const threadsByParent = new Map();
  threads.forEach((thread) => {
    const key = thread.projectId || "_loose";
    if (!threadsByParent.has(key)) threadsByParent.set(key, []);
    threadsByParent.get(key).push(thread);
  });
  for (const [key, group] of threadsByParent) {
    const parent = key === "_loose" ? null : nodes.find((node) => node.id === "project:" + key);
    group.forEach((thread, index) => {
      const angle = sibAngle(index, group.length, parent ? Math.atan2(parent.y - cy, parent.x - cx) : -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(group.length, 1));
      const radX = parent ? 150 : 220;
      const radY = parent ? 110 : 170;
      nodes.push({
        id: "thread:" + thread.id,
        kind: "thread",
        label: thread.title,
        x: parent ? parent.x + Math.cos(angle) * radX : cx + Math.cos(angle) * radX,
        y: parent ? parent.y + Math.sin(angle) * radY : cy + Math.sin(angle) * radY,
      });
      if (parent) edges.push([parent.id, "thread:" + thread.id]);
    });
  }
  const scrapsByParent = new Map();
  scraps.forEach((scrap) => {
    const key = scrap.threadId ? "thread:" + scrap.threadId : scrap.projectId ? "project:" + scrap.projectId : "_loose";
    if (!scrapsByParent.has(key)) scrapsByParent.set(key, []);
    scrapsByParent.get(key).push(scrap);
  });
  for (const [key, group] of scrapsByParent) {
    const parent = key === "_loose" ? null : nodes.find((node) => node.id === key);
    group.forEach((scrap, index) => {
      const outward = parent ? Math.atan2(parent.y - cy, parent.x - cx) : -Math.PI / 2;
      const angle = sibAngle(index, group.length, outward);
      const radX = parent ? 118 : 340;
      const radY = parent ? 88 : 260;
      nodes.push({
        id: "scrap:" + scrap.id,
        kind: "scrap",
        label: scrap.text,
        x: parent ? parent.x + Math.cos(angle) * radX : cx + Math.cos(angle) * radX,
        y: parent ? parent.y + Math.sin(angle) * radY : cy + Math.sin(angle) * radY,
      });
      if (parent) edges.push([parent.id, "scrap:" + scrap.id]);
    });
  }
  for (const scrap of scraps) {
    for (const link of wikis(scrap.text)) {
      const needle = link.toLowerCase();
      const target = nodes.find((node) => node.id !== "scrap:" + scrap.id && node.label.toLowerCase().includes(needle));
      if (target) edges.push(["scrap:" + scrap.id, target.id]);
    }
  }
  const minGap = (a, b) => {
    const base = Math.max(a.kind === "project" ? 96 : a.kind === "thread" ? 78 : 62, b.kind === "project" ? 96 : b.kind === "thread" ? 78 : 62);
    return base + 36;
  };
  for (let iter = 0; iter < 48; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const need = minGap(a, b);
        if (dist >= need) continue;
        const push = ((need - dist) / dist) * 0.5;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
    for (const node of nodes) {
      node.x = Math.min(W - pad, Math.max(pad, node.x));
      node.y = Math.min(H - pad, Math.max(pad, node.y));
    }
  }
  if (nodes.length >= 2) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y);
    }
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
    const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
    if (scale > 1.08) {
      const use = Math.min(scale, 3.2);
      const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
      for (const node of nodes) {
        node.x = cx + (node.x - midX) * use;
        node.y = cy + (node.y - midY) * use;
        node.x = Math.min(W - pad, Math.max(pad, node.x));
        node.y = Math.min(H - pad, Math.max(pad, node.y));
      }
    }
  }
  const labelLines = (raw) => {
    let text = String(raw || "").replace(/\s+/g, " ").trim();
    if (isHeading(text)) text = text.replace(/^#{1,6}\s+/, "");
    const max = 36;
    if (text.length <= max) return [text];
    const soft = 28;
    const words = text.split(" ");
    let first = "", second = "";
    for (const word of words) {
      const next1 = first ? first + " " + word : word;
      if (!second && next1.length <= soft) { first = next1; continue; }
      const next2 = second ? second + " " + word : word;
      if (next2.length <= soft) { second = next2; continue; }
      if (!second) {
        first = text.slice(0, soft);
        second = text.slice(soft, soft * 2);
      }
      break;
    }
    if (!second) return [text.slice(0, max) + (text.length > max ? "…" : "")];
    const used = (first + " " + second).length;
    if (used < text.length && !second.endsWith("…")) second = second.replace(/\s+\S*$/, "") + "…";
    if (second === "…") return [first.slice(0, max - 1) + "…"];
    return [first, second];
  };
  const lines = edges.map(([from, to]) => {
    const a = nodes.find((node) => node.id === from);
    const b = nodes.find((node) => node.id === to);
    if (!a || !b) return "";
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.42" stroke-width="1.35"/>`;
  }).join("");
  const dots = nodes.map((node) => {
    const r = node.kind === "project" ? 12 : node.kind === "thread" ? 9 : 6;
    const parts = labelLines(node.label);
    const ty = node.y + r + 14;
    const spans = parts.map((line, i) => `<tspan x="${node.x.toFixed(1)}" dy="${i === 0 ? 0 : 14}">${esc(line)}</tspan>`).join("");
    return `<g data-map="${esc(node.id)}" style="cursor:pointer"><circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${r}" fill="${node.kind === "scrap" ? "var(--muted)" : "var(--clay)"}"/><text text-anchor="middle" x="${node.x.toFixed(1)}" y="${ty.toFixed(1)}">${spans}</text></g>`;
  }).join("");
  return `<p class="kicker">Map</p><h1>How notes connect</h1>
    <p class="sub">Projects and threads pull their notes in. A [[name]] in a note draws a line to a matching title.</p>
    ${nodes.length ? `<svg class="map" viewBox="0 0 ${W} ${H}">${lines}${dots}</svg>` : `<p class="empty">Dump a few notes and the map will have something to show.</p>`}`;
}
