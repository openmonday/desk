import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findWorkspace, parseTicket, readDoc, resolveDoc, scanWorkspace,
} from "../src/lib/scan.mjs";
import { makeWorkspace, writeTicket } from "./helpers.mjs";

test("findWorkspace walks up to the .desk directory", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  const nested = path.join(w.root, "src", "deep", "inside");
  await mkdir(nested, { recursive: true });
  assert.equal(await findWorkspace(nested), w.ws);
});

test("findWorkspace returns null without a .desk directory", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "desk-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await findWorkspace(root), null);
});

test("scanWorkspace builds the page model", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "done");
  await writeTicket(w.tickets, 2, "Branch", "pending", "01");

  const tree = await scanWorkspace(w.ws);
  assert.equal(tree.ok, true);
  assert.equal(tree.root, w.ws);
  assert.deepEqual(tree.context, {
    exists: true,
    path: "CONTEXT.md",
    title: "Context",
    headings: ["Workspace", "Ticket"],
  });
  assert.deepEqual(tree.architecture.map((a) => a.slug), ["one"]);
  assert.equal(tree.architecture[0].title, "One");
  assert.equal(tree.features.length, 1);

  assert.equal(tree.files.name, path.basename(w.ws));
  assert.equal(tree.files.path, "");
  assert.deepEqual(tree.files.children.map((n) => [n.type, n.path]), [
    ["file", "CONTEXT.md"],
    ["dir", "arch"],
    ["dir", "features"],
  ]);
  const arch = tree.files.children.find((n) => n.path === "arch");
  assert.equal(arch.title, "arch");
  assert.deepEqual(arch.children.map((n) => n.path), ["arch/one.md"]);
  const filesFeature = tree.files.children.find((n) => n.path === "features").children[0];
  assert.equal(filesFeature.path, "features/demo");
  assert.deepEqual(filesFeature.children.map((n) => n.path), [
    "features/demo/spec.md", "features/demo/tickets",
  ]);

  const feature = tree.features[0];
  assert.equal(feature.slug, "demo");
  assert.equal(feature.title, "Demo");
  assert.equal(feature.specPath, "features/demo/spec.md");
  assert.deepEqual(feature.progress, { done: 1, total: 2 });
  assert.deepEqual(feature.tickets.map((x) => [x.n, x.status, x.blockedBy]), [
    [1, "done", []],
    [2, "pending", ["01"]],
  ]);
  assert.deepEqual(tree.diagnostics, []);
});

test("scanWorkspace reports dangling blockers and cycles", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Missing blocker", "pending", "99");
  await writeTicket(w.tickets, 2, "Cycle A", "pending", "03");
  await writeTicket(w.tickets, 3, "Cycle B", "pending", "02");

  const tree = await scanWorkspace(w.ws);
  const messages = tree.diagnostics.map((d) => d.message);
  assert.ok(messages.some((m) => m.includes("blocked by ticket 99")));
  assert.ok(messages.some((m) => m.startsWith("dependency cycle:")));
  assert.ok(tree.diagnostics.every((d) => d.severity === "error"));
});

test("parseTicket normalizes common status aliases and blockers", () => {
  const parsed = parseTicket(`# 04: Cache the tree

Status: in progress
Blocked by: #01, 02

## Acceptance criteria

- [x] One
- [ ] Two
`);
  assert.equal(parsed.n, 4);
  assert.equal(parsed.title, "Cache the tree");
  assert.equal(parsed.titleOk, true);
  assert.equal(parsed.status, "in-progress");
  assert.equal(parsed.statusRaw, "in progress");
  assert.deepEqual(parsed.blockedBy, ["01", "02"]);
  assert.equal(parsed.checks, 2);
  assert.equal(parsed.hasAcceptance, true);

  const unblocked = parseTicket("# 05: Free\n\nStatus: pending\nBlocked by: None\n");
  assert.deepEqual(unblocked.blockedBy, []);

  const unknown = parseTicket("# 06: Odd\n\nStatus: someday\n");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.statusRaw, "someday");
});

test("readDoc stays inside the workspace", async (t) => {
  const w = await makeWorkspace();
  const outside = await mkdtemp(path.join(os.tmpdir(), "desk-outside-"));
  t.after(async () => {
    await w.cleanup();
    await rm(outside, { recursive: true, force: true });
  });
  await writeFile(path.join(outside, "secret.md"), "# Secret\n");

  const doc = await readDoc(w.ws, "CONTEXT.md");
  assert.ok(doc.md.startsWith("# Context"));
  assert.equal(await resolveDoc(w.ws, path.join(outside, "secret.md")), null);
  assert.equal(await resolveDoc(w.ws, "../secret.md"), null);
  assert.equal(await resolveDoc(w.ws, "/etc/passwd"), null);
  assert.equal(await resolveDoc(w.ws, "features/demo/spec.md") !== null, true);
  assert.equal(await resolveDoc(w.ws, "features/demo/spec.txt"), null);
  assert.equal(await readDoc(w.ws, "nope.md"), null);
});
