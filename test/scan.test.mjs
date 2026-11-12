import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findWorkspace, parseRecord, parseTask, readDoc, resolveDoc, scanWorkspace,
} from "../src/lib/scan.mjs";
import { makeWorkspace, writeTask } from "./helpers.mjs";

test("findWorkspace walks up to the .context directory", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  const nested = path.join(w.root, "src", "deep", "inside");
  await mkdir(nested, { recursive: true });
  assert.equal(await findWorkspace(nested), w.ws);
});

test("findWorkspace ignores a .context directory with nothing it knows", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "leaf-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".context", "logs"), { recursive: true });
  assert.equal(await findWorkspace(root), null);
});

test("scanWorkspace builds the page model", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTask(w.tasks, 1, "Root", "done");
  await writeTask(w.tasks, 2, "Branch", "pending", "01");

  const tree = await scanWorkspace(w.ws);
  assert.equal(tree.ok, true);
  assert.equal(tree.mode, "context");
  assert.equal(tree.root, w.ws);
  assert.deepEqual(tree.glossary, {
    exists: true,
    path: "GLOSSARY.md",
    title: "Glossary",
    headings: ["Workspace", "Task"],
  });
  assert.deepEqual(tree.map.records.map((r) => r.slug), ["one"]);
  assert.deepEqual(tree.map.records[0].files, ["src/one.mjs"]);
  assert.equal(tree.map.records[0].type, "feat");
  assert.equal(tree.map.records[0].title, "One");
  assert.equal(tree.issues.length, 1);

  assert.equal(tree.files.name, path.basename(w.ws));
  assert.equal(tree.files.path, "");
  assert.deepEqual(tree.files.children.map((n) => [n.type, n.path]), [
    ["file", "GLOSSARY.md"],
    ["dir", "issues"],
    ["dir", "map"],
  ], "reference/ must stay out of the Overview tree");

  const issue = tree.issues[0];
  assert.equal(issue.slug, "demo");
  assert.equal(issue.title, "Demo");
  assert.equal(issue.specPath, "issues/demo/spec.md");
  assert.equal(issue.researchPath, null);
  assert.deepEqual(issue.progress, { done: 1, total: 2, dropped: 0 });
  assert.deepEqual(issue.tasks.map((x) => [x.n, x.status, x.blockedBy]), [
    [1, "done", []],
    [2, "pending", ["01"]],
  ]);
  assert.deepEqual(tree.diagnostics, []);
});

test("scanWorkspace reports dangling blockers and cycles", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTask(w.tasks, 1, "Missing blocker", "pending", "99");
  await writeTask(w.tasks, 2, "Cycle A", "pending", "03");
  await writeTask(w.tasks, 3, "Cycle B", "pending", "02");

  const tree = await scanWorkspace(w.ws);
  const messages = tree.diagnostics.map((d) => d.message);
  assert.ok(messages.some((m) => m.includes("blocked by task 99")));
  assert.ok(messages.some((m) => m.startsWith("dependency cycle:")));
  assert.ok(tree.diagnostics.every((d) => d.severity === "error"));
});

test("a task number comes from the heading, so a bad heading is an error", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeFile(path.join(w.tasks, "no-number.md"), "# A task without a number\n\nStatus: pending\n");
  await writeTask(w.tasks, 1, "Duplicate", "pending");
  await writeFile(path.join(w.tasks, "also-one.md"), "# 01: Also one\n\nStatus: pending\n");

  const tree = await scanWorkspace(w.ws);
  const messages = tree.diagnostics.map((d) => `${d.severity}:${d.message}`);
  assert.ok(messages.some((m) => m.startsWith("error:task heading is not")));
  assert.ok(messages.some((m) => m.includes("task number 1 is already used")));
});

