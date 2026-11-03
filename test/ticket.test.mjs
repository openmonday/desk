import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { scanWorkspace } from "../src/lib/scan.mjs";
import {
  canonicalStatus, completeTicket, createTicket, listTickets, normalizeBlockedBy, removeTicket,
  slugify, updateTicket,
} from "../src/lib/ticket.mjs";
import { makeWorkspace, writeTicket } from "./helpers.mjs";

test("createTicket writes the header, blockers, and body", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "done");
  await writeTicket(w.tickets, 2, "Branch", "pending", "01");

  const created = await createTicket(w.ws, {
    feature: "demo",
    title: "Cache the tree",
    blockedBy: "01, 02",
    body: "## What to build\n\nCache it.\n\n## Acceptance criteria\n\n- [ ] Fresh\n",
  });
  assert.deepEqual(created, {
    ok: true,
    action: "created",
    feature: "demo",
    n: 3,
    path: "features/demo/tickets/03-cache-the-tree.md",
    title: "Cache the tree",
    status: "pending",
    blockedBy: ["01", "02"],
  });

  const md = await readFile(path.join(w.tickets, "03-cache-the-tree.md"), "utf8");
  assert.match(md, /^# 03: Cache the tree\n\nStatus: pending\nBlocked by: 01, 02\n\n## What to build/);
  assert.match(md, /- \[ \] Fresh/);
});

test("createTicket uses the default body and next number", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "One", "done");
  await writeTicket(w.tickets, 7, "Seven", "done");

  const created = await createTicket(w.ws, { feature: "demo", title: "Next" });
  assert.equal(created.n, 8);
  const md = await readFile(path.join(w.tickets, created.path.split("/").pop()), "utf8");
  assert.match(md, /## What to build/);
  assert.match(md, /## Acceptance criteria/);
  assert.match(md, /- \[ \] _Describe the observable result\._/);
});

test("updateTicket changes fields without touching unrelated text", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "done");
  await writeTicket(w.tickets, 2, "Old title", "pending", "01");

  const updated = await updateTicket(w.ws, {
    feature: "demo",
    n: 2,
    title: "New title",
    status: "wip",
    blockedBy: ["01", "01"],
    body: "## What to build\n\nNew body.\n\n## Acceptance criteria\n\n- [ ] New check\n",
  });
  assert.equal(updated.title, "New title");
  assert.equal(updated.status, "in-progress");
  assert.deepEqual(updated.blockedBy, ["01"]);

  const md = await readFile(path.join(w.tickets, "02-old-title.md"), "utf8");
  assert.match(md, /^# 02: New title/);
  assert.match(md, /^Status: in-progress$/m);
  assert.match(md, /^Blocked by: 01$/m);
  assert.match(md, /## What to build\n\nNew body\./);
  assert.doesNotMatch(md, /Old title/);
});

test("updateTicket rejects empty changes and bad input", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "pending");

  await assert.rejects(
    updateTicket(w.ws, { feature: "demo", n: 1 }),
    (err) => err.status === 400 && /nothing to update/.test(err.message),
  );
  await assert.rejects(
    updateTicket(w.ws, { feature: "demo", n: 1, status: "someday" }),
    (err) => err.status === 400 && /unknown status/.test(err.message),
  );
  await assert.rejects(
    updateTicket(w.ws, { feature: "demo", n: 99, status: "done" }),
    (err) => err.status === 404,
  );
  await assert.rejects(
    updateTicket(w.ws, { feature: "../escape", n: 1, status: "done" }),
    (err) => err.status === 400,
  );
});

test("completeTicket sets done and ticks every acceptance box", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "in-progress");

  const completed = await completeTicket(w.ws, { feature: "demo", n: 1 });
  assert.equal(completed.action, "completed");
  assert.equal(completed.status, "done");

  const md = await readFile(path.join(w.tickets, "01-root.md"), "utf8");
  assert.match(md, /^Status: done$/m);
  assert.match(md, /- \[x\] It works\./);
  assert.doesNotMatch(md, /- \[ \]/);
});

test("removeTicket protects dependents unless forced", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "done");
  await writeTicket(w.tickets, 2, "Branch", "pending", "01");

  await assert.rejects(
    removeTicket(w.ws, { feature: "demo", n: 1 }),
    (err) => err.status === 409 && /blocked-by for 02/.test(err.message),
  );

  const removed = await removeTicket(w.ws, { feature: "demo", n: 1, force: true });
  assert.deepEqual(removed, {
    ok: true,
    action: "removed",
    feature: "demo",
    n: 1,
    path: "features/demo/tickets/01-root.md",
    dependents: ["02"],
  });
  await assert.rejects(
    stat(path.join(w.tickets, "01-root.md")),
    (err) => err.code === "ENOENT",
  );
});

test("listTickets reports readiness and open blockers", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeTicket(w.tickets, 1, "Root", "pending");
  await writeTicket(w.tickets, 2, "Branch", "pending", "01");
  await writeTicket(w.tickets, 3, "Free", "pending");

  const tree = await scanWorkspace(w.ws);
  const rows = listTickets(tree, "demo");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.n, r.ready, r.open.map((b) => b.n)]), [
    [1, true, []],
    [2, false, [1]],
    [3, true, []],
  ]);
  assert.deepEqual(listTickets(tree, "missing"), []);
});

test("ticket vocabulary helpers normalize input", () => {
  assert.equal(canonicalStatus("WIP"), "in-progress");
  assert.equal(canonicalStatus("complete"), "done");
  assert.equal(canonicalStatus("waiting"), "blocked");
  assert.throws(() => canonicalStatus("someday"), (err) => err.status === 400);
  assert.deepEqual(normalizeBlockedBy("2, #01, 02, none"), ["01", "02"]);
  assert.throws(() => normalizeBlockedBy("soon"), (err) => err.status === 400);
  assert.equal(slugify("  Retry failed uploads!  "), "retry-failed-uploads");
  assert.equal(slugify(""), "ticket");
});

test("createTicket rejects a missing feature and empty title", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);

  await assert.rejects(
    createTicket(w.ws, { feature: "nope", title: "Nope" }),
    (err) => err.status === 404 && /feature "nope" not found/.test(err.message),
  );
  await assert.rejects(
    createTicket(w.ws, { feature: "demo", title: "   " }),
    (err) => err.status === 400 && /title is required/.test(err.message),
  );
});
