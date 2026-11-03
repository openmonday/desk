/* Markdown parsing and sanitizing for the article body. */

const slug = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

/* ---------- markdown ---------- */

function stripDangerous(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function mdToNodes(md) {
  const raw = window.marked.parse(md, { gfm: true, breaks: false });
  const holder = document.createElement("div");
  holder.innerHTML = stripDangerous(raw);
  const used = new Set();
  holder.querySelectorAll("h1, h2, h3").forEach((h) => {
    const base = slug(h.textContent) || "section";
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
  });
  return holder;
}

export { mdToNodes };
