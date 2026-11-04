/* Static assets from `public/`, with a small MIME allowlist and no traversal. */
import fsp from "node:fs/promises";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

const MAX_STATIC = 4 * 1024 * 1024;

/** Serve a file under `publicDir`; returns false when the route is not a static asset. */
export async function serveStatic(publicDir, pathname, req, res) {
  const root = path.resolve(publicDir);
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel.includes("\0")) return false;
  if (rel === "/") rel = "/shell.html";

  const abs = path.resolve(root, `.${rel}`);
  if (abs !== root && !abs.startsWith(root + path.sep)) return false;
  if (path.basename(abs).startsWith(".")) return false;

  const type = TYPES[path.extname(abs).toLowerCase()];
  if (!type) return false;

  let real;
  try {
    real = await fsp.realpath(abs);
  } catch {
    return false;
  }
  if (!real.startsWith(root + path.sep)) return false;

  const st = await fsp.stat(real).catch(() => null);
  if (!st?.isFile() || st.size > MAX_STATIC) return false;

  const body = await fsp.readFile(real);
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}
