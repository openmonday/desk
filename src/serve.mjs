#!/usr/bin/env node
/* desk page server — a live, read-only view of a `.context` workspace or a
 * folder of Markdown. Reads are plain JSON; edits to the files broadcast over SSE,
 * which is what makes the page move while an agent or editor writes. */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTEXT_DIR, findWorkspace, isContextDir, scanWorkspace } from "./lib/scan.mjs";
import { scanDocs } from "./lib/docs/scan.mjs";
import { parseArgs } from "./server/args.mjs";
import { createBroadcaster } from "./server/events.mjs";
import { createRequestHandler } from "./server/http.mjs";
import { formatFileList, report, reportDocs } from "./server/report.mjs";
import { registerServer, unregisterServerSync } from "./lib/servers.mjs";
import { watchWorkspace } from "./server/watcher.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "..", "public");

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Accept either the project root or the `.context` directory itself. */
async function rootWorkspace(dir) {
  return await isContextDir(dir) ? dir : path.join(dir, CONTEXT_DIR);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const docsRoot = opts.docs ? path.resolve(opts.docs) : null;
  const workspace = docsRoot
    ? null
    : opts.root
      ? await rootWorkspace(path.resolve(opts.root))
      : await findWorkspace(process.cwd());

  if (!docsRoot && !workspace) {
    console.error("desk: no .context directory found. Run /setup-context first, or pass --root or --docs.");
    process.exit(1);
  }

  const mode = docsRoot ? "docs" : "context";
  const root = docsRoot || workspace;

  if (opts.check) {
    if (mode === "docs") {
      const tree = await scanDocs(root);
      const r = reportDocs(tree);
      console.log(`desk  ${root}`);
      console.log(`  ${count(r.sections, "section")} · ${count(r.docs, "document")}`);
      if (r.diagnostics) {
        console.log(`  ${r.diagnostics} diagnostics:`);
        for (const d of tree.diagnostics) console.log(`    ${d.severity}  ${d.path}: ${d.message}`);
      } else {
        console.log("  no diagnostics");
      }
      process.exit(r.errors ? 1 : 0);
    }
    const tree = await scanWorkspace(root);
    const r = report(tree);
    console.log(`desk  ${root}`);
    console.log(`  ${count(r.issues, "issue")} · ${count(r.tasks, "task")} (${r.done} done) · ${count(r.records, "map record")}`);
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
  const watcher = watchWorkspace(root, broadcast);
  const handler = createRequestHandler({ mode, workspace, docsRoot, publicDir: PUBLIC, clients });

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
  const url = `${urlBase}${opts.hash || ""}`;

  try {
    await registerServer({
      pid: process.pid,
      port,
      host: opts.host,
      mode,
      root,
      url,
      startedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (!opts.quiet) console.error(`desk page: cannot record running server — ${err.message}`);
  }

  if (!opts.quiet) {
    if (mode === "docs") {
      const tree = await scanDocs(root);
      const r = reportDocs(tree);
      console.log(`desk  ${url}  (live)`);
      console.log(`  ${root}`);
      console.log();
      console.log(formatFileList(tree, opts.hash));
      console.log();
      console.log(`  ${count(r.sections, "section")} · ${count(r.docs, "document")}`);
      if (r.diagnostics) console.log(`  ${r.diagnostics} diagnostics — node src/serve.mjs --check --docs ${root}`);
    } else {
      const tree = await scanWorkspace(root);
      const r = report(tree);
      console.log(`desk  ${url}  (live)`);
      console.log(`  ${root}`);
      console.log();
      console.log(formatFileList(tree, opts.hash));
      console.log();
      console.log(`  ${count(r.issues, "issue")} · ${count(r.tasks, "task")} (${r.done} done) · ${count(r.records, "map record")}`);
      if (r.diagnostics) console.log(`  ${r.diagnostics} diagnostics — node src/serve.mjs --check`);
    }
  }

  if (opts.open) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    import("node:child_process").then(({ exec }) => exec(`${cmd} ${url}`));
  }

  const forget = () => unregisterServerSync(process.pid);
  process.once("exit", forget);

  const shutdown = () => {
    forget();
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
