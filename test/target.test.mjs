import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveTarget } from "../src/cli/target.mjs";

async function makeTree(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "desk-target-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, ".desk", "arch"), { recursive: true });
  await mkdir(path.join(root, ".desk", "features", "demo", "tickets"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });

  const write = (rel, text = "# Doc\n") => writeFile(path.join(root, rel), text);
  await write(".desk/CONTEXT.md");
  await write(".desk/AGENTS.md");
  await write(".desk/AGENTS.txt");
  await write(".desk/arch/one.md");
  await write(".desk/features/demo/spec.md");
  await write(".desk/features/demo/tickets/02-cache.md");
  await write("docs/api.md");
  await write("docs/a b.md");
  await write("README.md");
  await write("README.txt");
  return root;
}

test("workspace roots and folders under .desk open in workspace mode", async (t) => {
  const root = await makeTree(t);

  assert.deepEqual(
    await resolveTarget(".", root),
    { mode: "desk", root, dataDir: path.join(root, ".desk"), route: null, file: false },
  );
  assert.equal((await resolveTarget(".desk", root)).root, root);
  assert.equal((await resolveTarget(".desk/features/demo", root)).mode, "desk");
  assert.equal((await resolveTarget(".desk/features", root)).route, "#/features");
  assert.equal((await resolveTarget(".desk/features/demo", root)).route, "#/features/demo");
  assert.equal((await resolveTarget(".desk/features/demo/tickets", root)).route, "#/features/demo");
  assert.equal((await resolveTarget(".desk/arch", root)).route, "#/architecture");
});

test("workspace files open at the route the page uses", async (t) => {
  const root = await makeTree(t);

  assert.equal((await resolveTarget(".desk/CONTEXT.md", root)).route, "#/context");
  assert.equal((await resolveTarget(".desk/arch/one.md", root)).route, "#/architecture/one");
  assert.equal((await resolveTarget(".desk/features/demo/spec.md", root)).route, "#/features/demo");

  const ticket = await resolveTarget(".desk/features/demo/tickets/02-cache.md", root);
  assert.equal(ticket.route, "#/features/demo/2");
  assert.equal(ticket.file, true);
});

test("a file outside .desk opens as a library from its own folder", async (t) => {
  const root = await makeTree(t);

  assert.deepEqual(
    await resolveTarget("docs/api.md", root),
    { mode: "docs", root: path.join(root, "docs"), dataDir: null, route: "#/docs/api.md", file: true },
  );
  assert.equal((await resolveTarget("README.md", root)).root, root);
  assert.equal((await resolveTarget("docs", root)).mode, "docs");
});

test("other Markdown under .desk opens as a library from its own folder", async (t) => {
  const root = await makeTree(t);

  assert.deepEqual(
    await resolveTarget(".desk/AGENTS.md", root),
    { mode: "docs", root: path.join(root, ".desk"), dataDir: null, route: "#/docs/AGENTS.md", file: true },
  );
});

test("library routes encode path segments", async (t) => {
  const root = await makeTree(t);
  assert.equal((await resolveTarget("docs/a b.md", root)).route, "#/docs/a%20b.md");
});

test("unsupported targets fail with a readable message", async (t) => {
  const root = await makeTree(t);

  await assert.rejects(resolveTarget("missing.md", root), /no such file or folder/);
  await assert.rejects(resolveTarget("README.txt", root), /not a Markdown file/);
  await assert.rejects(resolveTarget(".desk/AGENTS.txt", root), /not a Markdown file/);
});
