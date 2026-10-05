function mapView() {
  const W = 1100, H = 720, padX = 118, padY = 64;
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
      node.x = Math.min(W - padX, Math.max(padX, node.x));
      node.y = Math.min(H - padY, Math.max(padY, node.y));
    }
  }
  if (nodes.length >= 2) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y);
    }
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
    const scale = Math.min((W - padX * 2) / bw, (H - padY * 2) / bh);
    if (scale > 1.08) {
      const use = Math.min(scale, 2.6);
      const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
      for (const node of nodes) {
        node.x = cx + (node.x - midX) * use;
        node.y = cy + (node.y - midY) * use;
        node.x = Math.min(W - padX, Math.max(padX, node.x));
        node.y = Math.min(H - padY, Math.max(padY, node.y));
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
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.58" stroke-width="1.7"/>`;
  }).join("");
  const dots = nodes.map((node) => {
    const r = node.kind === "project" ? 12 : node.kind === "thread" ? 9 : 6;
    const parts = labelLines(node.label);
    const widest = Math.max(...parts.map((line) => line.length), 1);
    const half = Math.min(widest * 4.4, 112);
    let lx = node.x;
    let anchor = "middle";
    if (node.x - half < 14) { anchor = "start"; lx = Math.max(8, node.x - r); }
    else if (node.x + half > W - 14) { anchor = "end"; lx = Math.min(W - 8, node.x + r); }
    const ty = Math.min(H - 10, node.y + r + 16);
    const spans = parts.map((line, i) => `<tspan x="${lx.toFixed(1)}" dy="${i === 0 ? 0 : 15}">${esc(line)}</tspan>`).join("");
    return `<g data-map="${esc(node.id)}" style="cursor:pointer"><circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${r}" fill="${node.kind === "scrap" ? "var(--muted)" : "var(--clay)"}"/><text text-anchor="${anchor}" x="${lx.toFixed(1)}" y="${ty.toFixed(1)}">${spans}</text></g>`;
  }).join("");
  return `<p class="kicker">Map</p><h1>How notes connect</h1>
    <p class="sub">Projects and threads pull their notes in. A [[name]] in a note draws a line to a matching title. Pinch, scroll, or drag to look around.</p>
    ${nodes.length ? `<div class="map-shell">
      <div class="map-zoom seg" role="group" aria-label="Map zoom">
        <button type="button" data-map-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
        <button type="button" data-map-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
        <button type="button" data-map-zoom="reset" title="Reset" aria-label="Reset map">Reset</button>
      </div>
      <svg class="map" data-w="${W}" data-h="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Connection map">${lines}${dots}</svg>
    </div>` : `<p class="empty">Dump a few notes and the map will have something to show.</p>`}`;
}

function bindMapZoom() {
  const shell = document.querySelector(".map-shell");
  const svg = shell && shell.querySelector("svg.map");
  if (!shell || !svg || svg.dataset.zoomBound === "1") return;
  svg.dataset.zoomBound = "1";
  const W = Number(svg.dataset.w) || 1100;
  const H = Number(svg.dataset.h) || 720;
  const MIN_Z = 0.65;
  const MAX_Z = 2.6;
  let z = 1;
  let vx = 0;
  let vy = 0;
  let panned = false;
  const viewSize = () => ({ bw: W / z, bh: H / z });
  const clampPan = () => {
    const { bw, bh } = viewSize();
    const slackX = Math.max(0, W - bw);
    const slackY = Math.max(0, H - bh);
    vx = Math.min(slackX, Math.max(0, vx));
    vy = Math.min(slackY, Math.max(0, vy));
  };
  const apply = () => {
    clampPan();
    const { bw, bh } = viewSize();
    svg.setAttribute("viewBox", `${vx.toFixed(2)} ${vy.toFixed(2)} ${bw.toFixed(2)} ${bh.toFixed(2)}`);
  };
  const zoomAt = (clientX, clientY, nextZ) => {
    const nz = Math.min(MAX_Z, Math.max(MIN_Z, nextZ));
    if (nz === z) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      z = nz;
      apply();
      return;
    }
    const { bw, bh } = viewSize();
    const mx = ((clientX - rect.left) / rect.width) * bw + vx;
    const my = ((clientY - rect.top) / rect.height) * bh + vy;
    z = nz;
    const next = viewSize();
    vx = mx - ((clientX - rect.left) / rect.width) * next.bw;
    vy = my - ((clientY - rect.top) / rect.height) * next.bh;
    apply();
  };
  const bump = (factor) => {
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, z * factor);
  };
  const reset = () => {
    z = 1;
    vx = 0;
    vy = 0;
    apply();
  };
  shell.querySelectorAll("[data-map-zoom]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute("data-map-zoom");
      if (action === "in") bump(1.18);
      else if (action === "out") bump(1 / 1.18);
      else if (action === "reset") reset();
    });
  });
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
      zoomAt(e.clientX, e.clientY, z * factor);
    },
    { passive: false }
  );
  const pointers = new Map();
  let pinchDist = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    panned = false;
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (pointers.size === 2) {
      dragging = false;
      const pts = [...pointers.values()];
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      if (pinchDist > 0) {
        const ratio = dist / pinchDist;
        if (Math.abs(ratio - 1) > 0.01) {
          zoomAt(midX, midY, z * ratio);
          panned = true;
        }
      }
      pinchDist = dist;
      return;
    }
    if (!dragging || pointers.size !== 1) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const { bw, bh } = viewSize();
    const dx = ((e.clientX - lastX) / rect.width) * bw;
    const dy = ((e.clientY - lastY) / rect.height) * bh;
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 5) panned = true;
    lastX = e.clientX;
    lastY = e.clientY;
    vx -= dx;
    vy -= dy;
    apply();
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) dragging = false;
    else if (pointers.size === 1) {
      const only = [...pointers.values()][0];
      dragging = true;
      lastX = only.x;
      lastY = only.y;
    }
  };
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  shell.addEventListener(
    "click",
    (e) => {
      if (!panned) return;
      if (e.target.closest("[data-map]")) {
        e.preventDefault();
        e.stopPropagation();
      }
      panned = false;
    },
    true
  );
}
