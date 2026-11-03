#!/usr/bin/env node
/* desk page server — a live local view of a `.desk` workspace.
 *
 * Reads are plain JSON. Writes are deliberately small and explicit, so an agent
 * can drive tickets with curl or with `desk.mjs` without knowing the markdown
 * layout. Every change broadcasts over SSE, which is what makes the page move
 * while an agent works. */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspace, scanWorkspace } from "./lib/scan.mjs";
import { parseArgs } from "./server/args.mjs";
import { createBroadcaster } from "./server/events.mjs";
import { createRequestHandler } from "./server/http.mjs";
import { report } from "./server/report.mjs";
import { watchWorkspace } from "./server/watcher.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const workspace = opts.root
    ? (opts.root.endsWith(".desk") ? path.resolve(opts.root) : path.join(path.resolve(opts.root), ".desk"))
    : await findWorkspace(process.cwd());

  if (!workspace) {
    console.error("desk page: no .desk directory found. Run /setup-desk first, or pass --root.");
    process.exit(1);
  }

  if (opts.check) {
    const tree = await scanWorkspace(workspace);
    const r = report(tree);
    console.log(`desk page  ${workspace}`);
    console.log(`  ${r.features} features · ${r.tickets} tickets (${r.done} done) · ${r.arch} arch records`);
    if (r.diagnostics) {
      console.log(`  ${r.diagnostics} diagnostics:`);
      for (const d of tree.diagnostics) console.log(`    ${d.severity}  ${d.path}: ${d.message}`);
    } else {
      console.log("  no diagnostics");
    }
    process.exit(r.errors ? 1 : 0);
  }

  const clients = new Set();
  const broadcast = createBroadcaster(clients);
  const watcher = watchWorkspace(workspace, broadcast);
  const handler = createRequestHandler({ workspace, publicDir: PUBLIC, clients, broadcast });

  const server = http.createServer(handler);
  const listen = (port, attempts = 8) =>
    new Promise((resolve, reject) => {
      const onError = (err) => {
        server.removeListener("listening", onListen);
        if (err.code === "EADDRINUSE" && attempts > 0) resolve(listen(port + 1, attempts - 1));
        else reject(err);
      };
      const onListen = () => {
        server.removeListener("error", onError);
        resolve(server.address().port);
      };
      server.once("error", onError);
      server.once("listening", onListen);
      server.listen(port, opts.host);
    });

  let port;
  try {
    port = await listen(opts.port);
  } catch (err) {
    console.error(`desk page: cannot listen — ${err.message}`);
    process.exit(1);
  }

  const urlBase = `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${port}`;

  if (!opts.quiet) {
    const tree = await scanWorkspace(workspace);
    const r = report(tree);
    console.log(`desk page  ${urlBase}  (live)`);
    console.log(`  ${workspace}`);
    console.log(`  ${r.features} features · ${r.tickets} tickets (${r.done} done) · ${r.arch} arch records`);
    if (r.diagnostics) console.log(`  ${r.diagnostics} diagnostics — node serve.mjs --check`);
  }

  if (opts.open) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    import("node:child_process").then(({ exec }) => exec(`${cmd} ${urlBase}`));
  }

  const shutdown = () => {
    watcher?.close();
    for (const res of clients) { try { res.end(); } catch { /* closed */ } }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`desk page: ${err?.stack || err}`);
  process.exit(1);
});
