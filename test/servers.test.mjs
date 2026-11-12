import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listServers, registerServer, serverFile, stopServer, unregisterServer,
} from "../src/lib/servers.mjs";

function record(pid, overrides = {}) {
  return {
    pid,
    port: 7777,
    host: "127.0.0.1",
    mode: "context",
    root: "/tmp/workspace",
    url: "http://127.0.0.1:7777",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function state(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "desk-servers-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { DESK_STATE_DIR: dir };
}

test("server records round-trip and stale records are pruned", async (t) => {
  const env = await state(t);
  const live = record(process.pid);
  await registerServer(live, env);

  assert.deepEqual(await listServers(env), [live]);

  const stale = record(2147483647, { startedAt: "2026-01-02T00:00:00.000Z" });
  await writeFile(serverFile(stale.pid, env), `${JSON.stringify(stale)}\n`);
  assert.deepEqual(await listServers(env), [live]);
  await assert.rejects(readFile(serverFile(stale.pid, env)), /ENOENT/);

  const malformed = serverFile(2147483646, env);
  await writeFile(malformed, "{not json");
  assert.deepEqual(await listServers(env), [live]);
  await assert.rejects(readFile(malformed), /ENOENT/);

  await unregisterServer(process.pid, env);
  assert.deepEqual(await listServers(env), []);
});

test("stopServer signals a process and removes its record", async (t) => {
  const env = await state(t);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  await once(child, "spawn");

  const live = record(child.pid);
  await registerServer(live, env);
  const exited = once(child, "exit");
  await stopServer(live, { env });
  await exited;

  assert.deepEqual(await listServers(env), []);
  await assert.rejects(readFile(serverFile(child.pid, env)), /ENOENT/);
});
