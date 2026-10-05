export async function onRequest(context) {
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  let html = await response.text();
  if (!html.includes("window.__blotterDb = db")) {
    html = html.replace("let db = load();", "let db = load(); window.__blotterDb = db;");
    html = html.split("db = normalize(").join("window.__blotterDb = db = normalize(");
    html = html.split("db = blank();").join("window.__blotterDb = db = blank();");
    html = html.split("db = load();").join("window.__blotterDb = db = load();");
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
