/* Filesystem access for a `.context` workspace.
 *
 * The workspace is the `.context/` directory at a project root: the glossary,
 * the map records, the issues, and checkouts of reference projects. Everything
 * is read-only and stays inside that directory. */
import fs from "node:fs/promises";
import path from "node:path";

export const CONTEXT_DIR = ".context";
export const REFERENCE_DIR = "reference";

/** True when a directory looks like the `.context/` workspace the skills create. */
export async function isContextDir(dir) {
  for (const name of ["GLOSSARY.md", "map", "issues"]) {
    const st = await fs.stat(path.join(dir, name)).catch(() => null);
    if (st) return true;
  }
  return false;
}

/** Walk up from `start` looking for a `.context` workspace directory. */
export async function findWorkspace(start) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, CONTEXT_DIR);
    if (await isContextDir(candidate)) return candidate;
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

/** Reference checkouts are repositories, never documents. */
export function isReferencePath(rel) {
  const parts = String(rel || "").split("/");
  return parts[0] === REFERENCE_DIR || parts[0] === `${CONTEXT_DIR}/${REFERENCE_DIR}`;
}

/** Resolve a client-supplied relative path to a readable markdown file inside the workspace. */
export async function resolveDoc(assist, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  if (!rel.endsWith(".md")) return null;
  if (isReferencePath(rel)) return null;

  const root = await fs.realpath(assist);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (isReferencePath(path.relative(root, abs).split(path.sep).join("/"))) return null;

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
