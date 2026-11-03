/* Markdown parsing and sanitizing for the article body. */

import { encodeDocPath, isDocPath, resolveDocPath } from "./docs-path.js";

const slug = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

const ASSET_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|txt|json|zip|mp4|webm|mp3|wav)$/i;
const EXTERNAL_RE = /^[a-z][a-z0-9+.-]*:/i;

/* ---------- markdown ---------- */

function stripDangerous(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function splitUrl(value) {
  const match = String(value).match(/^([^?#]*)(.*)$/);
  return { path: match?.[1] || "", suffix: match?.[2] || "" };
}

function docsTarget(value, basePath, isImage) {
  if (!value || value.startsWith("#") || value.startsWith("//") || EXTERNAL_RE.test(value)) return null;
  const { path, suffix } = splitUrl(value);
  if (!path) return null;

  let resolved;
  if (path.startsWith("/")) {
    resolved = resolveDocPath("", path.slice(1));
  } else {
    resolved = resolveDocPath(basePath, path);
  }
  if (!resolved) return null;

  if (!isImage && isDocPath(resolved)) {
    // The hash route cannot carry a second fragment; open the document itself.
    return `#/docs/${encodeDocPath(resolved)}`;
  }
  if (ASSET_RE.test(path)) {
    return `/api/asset?path=${encodeURIComponent(resolved)}${suffix.startsWith("?") ? "&" + suffix.slice(1) : ""}`;
  }
  return null;
}

/** Rewrite relative Markdown links and images to docs-mode routes. */
function rewriteDocsLinks(root, basePath) {
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    const next = docsTarget(href, basePath, false);
    if (next) a.setAttribute("href", next);
  }
  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    const next = docsTarget(src, basePath, true);
    if (next) img.setAttribute("src", next);
  }
}

function highlightCode(root) {
  const hljs = window.hljs;
  if (!hljs) return;
  for (const code of root.querySelectorAll("pre > code")) {
    const text = code.textContent || "";
    if (!text.trim()) continue;
    const language = (code.className.match(/\blanguage-([^\s]+)/) || [])[1] || "";
    try {
      let value;
      if (!language) {
        const auto = hljs.highlightAuto(text);
        if (!auto.language || auto.relevance < 2) continue;
        value = auto.value;
      } else if (hljs.getLanguage(language)) {
        value = hljs.highlight(text, { language, ignoreIllegals: true }).value;
      } else {
        continue;
      }
      if (!value) continue;
      code.innerHTML = value;
      code.classList.add("hljs");
    } catch {
      // A malformed block should stay readable rather than break the page.
    }
  }
}

function mdToNodes(md, opts = null) {
  const raw = window.marked.parse(md, { gfm: true, breaks: false });
  const holder = document.createElement("div");
  holder.innerHTML = stripDangerous(raw);
  highlightCode(holder);
  const used = new Set();
  holder.querySelectorAll("h1, h2, h3").forEach((h) => {
    const base = slug(h.textContent) || "section";
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
  });
  if (opts?.basePath) rewriteDocsLinks(holder, opts.basePath);
  return holder;
}

export { mdToNodes };
