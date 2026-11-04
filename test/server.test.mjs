import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequestHandler } from "../src/server/http.mjs";
import { makeWorkspace } from "./helpers.mjs";

async function listen(t, workspace, publicDir) {
  const nav = { order: ["features", "context", "architecture"], hidden: ["architecture"], default: "features" };
  const handler = createRequestHandler({
    mode: "desk",
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
  assert.equal(treeBody.mode, "desk");
  assert.deepEqual(treeBody.nav, {
    order: ["features", "context", "architecture"], hidden: ["architecture"], default: "features",
  });

  const doc = await fetch(`${base}/api/doc?path=features/demo/spec.md`);
  assert.equal(doc.status, 200);
  assert.match((await doc.json()).md, /Problem Statement/);

  for (const method of ["POST", "PATCH", "DELETE"]) {
    const res = await fetch(`${base}/api/tickets`, { method });
    assert.equal(res.status, 405, `${method} must be read-only`);
  }
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
