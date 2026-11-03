/* Paths shared by docs mode and Markdown link rewriting. Paths are relative to
 * the docs root and always use forward slashes, regardless of the server OS. */

const DOC_RE = /\.(md|markdown)$/i;

export function isDocPath(path) {
  return DOC_RE.test(path);
}

export function encodeDocPath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

export function decodeDocPath(encoded) {
  return String(encoded || "").split("/").map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  }).join("/");
}

export function decodePathPart(part) {
  try { return decodeURIComponent(part); } catch { return part; }
}

/** Resolve a relative link against the folder containing a document. */
export function resolveDocPath(basePath, rel) {
  const parts = basePath ? basePath.split("/").slice(0, -1).filter(Boolean) : [];
  for (const raw of String(rel).split("/")) {
    const part = decodePathPart(raw);
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}
