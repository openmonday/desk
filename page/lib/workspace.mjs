/* Filesystem access for a `.desk` workspace. */
import fs from "node:fs/promises";
import path from "node:path";

/** Walk up from `start` looking for a `.desk` directory. */
export async function findWorkspace(start) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, ".desk");
    try {
      const st = await fs.stat(candidate);
      if (st.isDirectory()) return candidate;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function readIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function listDir(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith(".md") && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

export async function listSubdirs(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Resolve a client-supplied relative path to a readable markdown file inside the workspace. */
export async function resolveDoc(assist, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  if (!rel.endsWith(".md")) return null;

  const root = await fs.realpath(assist);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;

  let real;
  try {
    real = await fs.realpath(abs);
  } catch {
    return null;
  }
  if (!real.startsWith(root + path.sep)) return null;

  const st = await fs.stat(real).catch(() => null);
  if (!st?.isFile() || st.size > 2 * 1024 * 1024) return null;

  return { real, mtime: st.mtimeMs };
}

export async function readDoc(assist, rel) {
  const hit = await resolveDoc(assist, rel);
  if (!hit) return null;
  const md = await fs.readFile(hit.real, "utf8");
  return { md, mtime: hit.mtime };
}