test("dropped tasks leave the progress count but stay in the task list", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTask(w.tasks, 1, "Kept", "done");
  await writeTask(w.tasks, 2, "Dropped", "dropped");

  const tree = await scanWorkspace(w.ws);
  assert.deepEqual(tree.issues[0].progress, { done: 1, total: 1, dropped: 1 });
  assert.deepEqual(tree.issues[0].tasks.map((x) => x.status), ["done", "dropped"]);
});

test("parseTask normalizes status, owner, and blockers", () => {
  const parsed = parseTask(`# 04: Cache the tree

Status: in-progress (feature/cache)
Blocked by: #01, 02

## Acceptance criteria

- [x] One
- [ ] Two
`);
  assert.equal(parsed.n, 4);
  assert.equal(parsed.title, "Cache the tree");
  assert.equal(parsed.titleOk, true);
  assert.equal(parsed.status, "in-progress");
  assert.equal(parsed.owner, "feature/cache");
  assert.equal(parsed.statusRaw, "in-progress (feature/cache)");
  assert.deepEqual(parsed.blockedBy, ["01", "02"]);
  assert.equal(parsed.checks, 2);
  assert.equal(parsed.checked, 1);
  assert.equal(parsed.hasAcceptance, true);

  const unblocked = parseTask("# 05: Free\n\nStatus: pending\nBlocked by: None\n");
  assert.deepEqual(unblocked.blockedBy, []);

  const dropped = parseTask("# 06: Gone\n\nStatus: dropped\n");
  assert.equal(dropped.status, "dropped");

  const unknown = parseTask("# 07: Odd\n\nStatus: someday\n");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.statusRaw, "someday");
});

test("parseRecord reads the limited front matter and the rules", () => {
  const record = parseRecord(`---
type: refactor
files:
  - src/payments/
  - config/payment.json
since: abc123f
---
# Payment processing

## Constraints
- Never log card numbers: protects sensitive data.

## Architecture
The service delegates processing to providers.

## Violations
- 9f2c1ab src/payments/retry.py: reuses the charge id; breaks "Retries are idempotent".
`);
  assert.deepEqual(record.problems, []);
  assert.equal(record.type, "refactor");
  assert.equal(record.since, "abc123f");
  assert.deepEqual(record.files, ["src/payments/", "config/payment.json"]);
  assert.equal(record.title, "Payment processing");
  assert.deepEqual(record.constraints, ["Never log card numbers: protects sensitive data."]);
  assert.equal(record.hasArchitecture, true);
  assert.equal(record.violations.length, 1);
});

test("a record without front matter warns and still renders", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeFile(path.join(w.ws, "map", "loose.md"), "# Loose\n\n## Constraints\n\n- One.\n");

  const tree = await scanWorkspace(w.ws);
  const diag = tree.diagnostics.find((d) => d.path === "map/loose.md");
  assert.ok(diag);
  assert.equal(diag.severity, "warn");
  assert.match(diag.message, /front matter/);
  assert.equal(tree.map.records.length, 2);
});

test("readDoc stays inside the workspace and out of reference", async (t) => {
  const w = await makeWorkspace();
  const outside = await mkdtemp(path.join(os.tmpdir(), "leaf-outside-"));
  t.after(async () => {
    await w.cleanup();
    await rm(outside, { recursive: true, force: true });
  });
  await writeFile(path.join(outside, "secret.md"), "# Secret\n");

  const doc = await readDoc(w.ws, "GLOSSARY.md");
  assert.ok(doc.md.startsWith("# Glossary"));
  assert.equal(await resolveDoc(w.ws, path.join(outside, "secret.md")), null);
  assert.equal(await resolveDoc(w.ws, "../secret.md"), null);
  assert.equal(await resolveDoc(w.ws, "/etc/passwd"), null);
  assert.equal(await resolveDoc(w.ws, "issues/demo/spec.md") !== null, true);
  assert.equal(await resolveDoc(w.ws, "issues/demo/spec.txt"), null);
  assert.equal(await resolveDoc(w.ws, "reference/other/README.md"), null);
  assert.equal(await readDoc(w.ws, "nope.md"), null);
});
