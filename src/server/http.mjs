/* HTTP routes for reads, live events, and static assets. */
import { readDoc, scanWorkspace } from "../lib/scan.mjs";
import { scanDocs } from "../lib/docs/scan.mjs";
import { readDocsAsset, readDocsDoc } from "../lib/docs/read.mjs";
import { readNav } from "../lib/config.mjs";
import { attachEventStream } from "./events.mjs";
import { serveStatic } from "./static.mjs";

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export function createRequestHandler({ mode = "desk", workspace, docsRoot, publicDir, clients, getNav = readNav }) {
  const docs = mode === "docs";
  const scan = docs ? () => scanDocs(docsRoot) : () => scanWorkspace(workspace);
  const read = docs ? (rel) => readDocsDoc(docsRoot, rel) : (rel) => readDoc(workspace, rel);
  // Reference checkouts are repositories, not part of the workspace page.
  const assetRoot = docs ? docsRoot : workspace;
  const assetOptions = docs ? {} : { deny: ["reference"] };

  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const route = url.pathname;

    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );

    /* ---------- reads ---------- */

    if (req.method !== "GET" && req.method !== "HEAD") {
      return json(res, 405, { ok: false, error: "read-only route" });
    }

    if (route === "/api/events") {
      attachEventStream(req, res, clients);
      return;
    }

    if (route === "/api/tree") {
      try {
        const tree = await scan();
        return json(res, 200, docs ? tree : { ...tree, nav: await getNav() });
      } catch (err) {
        return json(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (route === "/api/doc" || route === "/api/raw") {
      const rel = url.searchParams.get("path") || "";
      let doc = null;
      try {
        doc = await read(rel);
      } catch { /* fall through */ }
      if (!doc) return json(res, 404, { ok: false, error: "not found" });
      if (route === "/api/raw") {
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" });
        return res.end(doc.md);
      }
      return json(res, 200, { path: doc.path || rel, md: doc.md, mtime: doc.mtime });
    }

    if (route === "/api/asset") {
      const rel = url.searchParams.get("path") || "";
      let asset = null;
      try {
        asset = await readDocsAsset(assetRoot, rel, assetOptions);
      } catch { /* fall through */ }
      if (!asset) return json(res, 404, { ok: false, error: "not found" });
      res.writeHead(200, {
        "content-type": asset.type,
        "content-length": String(asset.size),
        "cache-control": "no-store",
      });
      return res.end(req.method === "HEAD" ? undefined : asset.body);
    }

    if (await serveStatic(publicDir, route, req, res)) return;
    return json(res, 404, { ok: false, error: "not found" });
  };
}
