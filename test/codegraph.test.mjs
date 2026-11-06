import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequestHandler } from "../src/server/http.mjs";
import { resolveTarget } from "../src/cli/target.mjs";
import { scanWorkspace } from "../src/lib/scan.mjs";
import { readCodeGraph } from "../src/lib/codegraph.mjs";
import { layoutCodeGraph } from "../public/js/codegraph-layout.js";
import { S } from "../public/js/state.js";
import { readHash } from "../public/js/hash.js";
import { installGraph, makeWorkspace } from "./helpers.mjs";

const GRAPH = "architecture/graph.json";

function filePaths(node, out = []) {
  if (node.type === "file") out.push(node.path);
  for (const child of node.children || []) filePaths(child, out);
  return out;
}

async function listen(t, workspace) {
  const publicDir = await mkdtemp(path.join(os.tmpdir(), "desk-public-"));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  const handler = createRequestHandler({
    mode: "desk",
    workspace,
    docsRoot: null,
    publicDir,
    clients: new Set(),
    getNav: async () => ({ order: ["context", "architecture", "features"], hidden: [], default: null }),
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("the scanner summarizes the graph and hides it from every document tree", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await installGraph(w.ws);

  const tree = await scanWorkspace(w.ws);
  assert.deepEqual(tree.diagnostics, []);
  assert.equal(tree.graph.path, GRAPH);
  assert.equal(tree.graph.symbols, 6);
  assert.equal(tree.graph.edges, 5);
  assert.equal(tree.graph.files, 3);
  assert.equal(tree.graph.generator.version, "0.1.0");

  assert.deepEqual(tree.architecture.map((record) => record.path), ["architecture/one.md"]);
  assert.ok(!filePaths(tree.files).includes(GRAPH), "graph.json must not be an Overview file");
});

test("a malformed graph is a diagnostic and leaves the Markdown views working", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await installGraph(w.ws, "graph-malformed.json");

  const tree = await scanWorkspace(w.ws);
  assert.equal(tree.graph, null);
  assert.equal(tree.context.exists, true);
  assert.equal(tree.architecture.length, 1);
  const diag = tree.diagnostics.find((item) => item.path === GRAPH);
  assert.ok(diag, "expected a graph diagnostic");
  assert.equal(diag.severity, "error");
  assert.match(diag.message, /not valid JSON/);
  assert.ok(filePaths(tree.files).includes("CONTEXT.md"));
});

test("a graph missing required arrays is a diagnostic", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeFile(
    path.join(w.ws, GRAPH),
    JSON.stringify({ schemaVersion: 1, generator: { name: "mycel", version: "0.1.0" }, root: "." }),
  );

  const tree = await scanWorkspace(w.ws);
  assert.equal(tree.graph, null);
  assert.match(tree.diagnostics.find((item) => item.path === GRAPH).message, /missing required array "symbols"/);
  assert.equal(tree.architecture[0].slug, "one");
});

test("the API exposes a summary on the tree and the full graph on demand", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await installGraph(w.ws);
  const base = await listen(t, w.ws);

  const tree = await (await fetch(`${base}/api/tree`)).json();
  assert.equal(tree.graph.symbols, 6);
  assert.equal(tree.graph.edges, 5);
  assert.equal(tree.graph.generator.version, "0.1.0");
  assert.equal(tree.symbols, undefined, "the raw graph must not ride on /api/tree");

  const graph = await fetch(`${base}/api/codegraph`);
  assert.equal(graph.status, 200);
  const body = await graph.json();
  assert.equal(body.ok, true);
  assert.equal(body.path, GRAPH);
  assert.equal(body.graph.schemaVersion, 1);
  assert.equal(body.graph.symbols.length, 6);
  assert.equal(body.graph.edges.length, 5);

  const raw = await fetch(`${base}/api/doc?path=${encodeURIComponent(GRAPH)}`);
  assert.equal(raw.status, 404, "graph.json is not readable as a Markdown document");
});

test("a direct graph target resolves to the workspace graph route", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await installGraph(w.ws);

  const direct = await resolveTarget(".desk/architecture/graph.json", w.root);
  assert.deepEqual(direct, {
    mode: "desk",
    root: w.root,
    dataDir: w.ws,
    route: "#/architecture/graph",
    file: true,
  });

  assert.equal((await resolveTarget(".desk/architecture", w.root)).route, "#/architecture");
  assert.equal((await resolveTarget(".desk/architecture/one.md", w.root)).route, "#/architecture/one");
});

test("#/architecture still opens a record when only records exist, and the graph when it does", () => {
  const tree = {
    mode: "desk",
    context: { exists: false, path: "CONTEXT.md" },
    architecture: [{ slug: "one", path: "architecture/one.md", title: "One", headings: [] }],
    features: [],
    files: { type: "dir", path: "", children: [] },
    graph: null,
    diagnostics: [],
  };
  S.tree = tree;
  globalThis.location = { hash: "#/architecture" };

  let loc = readHash();
  assert.equal(loc.tab, "architecture");
  assert.equal(loc.entry.kind, "arch");
  assert.equal(loc.entry.path, "architecture/one.md");

  S.tree = {
    ...tree,
    graph: {
      path: GRAPH,
      symbols: 6,
      edges: 5,
      generator: { name: "mycel", version: "0.1.0" },
    },
  };

  loc = readHash();
  assert.equal(loc.entry.kind, "codegraph");

  globalThis.location.hash = "#/architecture/graph";
  assert.equal(readHash().entry.kind, "codegraph");

  globalThis.location.hash = "#/architecture/one";
  assert.equal(readHash().entry.kind, "arch");
  assert.equal(readHash().entry.path, "architecture/one.md");
});

test("graph reads are confined to the workspace", async (t) => {
  const w = await makeWorkspace();
  const outside = await mkdtemp(path.join(os.tmpdir(), "desk-graph-outside-"));
  t.after(async () => {
    await w.cleanup();
    await rm(outside, { recursive: true, force: true });
  });
  const source = path.join(outside, "graph.json");
  await writeFile(source, await (await import("node:fs/promises")).readFile(new URL("./fixtures/graph.json", import.meta.url)));
  await symlink(source, path.join(w.ws, GRAPH));

  const result = await readCodeGraph(w.ws);
  assert.equal(result.ok, false);
  assert.match(result.message, /outside the workspace/);
});

test("code graph layout is deterministic and bounded", () => {
  const nodes = Array.from({ length: 36 }, (_, i) => ({ id: `symbol-${String(i).padStart(2, "0")}`, radius: 5 + (i % 4) }));
  const edges = Array.from({ length: 60 }, (_, i) => ({
    from: nodes[i % nodes.length].id,
    to: nodes[(i * 7 + 3) % nodes.length].id,
  }));
  const a = layoutCodeGraph(nodes, edges);
  const b = layoutCodeGraph([...nodes].reverse(), [...edges].reverse());

  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  assert.deepEqual([...a.points.entries()], [...b.points.entries()]);
  for (const point of a.points.values()) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= 0 && point.x <= a.width);
    assert.ok(point.y >= 0 && point.y <= a.height);
  }
});
