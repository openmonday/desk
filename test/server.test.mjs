import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequestHandler } from "../src/server/http.mjs";
import { makeWorkspace } from "./helpers.mjs";

async function listen(t, workspace, publicDir, mode = "context") {
  const nav = { order: ["issues", "glossary", "map"], hidden: ["map"], default: "issues" };
  const handler = createRequestHandler({
    mode,
    workspace,
    docsRoot: null,
    publicDir,
    clients: new Set(),
    getNav: async () => nav,
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("the viewer serves reads and refuses writes", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  const publicDir = await mkdtemp(path.join(os.tmpdir(), "desk-public-"));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  const base = await listen(t, w.ws, publicDir);

  const tree = await fetch(`${base}/api/tree`);
  assert.equal(tree.status, 200);
  const treeBody = await tree.json();
  assert.equal(treeBody.mode, "context");
  assert.deepEqual(treeBody.nav, {
    order: ["issues", "glossary", "map"], hidden: ["map"], default: "issues",
  });

  const doc = await fetch(`${base}/api/doc?path=issues/demo/spec.md`);
  assert.equal(doc.status, 200);
  assert.match((await doc.json()).md, /Problem Statement/);

  for (const method of ["POST", "PATCH", "DELETE"]) {
    const res = await fetch(`${base}/api/tasks`, { method });
    assert.equal(res.status, 405, `${method} must be read-only`);
  }
});

test("workspace assets load, but reference checkouts stay private", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  await writeFile(path.join(w.issue, "diagram.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  await writeFile(path.join(w.reference, "other", "figure.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  const publicDir = await mkdtemp(path.join(os.tmpdir(), "desk-public-"));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  const base = await listen(t, w.ws, publicDir);

  const asset = await fetch(`${base}/api/asset?path=issues/demo/diagram.png`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "image/png");

  const blocked = await fetch(`${base}/api/asset?path=reference/other/figure.png`);
  assert.equal(blocked.status, 404);

  const doc = await fetch(`${base}/api/doc?path=reference/other/README.md`);
  assert.equal(doc.status, 404);
});

test("the viewer serves vendored KaTeX fonts", async (t) => {
  const w = await makeWorkspace();
  t.after(w.cleanup);
  const publicDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "desk-public-")));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  await mkdir(path.join(publicDir, "katex", "fonts"), { recursive: true });
  const body = Buffer.from("wOF2\0\0\0\0", "binary");
  await writeFile(path.join(publicDir, "katex", "fonts", "KaTeX_Main-Regular.woff2"), body);

  const base = await listen(t, w.ws, publicDir);
  const res = await fetch(`${base}/katex/fonts/KaTeX_Main-Regular.woff2`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "font/woff2");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), body);
});
