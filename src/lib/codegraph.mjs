/* The read-only code graph produced by mycel.
 *
 * `.desk/architecture/graph.json` is a data input, not a document. This module
 * confines the read to the workspace, checks the top-level contract, and caches
 * the parsed document until the file changes. The scanner exposes only a small
 * summary, so `/api/tree` never carries the whole graph.
 */
import fsp from "node:fs/promises";
import path from "node:path";

export const CODE_GRAPH_PATH = "architecture/graph.json";
const MAX_BYTES = 32 * 1024 * 1024;
const CACHE_LIMIT = 8;
const REQUIRED_ARRAYS = ["translationUnits", "files", "symbols", "edges", "hierarchies"];

const cache = new Map();

const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const failure = (message) => ({ ok: false, path: CODE_GRAPH_PATH, message });
const missing = () => ({ ok: false, path: CODE_GRAPH_PATH, missing: true });

/** True for the one graph input the workspace understands. */
export function isCodeGraphPath(rel) {
  return String(rel || "").replace(/^\.\//, "") === CODE_GRAPH_PATH;
}

/** Check the top-level contract before the page trusts the document. */
export function validateCodeGraph(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure("is not a JSON object");
  }

  const problems = [];
  if (typeof value.schemaVersion !== "number") {
    problems.push('missing a numeric "schemaVersion"');
  }
  if (!value.generator || typeof value.generator !== "object" || Array.isArray(value.generator)
    || typeof value.generator.name !== "string" || typeof value.generator.version !== "string") {
    problems.push('missing a "generator" with string name and version');
  }
  if (typeof value.root !== "string") {
    problems.push('missing a string "root"');
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(value[key])) problems.push(`missing required array "${key}"`);
  }

  if (problems.length) return failure(problems.join("; "));
  return { ok: true };
}

export function summarizeCodeGraph(graph, meta = {}) {
  return {
    path: CODE_GRAPH_PATH,
    root: graph.root,
    symbols: graph.symbols.length,
    edges: graph.edges.length,
    files: graph.files.length,
    hierarchies: graph.hierarchies.length,
    translationUnits: graph.translationUnits.length,
    generator: {
      name: graph.generator.name,
      version: graph.generator.version,
    },
    mtime: meta.mtime ?? null,
    bytes: meta.bytes ?? null,
  };
}

function remember(file, signature, result) {
  cache.delete(file);
  cache.set(file, { signature, result });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

function sizeLabel(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read and validate the workspace graph.
 * Returns `{ ok: true, graph, summary, mtime, bytes }`, a missing marker, or a
 * failure with a diagnostic-ready message.
 */
export async function readCodeGraph(assist) {
  let root;
  try {
    root = await fsp.realpath(assist);
  } catch {
    return missing();
  }

  const abs = path.resolve(root, CODE_GRAPH_PATH);
  if (!inside(root, abs)) return failure("resolves outside the workspace");

  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch (err) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return missing();
    return failure(`could not be read: ${err?.message || err}`);
  }
  if (!stat.isFile()) return missing();
  if (stat.size > MAX_BYTES) {
    return failure(`is ${sizeLabel(stat.size)}; the read limit is ${sizeLabel(MAX_BYTES)}`);
  }

  let real;
  try {
    real = await fsp.realpath(abs);
  } catch (err) {
    return failure(`could not be resolved: ${err?.message || err}`);
  }
  if (!inside(root, real)) return failure("resolves outside the workspace");

  const signature = `${stat.size}:${stat.mtimeMs}`;
  const hit = cache.get(real);
  if (hit?.signature === signature) {
    cache.delete(real);
    cache.set(real, hit);
    return hit.result;
  }

  let text;
  try {
    text = await fsp.readFile(real, "utf8");
  } catch (err) {
    const result = failure(`could not be read: ${err?.message || err}`);
    remember(real, signature, result);
    return result;
  }

  let graph;
  try {
    graph = JSON.parse(text);
  } catch (err) {
    const result = failure(`is not valid JSON: ${err?.message || err}`);
    remember(real, signature, result);
    return result;
  }

  const valid = validateCodeGraph(graph);
  if (!valid.ok) {
    remember(real, signature, valid);
    return valid;
  }

  const meta = { mtime: stat.mtimeMs, bytes: stat.size };
  const result = {
    ok: true,
    path: CODE_GRAPH_PATH,
    graph,
    summary: summarizeCodeGraph(graph, meta),
    ...meta,
  };
  remember(real, signature, result);
  return result;
}
