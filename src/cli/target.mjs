/* Resolve `leaf <path>` into a server mode, a root, and an initial hash route.
 *
 * The workspace view is for the `.context/` directory, folders under it, and
 * the Markdown files recorded there. Reference checkouts under
 * `.context/reference/` are repositories, so they open as Markdown libraries
 * instead. Any Markdown file outside `.context/` opens as a library from its
 * own folder.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { CONTEXT_DIR, REFERENCE_DIR, isContextDir, isReferencePath } from "../lib/workspace.mjs";
import { parseTask } from "../lib/tasks/parse.mjs";

const DOC_RE = /\.(md|markdown)$/i;

const fail = (message) => Object.assign(new Error(message), { leaf: true });
const toPosix = (p) => p.split(path.sep).join("/");

/** Same encoding as public/js/docs-path.js, so the hash route matches. */
export function encodeDocPath(rel) {
  return String(rel || "").split("/").map(encodeURIComponent).join("/");
}

/** The hash route the page should open for a file inside a `.context` workspace. */
export async function contextRoute(dataDir, file) {
  const rel = toPosix(path.relative(dataDir, file));
  if (rel === "GLOSSARY.md") return "#/glossary";
  if (isReferencePath(rel)) return null;

  const record = rel.match(/^map\/(.+)\.md$/);
  if (record) return `#/map/${encodeDocPath(record[1])}`;

  const spec = rel.match(/^issues\/([^/]+)\/spec\.md$/);
  if (spec) return `#/issues/${encodeDocPath(spec[1])}`;

  const research = rel.match(/^issues\/([^/]+)\/research\.md$/);
  if (research) return `#/issues/${encodeDocPath(research[1])}/research`;

  const taskFile = rel.match(/^issues\/([^/]+)\/tasks\/[^/]+\.md$/);
  if (taskFile) {
    const md = await fsp.readFile(file, "utf8").catch(() => null);
    const n = md == null ? null : parseTask(md).n;
    if (n != null) return `#/issues/${encodeDocPath(taskFile[1])}/${n}`;
  }

  // Every other Markdown file opens from the Overview tree.
  return `#/overview/${encodeDocPath(rel)}`;
}

/** The hash route the page should open for a folder inside a `.context` workspace. */
export function contextDirRoute(dataDir, dir) {
  const rel = toPosix(path.relative(dataDir, dir));
  if (rel === "map") return "#/map";
  if (rel === "issues") return "#/issues";
  const issue = rel.match(/^issues\/([^/]+)(?:\/(?:tasks|research))?$/);
  if (issue) return `#/issues/${encodeDocPath(issue[1])}`;
  return null;
}

async function findDataDir(target, isDir) {
  if (isDir) {
    if (path.basename(target) === CONTEXT_DIR && await isContextDir(target)) return target;
    const child = path.join(target, CONTEXT_DIR);
    if (await isContextDir(child)) return child;
  }
  let dir = target;
  for (;;) {
    if (path.basename(dir) === CONTEXT_DIR && await isContextDir(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Decide what a path means for the viewer.
 * Returns { mode, root, dataDir, route, file }.
 */
export async function resolveTarget(input = ".", cwd = process.cwd()) {
  const abs = path.resolve(cwd, input);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw fail(`no such file or folder: ${input}`);
  }

  if (stat.isDirectory()) {
    const dataDir = await findDataDir(abs, true);
    if (dataDir && !isReferencePath(path.relative(dataDir, abs))) {
      return {
        mode: "context", root: path.dirname(dataDir), dataDir,
        route: contextDirRoute(dataDir, abs), file: false,
      };
    }
    return { mode: "docs", root: abs, dataDir: null, route: null, file: false };
  }

  if (!stat.isFile()) throw fail(`not a file or folder: ${input}`);

  const dataDir = await findDataDir(path.dirname(abs), false);
  if (dataDir && !isReferencePath(toPosix(path.relative(dataDir, abs)))) {
    const route = await contextRoute(dataDir, abs);
    if (route) {
      return { mode: "context", root: path.dirname(dataDir), dataDir, route, file: true };
    }
  }

  if (!DOC_RE.test(abs)) throw fail(`not a Markdown file: ${input}`);
  const root = path.dirname(abs);
  return {
    mode: "docs",
    root,
    dataDir: null,
    route: `#/docs/${encodeDocPath(path.relative(root, abs))}`,
    file: true,
  };
}
