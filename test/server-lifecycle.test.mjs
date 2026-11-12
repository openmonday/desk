import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { listServers } from "../src/lib/servers.mjs";
import { makeWorkspace } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVE = path.join(HERE, "..", "src", "serve.mjs");
const DESK = path.join(HERE, "..", "src", "desk.mjs");

async function waitFor(read, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for value");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function run(args, env) {
  const child = spawn(process.execPath, [DESK, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const [code] = await once(child, "close");
  return { code, stdout };
}

test("desk list and desk kill see a running server", async (t) => {
  const workspace = await makeWorkspace();
  const state = await mkdtemp(path.join(os.tmpdir(), "desk-state-"));
  t.after(() => rm(state, { recursive: true, force: true }));
  t.after(workspace.cleanup);

  const env = { ...process.env, DESK_STATE_DIR: state };
  const server = spawn(process.execPath, [SERVE, "--root", workspace.ws, "--port", "0", "--quiet"], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  t.after(() => server.kill("SIGKILL"));

  const [record] = await waitFor(async () => {
    const servers = await listServers(env);
    return servers.length ? servers : null;
  });
  assert.equal(record.mode, "context");
  assert.equal(record.root, workspace.ws);

  const listed = await run(["list", "--json"], env);
  assert.equal(listed.code, 0);
  assert.deepEqual(JSON.parse(listed.stdout), [record]);

  const exited = once(server, "exit");
  const killed = await run(["kill", String(record.pid)], env);
  assert.equal(killed.code, 0);
  assert.match(killed.stdout, new RegExp(`stopped ${record.pid}`));
  await exited;
  assert.deepEqual(await listServers(env), []);
});
