/* HTTP routes for reads, ticket writes, live events, and static assets. */
import { readDoc, scanWorkspace } from "../lib/scan.mjs";
import {
  completeTicket, createTicket, removeTicket, updateTicket,
} from "../lib/ticket.mjs";
import { attachEventStream } from "./events.mjs";
import { serveStatic } from "./static.mjs";

const MAX_BODY = 512 * 1024;

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

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export function createRequestHandler({ workspace, publicDir, clients, broadcast }) {
  return async (req, res) => {
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
      attachEventStream(req, res, clients);
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

    if (await serveStatic(publicDir, route, req, res)) return;
    return json(res, 404, { ok: false, error: "not found" });
  };
}
