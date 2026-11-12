/* Markdown file tree for the workspace Overview.
 *
 * The workspace model is organized by records, issues, and tasks; this scanner
 * adds the filesystem shape behind that model so the rail can show `.context/`
 * as a real tree. Only Markdown documents are included, matching the read
 * route. Reference checkouts are repositories, so they stay out. */
import fs from "node:fs/promises";
import path from "node:path";
import { REFERENCE_DIR } from "./workspace.mjs";

const DOC_RE = /\.md$/i;
const IGNORED = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const MAX_FILES = 2000;
const MAX_DEPTH = 12;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const natural = (a, b) => collator.compare(a, b);

function isIgnored(name) {
  return name.startsWith(".") || IGNORED.has(name);
}

/** README/index files first, then other documents, then subfolders. */
function nodeRank(node) {
  if (node.type === "file" && /^(readme|index)\.md$/i.test(node.name)) return 0;
  if (node.type === "file") return 1;
  return 2;
}

function sortNodes(nodes) {
  return nodes.sort((a, b) => {
    const rank = nodeRank(a) - nodeRank(b);
    return rank || natural(a.name, b.name);
  });
}

function countFiles(node) {
  if (node.type === "file") return 1;
  return (node.children || []).reduce((n, child) => n + countFiles(child), 0);
}

async function readFileNode(root, rel, state) {
  const abs = path.join(root, rel);
  const st = await fs.stat(abs).catch(() => null);
  if (!st?.isFile() || st.size > MAX_DOC_BYTES) return null;
  state.count += 1;
  const name = path.basename(rel);
  return {
    type: "file",
    name,
    path: rel.split(path.sep).join("/"),
    title: name,
    mtime: st.mtimeMs,
  };
}

async function walk(root, rel, depth, state) {
  if (depth > MAX_DEPTH) {
    state.truncated = true;
    return [];
  }
  const abs = rel ? path.join(root, rel) : root;
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes = [];
  for (const entry of entries) {
    if (state.count >= MAX_FILES) {
      state.truncated = true;
      break;
    }
    if (isIgnored(entry.name)) continue;
    if (!rel && entry.name === REFERENCE_DIR) continue;

    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      const children = await walk(root, childRel, depth + 1, state);
      if (!children.length) continue;
      nodes.push({
        type: "dir",
        name: entry.name,
        path: childRel,
        title: entry.name,
        count: children.reduce((n, child) => n + countFiles(child), 0),
        children,
      });
      continue;
    }
    if (!entry.isFile() || !DOC_RE.test(entry.name)) continue;
    const file = await readFileNode(root, childRel, state);
    if (file) nodes.push(file);
  }

  return sortNodes(nodes);
}

/** Build the root `.context/` node shown by the workspace Overview. */
export async function scanWorkspaceFiles(assist) {
  const root = await fs.realpath(assist);
  const state = { count: 0, truncated: false };
  const children = await walk(root, "", 0, state);
  return {
    type: "dir",
    name: path.basename(root) || "Workspace",
    title: path.basename(root) || "Workspace",
    path: "",
    count: children.reduce((n, child) => n + countFiles(child), 0),
    children,
    truncated: state.truncated,
  };
}
