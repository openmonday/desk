#!/usr/bin/env node
/* desk page server — a live local view of a `.desk` workspace.
 *
 * Reads are plain JSON. Writes are deliberately small and explicit, so an agent
 * can drive tickets with curl or with `desk.mjs` without knowing the markdown
 * layout. Every change broadcasts over SSE, which is what makes the page move
 * while an agent works. */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findWorkspace, scanWorkspace, readDoc } from "./lib/scan.mjs";
import { createTicket, updateTicket, completeTicket, removeTicket } from "./lib/ticket.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");

const STATIC = {
  "/": ["shell.html", "text/html; charset=utf-8"],
  "/shell.html": ["shell.html", "text/html; charset=utf-8"],
  "/theme.css": ["theme.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/marked.min.js": ["marked.min.js", "text/javascript; charset=utf-8"],
};

const MAX_BODY = 512 * 1024;

function usage() {
  console.log(`desk page — live view of .desk

  node serve.mjs [options]

  --root <dir>    project directory containing .desk (default: walk up from cwd)
  --port <n>      port to listen on (default: 7777, falls back to the next free one)
  --host <addr>   bind address (default: 127.0.0.1)
  --open          open the page in the default browser
  --check         scan once, print a report, exit 1 on errors
  --quiet         suppress the startup report
  --help`);
}

function parseArgs(argv) {
  const opts = { root: null, port: 7777, host: "127.0.0.1", open: false, check: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--host") opts.host = argv[++i];
    else if (a === "--open") opts.open = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else { console.error(`unknown option: ${a}`); usage(); process.exit(2); }
  }
  return opts;
}

function report(tree) {
  const features = tree.features.length;
  const tickets = tree.features.reduce((n, f) => n + f.tickets.length, 0);
  const done = tree.features.reduce((n, f) => n + f.progress.done, 0);
  const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
  return { features, tickets, done, arch: tree.architecture.length, errors, diagnostics: tree.diagnostics.length };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("request body is too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error("body must be valid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // local agent via curl or the CLI
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

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
  let broadcastTimer = null;

  const broadcast = () => {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      const payload = `data: ${JSON.stringify({ type: "change", at: Date.now() })}\n\n`;
      for (const res of clients) {
        try { res.write(payload); } catch { clients.delete(res); }
      }
    }, 60);
  };

  let watcher = null;
  try {
    watcher = fs.watch(workspace, { recursive: true }, (_event, file) => {
      if (!file) return broadcast();
      const name = String(file);
      if (name.startsWith(".git") || name.includes("node_modules") || name.endsWith("~") || name.endsWith(".swp")) return;
      broadcast();
    });
  } catch (err) {
    console.error(`desk page: live reload unavailable (${err.message}); the page still reads on demand.`);
  }

  const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname;

    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );

    /* ---------- writes: tickets ---------- */

    if (route === "/api/tickets" && (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE")) {
      if (!sameOrigin(req)) return json(res, 403, { ok: false, error: "cross-origin writes are rejected" });

      try {
        let payload;
        if (req.method === "DELETE") {
          payload = {
            feature: url.searchParams.get("feature"),
            n: url.searchParams.get("n"),
            force: url.searchParams.get("force") === "1",
          };
        } else {
          const type = String(req.headers["content-type"] || "");
          if (!type.startsWith("application/json")) {
            return json(res, 415, { ok: false, error: "content-type must be application/json" });
          }
          payload = await readJson(req);
        }

        let out;
        if (req.method === "POST") out = await createTicket(workspace, payload);
        else if (req.method === "DELETE") out = await removeTicket(workspace, payload);
        else if (payload.action === "complete") out = await completeTicket(workspace, payload);
        else out = await updateTicket(workspace, payload);

        broadcast();
        return json(res, 200, out);
      } catch (err) {
        return json(res, err.status || 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return json(res, 405, { ok: false, error: "read-only route" });
    }

    if (route === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);
      clients.add(res);
      const beat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, 20000);
      req.on("close", () => { clearInterval(beat); clients.delete(res); });
      return;
    }

    if (route === "/api/tree") {
      try {
        return json(res, 200, await scanWorkspace(workspace));
      } catch (err) {
        return json(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (route === "/api/doc" || route === "/api/raw") {
      const rel = url.searchParams.get("path") || "";
      let doc = null;
      try {
        doc = await readDoc(workspace, rel);
      } catch { /* fall through */ }
      if (!doc) return json(res, 404, { ok: false, error: "not found" });
      if (route === "/api/raw") {
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" });
        return res.end(doc.md);
      }
      return json(res, 200, { path: rel, md: doc.md, mtime: doc.mtime });
    }

    const hit = STATIC[route];
    if (hit) {
      const [file, type] = hit;
      try {
        const body = await fsp.readFile(path.join(PUBLIC, file));
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        return res.end(req.method === "HEAD" ? undefined : body);
      } catch {
        return json(res, 500, { ok: false, error: "missing app asset" });
      }
    }

    return json(res, 404, { ok: false, error: "not found" });
  });

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
