/* Running desk servers, recorded once per user.
 *
 * Each server writes a small JSON record after it starts listening and removes
 * it on the way out. `desk list` and `desk kill` read the same records, pruning
 * entries whose process is gone. The records are advisory state: the HTTP
 * server never depends on them.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function stateDir(env = process.env) {
  if (env.DESK_STATE_DIR) return path.resolve(env.DESK_STATE_DIR);
  const base = env.XDG_STATE_HOME
    ? path.resolve(env.XDG_STATE_HOME)
    : path.join(os.homedir(), ".local", "state");
  return path.join(base, "desk");
}

export function serverDir(env = process.env) {
  return path.join(stateDir(env), "servers");
}

export function serverFile(pid, env = process.env) {
  return path.join(serverDir(env), `${pid}.json`);
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function validRecord(record) {
  return Boolean(
    record
    && Number.isInteger(record.pid)
    && record.pid > 0
    && Number.isInteger(record.port)
    && record.port > 0
    && typeof record.host === "string"
    && (record.mode === "desk" || record.mode === "docs")
    && typeof record.root === "string"
    && typeof record.url === "string"
    && typeof record.startedAt === "string",
  );
}

/** Record a listening server. The write is atomic so list never sees half a file. */
export async function registerServer(record, env = process.env) {
  const dir = serverDir(env);
  await fsp.mkdir(dir, { recursive: true });
  const file = serverFile(record.pid, env);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(record, null, 2)}\n`);
  await fsp.rename(temp, file);
  return file;
}

export async function unregisterServer(pid, env = process.env) {
  await fsp.rm(serverFile(pid, env), { force: true });
}

export function unregisterServerSync(pid, env = process.env) {
  try {
    fs.rmSync(serverFile(pid, env), { force: true });
  } catch {
    /* The exit path must not throw. */
  }
}

/** Live servers, oldest first. Stale or malformed records are removed. */
export async function listServers(env = process.env) {
  const dir = serverDir(env);
  let names;
  try {
    names = await fsp.readdir(dir);
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }

  const records = await Promise.all(names.map(async (name) => {
    if (!/^\d+\.json$/.test(name)) return null;
    const file = path.join(dir, name);
    let record;
    try {
      record = JSON.parse(await fsp.readFile(file, "utf8"));
    } catch {
      await fsp.rm(file, { force: true });
      return null;
    }
    if (!validRecord(record) || String(record.pid) !== name.slice(0, -5) || !isProcessAlive(record.pid)) {
      await fsp.rm(file, { force: true });
      return null;
    }
    return record;
  }));

  return records
    .filter(Boolean)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.pid - b.pid);
}

/** Signal one server and forget its record. */
export async function stopServer(record, { force = false, env = process.env } = {}) {
  try {
    process.kill(record.pid, force ? "SIGKILL" : "SIGTERM");
  } catch (err) {
    if (err?.code !== "ESRCH") throw err;
  }
  await unregisterServer(record.pid, env);
  return record;
}
