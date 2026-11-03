#!/usr/bin/env node
/* Screenshot a running desk page with headless Chromium over CDP.
 *
 * Chrome's own `--screenshot` flag never settles on this page because the page
 * holds an SSE connection open, so we drive Chromium through the DevTools
 * protocol instead: navigate, wait, capture.
 *
 *   node tools/shot.mjs http://127.0.0.1:7777/ /tmp/spec.png [width] [height] [waitMs]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [, , url, out, width = "1440", height = "1000", waitMs = "2200"] = process.argv;
if (!url || !out) {
  console.error("usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]");
  process.exit(2);
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  try {
    for (const dir of fs.readdirSync(cache)) {
      if (!dir.startsWith("chromium_headless_shell-")) continue;
      const base = path.join(cache, dir);
      for (const sub of ["chrome-headless-shell-mac-arm64", "chrome-headless-shell-mac-x64"]) {
        const bin = path.join(base, sub, "chrome-headless-shell");
        if (fs.existsSync(bin)) return bin;
      }
    }
  } catch { /* no cache */ }
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(mac)) return mac;
  return "chromium";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "desk-shot-"));
const chrome = spawn(findChrome(), [
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-gpu",
  "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });

let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  try { chrome.kill(); } catch { /* gone */ }
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch { /* chromium may still be writing; /tmp cleans itself */ }
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

const portFile = path.join(profile, "DevToolsActivePort");
for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
if (!fs.existsSync(portFile)) {
  console.error("chromium did not start");
  process.exit(1);
}
const port = fs.readFileSync(portFile, "utf8").split("\n")[0].trim();

const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((resolve) => ws.addEventListener("open", resolve));
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url });
await sleep(Number(waitMs));
const shot = await send("Page.captureScreenshot", { format: "png" });
if (!shot.result?.data) {
  console.error("capture failed", JSON.stringify(shot.error || shot));
  process.exit(1);
}
fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log(`${out}  ${width}x${height}`);
ws.close();
await sleep(300);
cleanup();
process.exit(0);
