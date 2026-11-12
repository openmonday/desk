/* Safe reads for Markdown documents and their local assets.
 *
 * Docs mode and workspace mode share these reads: both confine the path to a
 * root, refuse symlink escapes, and allowlist asset types. */
import fs from "node:fs/promises";
import path from "node:path";

const MAX_DOC_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const DOC_RE = /\.(md|markdown)$/i;

export const ASSET_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function inside(root, real) {
  return real === root || real.startsWith(root + path.sep);
}

async function resolveInside(root, rel, deny = []) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  if (path.isAbsolute(rel)) return null;
  if (deny.includes(rel.split(/[\\/]/)[0])) return null;

  const rootReal = await fs.realpath(root);
  const abs = path.resolve(rootReal, rel);
  if (!inside(rootReal, abs)) return null;

  let real;
  try {
    real = await fs.realpath(abs);
  } catch {
    return null;
  }
  if (!inside(rootReal, real)) return null;

  const within = path.relative(rootReal, real).split(path.sep).join("/");
  if (deny.includes(within.split("/")[0])) return null;

  const st = await fs.stat(real).catch(() => null);
  if (!st?.isFile()) return null;
  return { real, stat: st, rel: within };
}

/** Read a Markdown document, confined to the root. */
export async function readDocsDoc(root, rel, opts = {}) {
  if (typeof rel !== "string" || !DOC_RE.test(rel)) return null;
  const hit = await resolveInside(root, rel, opts.deny);
  if (!hit || hit.stat.size > MAX_DOC_BYTES) return null;
  const md = await fs.readFile(hit.real, "utf8");
  return { md, mtime: hit.stat.mtimeMs, path: hit.rel };
}

/** Read an allowlisted asset (images, media, downloads), confined to the root. */
export async function readDocsAsset(root, rel, opts = {}) {
  if (typeof rel !== "string" || !rel) return null;
  const ext = path.extname(rel).toLowerCase();
  const type = ASSET_TYPES[ext];
  if (!type) return null;

  const hit = await resolveInside(root, rel, opts.deny);
  if (!hit || hit.stat.size > MAX_ASSET_BYTES) return null;
  const body = await fs.readFile(hit.real);
  return { body, type, size: body.length };
}
