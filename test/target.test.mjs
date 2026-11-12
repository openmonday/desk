import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveTarget } from "../src/cli/target.mjs";

async function makeTree(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "leaf-target-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, ".context", "map", "server"), { recursive: true });
  await mkdir(path.join(root, ".context", "issues", "demo", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".context", "reference", "other"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });

  const write = (rel, text = "# Doc\n") => writeFile(path.join(root, rel), text);
  await write(".context/GLOSSARY.md");
  await write(".context/AGENTS.md");
  await write(".context/map/server/http.md", "---\ntype: feat\nfiles:\n  - src/http.mjs\nsince: 0123456\n---\n\n# HTTP\n");
  await write(".context/issues/demo/spec.md", "## Problem Statement\n\nA fixture.\n");
  await write(".context/issues/demo/research.md", "# Research\n");
  await write(".context/issues/demo/tasks/cache-the-tree.md", "# 02: Cache the tree\n\nStatus: pending\n");
  await write(".context/reference/other/README.md");
  await write("docs/api.md");
  await write("docs/a b.md");
  await write("README.md");
  await write("README.txt");
  return root;
}

test("the workspace root and its folders open in workspace mode", async (t) => {
  const root = await makeTree(t);
  const ws = path.join(root, ".context");

  assert.deepEqual(
    await resolveTarget(".", root),
    { mode: "context", root, dataDir: ws, route: null, file: false },
  );
  assert.equal((await resolveTarget(".context", root)).root, root);
  assert.equal((await resolveTarget(".context/issues/demo", root)).mode, "context");
  assert.equal((await resolveTarget(".context/issues", root)).route, "#/issues");
  assert.equal((await resolveTarget(".context/issues/demo", root)).route, "#/issues/demo");
  assert.equal((await resolveTarget(".context/issues/demo/tasks", root)).route, "#/issues/demo");
  assert.equal((await resolveTarget(".context/map", root)).route, "#/map");
  assert.equal((await resolveTarget(".context/map/server", root)).route, null);
});

test("workspace files open at the route the page uses", async (t) => {
  const root = await makeTree(t);

  assert.equal((await resolveTarget(".context/GLOSSARY.md", root)).route, "#/glossary");
  assert.equal((await resolveTarget(".context/map/server/http.md", root)).route, "#/map/server/http");
  assert.equal((await resolveTarget(".context/issues/demo/spec.md", root)).route, "#/issues/demo");
  assert.equal((await resolveTarget(".context/issues/demo/research.md", root)).route, "#/issues/demo/research");
  assert.equal((await resolveTarget(".context/AGENTS.md", root)).route, "#/overview/AGENTS.md");

  const task = await resolveTarget(".context/issues/demo/tasks/cache-the-tree.md", root);
  assert.equal(task.route, "#/issues/demo/2");
  assert.equal(task.file, true);
});

test("reference checkouts open as Markdown libraries", async (t) => {
  const root = await makeTree(t);
  const ref = path.join(root, ".context", "reference", "other");

  assert.deepEqual(
    await resolveTarget(".context/reference/other", root),
    { mode: "docs", root: ref, dataDir: null, route: null, file: false },
  );
  assert.deepEqual(
    await resolveTarget(".context/reference/other/README.md", root),
    { mode: "docs", root: ref, dataDir: null, route: "#/docs/README.md", file: true },
  );
});

test("a file outside .context opens as a library from its own folder", async (t) => {
  const root = await makeTree(t);

  assert.deepEqual(
    await resolveTarget("docs/api.md", root),
    { mode: "docs", root: path.join(root, "docs"), dataDir: null, route: "#/docs/api.md", file: true },
  );
  assert.equal((await resolveTarget("README.md", root)).root, root);
  assert.equal((await resolveTarget("docs", root)).mode, "docs");
});

test("library routes encode path segments", async (t) => {
  const root = await makeTree(t);
  assert.equal((await resolveTarget("docs/a b.md", root)).route, "#/docs/a%20b.md");
});

test("unsupported targets fail with a readable message", async (t) => {
  const root = await makeTree(t);

  await assert.rejects(resolveTarget("missing.md", root), /no such file or folder/);
  await assert.rejects(resolveTarget("README.txt", root), /not a Markdown file/);
});
