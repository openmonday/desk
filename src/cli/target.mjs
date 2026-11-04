/* Resolve `desk <path>` into a server mode, a root, and an initial hash route.
 *
 * The workspace view is for the workspace root, folders under `.desk/`, and the
 * Markdown files that map to a workspace record. Any other Markdown file opens
 * as a library from its own folder, even when it lives under `.desk/`.
 */
import fsp from "node:fs/promises";
import path from "node:path";

const DOC_RE = /\.(md|markdown)$/i;

const fail = (message) => Object.assign(new Error(message), { desk: true });
const toPosix = (p) => p.split(path.sep).join("/");

/** Same encoding as public/js/docs-path.js, so the hash route matches. */
export function encodeDocPath(rel) {
  return String(rel || "").split("/").map(encodeURIComponent).join("/");
}

/** The hash route the page should open for a file inside a `.desk` workspace. */
export function deskRoute(dataDir, file) {
  const rel = toPosix(path.relative(dataDir, file));
  if (rel === "CONTEXT.md") return "#/context";

  const arch = rel.match(/^arch\/([^/]+)$/);
  if (arch) return `#/architecture/${arch[1].replace(/\.md$/, "")}`;

  const spec = rel.match(/^features\/([^/]+)\/spec\.md$/);
  if (spec) return `#/features/${spec[1]}`;

  const ticket = rel.match(/^features\/([^/]+)\/tickets\/(\d+)[^/]*$/);
  if (ticket) return `#/features/${ticket[1]}/${Number(ticket[2])}`;

  return null;
}

/** The hash route the page should open for a folder inside a `.desk` workspace. */
export function deskDirRoute(dataDir, dir) {
  const rel = toPosix(path.relative(dataDir, dir));
  if (rel === "features") return "#/features";
  if (rel === "arch") return "#/architecture";
  const feature = rel.match(/^features\/([^/]+)(?:\/tickets)?$/);
  if (feature) return `#/features/${feature[1]}`;
  return null;
}

async function findDataDir(target, isDir) {
  if (isDir) {
    if (path.basename(target) === ".desk") return target;
    const child = path.join(target, ".desk");
    const st = await fsp.stat(child).catch(() => null);
    if (st?.isDirectory()) return child;
  }
  let dir = target;
  for (;;) {
    if (path.basename(dir) === ".desk") return dir;
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
    if (dataDir) {
      return {
        mode: "desk", root: path.dirname(dataDir), dataDir,
        route: deskDirRoute(dataDir, abs), file: false,
      };
    }
    return { mode: "docs", root: abs, dataDir: null, route: null, file: false };
  }

  if (!stat.isFile()) throw fail(`not a file or folder: ${input}`);

  const dataDir = await findDataDir(path.dirname(abs), false);
  if (dataDir) {
    const route = deskRoute(dataDir, abs);
    if (route) {
      return { mode: "desk", root: path.dirname(dataDir), dataDir, route, file: true };
    }
    // Not a workspace record: fall through and open it as plain Markdown.
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
