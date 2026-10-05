export async function onRequest(context) {
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  let html = await response.text();
  if (!html.includes("window.__blotterDb = db")) {
    html = html.replace(/\bdb = normalize\(/g, "window.__blotterDb = db = normalize(");
    html = html.replace(/\bdb = blank\(\);/g, "window.__blotterDb = db = blank();");
    html = html.replace(/(?<!let )db = load\(\);/g, "window.__blotterDb = db = load();");
    html = html.replace("let db = load();", "let db = load(); window.__blotterDb = db;");
  }
  if (!html.includes("note-edit.js")) {
    html = html.replace("</body>", '<script src="/note-edit.js" defer></script></body>');
  }
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
