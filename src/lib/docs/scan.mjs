/* Build a docs tree from a folder of Markdown files.
 *
 * Docs mode is deliberately simpler than .desk mode: every top-level folder is
 * a section, and every Markdown file below it is a read-only document. Root
 * Markdown files appear in a synthetic Overview section so a README is still
 * reachable. Hidden folders and common generated folders are ignored. */
import fs from "node:fs/promises";
import path from "node:path";
import { firstH1, titleCase } from "../markdown.mjs";
import { scanFeatures } from "../tickets/scan.mjs";

const DOC_RE = /\.(md|markdown)$/i;
const IGNORED = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const MAX_FILES = 2000;
const MAX_DEPTH = 12;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const natural = (a, b) => collator.compare(a, b);

/** True for a Markdown document. The server and client both use this rule. */
export function isDocName(name) {
  return DOC_RE.test(name);
}

function prettyName(name) {
  return titleCase(name.replace(DOC_RE, ""));
}

function isIgnored(name) {
  return name.startsWith(".") || IGNORED.has(name);
}

/** Display-only titles. Folder names are never changed on disk. */
function sectionTitle(name) {
  return name.toLowerCase() === "architecture" ? "Architecture" : titleCase(name);
}

/** README/index files first, then other documents, then subfolders. */
function nodeRank(node) {
  if (node.type === "file" && /^(readme|index)\.(md|markdown)$/i.test(node.name)) return 0;
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

function firstDocument(nodes) {
  const file = nodes.find((node) => node.type === "file");
  if (file) return file.path;
  for (const node of nodes) {
    if (node.type !== "dir") continue;
    const hit = firstDocument(node.children || []);
    if (hit) return hit;
  }
  return null;
}

async function looksLikeFeatures(root, dir) {
  let entries;
  try {
    entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || isIgnored(entry.name)) continue;
    const child = path.join(root, dir, entry.name);
    const spec = await fs.stat(path.join(child, "spec.md")).catch(() => null);
    if (spec?.isFile()) return true;
    const tickets = await fs.stat(path.join(child, "tickets")).catch(() => null);
    if (tickets?.isDirectory()) return true;
  }
  return false;
}

async function readDocMeta(root, rel, state) {
  const abs = path.join(root, rel);
  const st = await fs.stat(abs).catch(() => null);
  if (!st?.isFile()) return null;
  if (st.size > MAX_DOC_BYTES) {
    state.diagnostics.push({ severity: "warn", path: rel, message: "document is larger than 2 MB and was skipped" });
    return null;
  }
  const md = await fs.readFile(abs, "utf8").catch(() => null);
  if (md == null) return null;
  return {
    name: path.basename(rel),
    path: rel.split(path.sep).join("/"),
    title: firstH1(md) || prettyName(path.basename(rel)),
    mtime: st.mtimeMs,
  };
}

async function scanDir(root, rel, depth, state) {
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

    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      const children = await scanDir(root, childRel, depth + 1, state);
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
    if (!entry.isFile() || !isDocName(entry.name)) continue;

    const meta = await readDocMeta(root, childRel, state);
    if (!meta) continue;
    state.count += 1;
    nodes.push({ type: "file", ...meta });
  }

  return sortNodes(nodes);
}

/** Scan an arbitrary folder as a read-only Markdown library. */
export async function scanDocs(inputRoot) {
  const root = await fs.realpath(inputRoot);
  const st = await fs.stat(root);
  if (!st.isDirectory()) throw new Error("docs root is not a folder");

  const state = { count: 0, truncated: false, diagnostics: [] };
  const top = await fs.readdir(root, { withFileTypes: true });
  const rootFiles = [];
  const sections = [];

  for (const entry of top) {
    if (state.count >= MAX_FILES) {
      state.truncated = true;
      break;
    }
    if (isIgnored(entry.name)) continue;

    if (entry.isFile() && isDocName(entry.name)) {
      const meta = await readDocMeta(root, entry.name, state);
      if (meta) {
        state.count += 1;
        rootFiles.push({ type: "file", ...meta });
      }
      continue;
    }
    if (!entry.isDirectory()) continue;

    const tree = await scanDir(root, entry.name, 1, state);
    if (!tree.length) continue;

    // A feature folder is the one special section: it keeps the ticket/graph
    // view, while every other section remains a generic Markdown tree.
    if (entry.name === "features" && await looksLikeFeatures(root, entry.name)) {
      const diagnostics = [];
      const features = await scanFeatures(root, diagnostics);
      if (features.length) {
        state.diagnostics.push(...diagnostics);
        const first = features.find((f) => f.specPath) || features[0];
        sections.push({
          key: entry.name,
          kind: "features",
          title: sectionTitle(entry.name),
          path: entry.name,
          firstPath: first?.specPath || first?.tickets?.[0]?.path || firstDocument(tree),
          count: features.reduce((n, f) => n + (f.specPath ? 1 : 0) + f.tickets.length, 0),
          features,
          tree,
        });
        continue;
      }
    }

    const firstPath = firstDocument(tree);
    sections.push({
      key: entry.name,
      kind: "docs",
      title: sectionTitle(entry.name),
      path: entry.name,
      firstPath,
      count: tree.reduce((n, child) => n + countFiles(child), 0),
      tree,
    });
  }

  if (rootFiles.length) {
    const tree = sortNodes(rootFiles);
    // Keep a synthetic key that cannot shadow a real top-level `home/` folder.
    let homeKey = "home";
    for (let n = 2; sections.some((section) => section.key === homeKey); n += 1) {
      homeKey = `home-${n}`;
    }
    sections.unshift({
      key: homeKey,
      kind: "overview",
      title: "Overview",
      path: "",
      firstPath: tree[0]?.path || null,
      count: tree.length,
      tree,
    });
  }

  sections.sort((a, b) => {
    if (a.kind === "overview") return -1;
    if (b.kind === "overview") return 1;
    return natural(a.title, b.title);
  });

  if (state.truncated) {
    state.diagnostics.push({
      severity: "warn",
      path: ".",
      message: `docs tree was limited to ${MAX_FILES} files and ${MAX_DEPTH} levels`,
    });
  }

  return {
    ok: true,
    mode: "docs",
    root,
    name: path.basename(root),
    sections,
    diagnostics: state.diagnostics,
  };
}
