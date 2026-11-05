/* Build the page model from a `.desk` workspace. */
import path from "node:path";
import { firstH1, headings, titleCase } from "../markdown.mjs";
import { listDir, listSubdirs, readIfExists } from "../workspace.mjs";
import { detectCycles, parseTicket } from "./parse.mjs";
import { scanWorkspaceFiles } from "../workspace-files.mjs";

const SPEC_SECTIONS = ["Problem Statement", "Solution", "Implementation Decisions", "Testing Decisions", "Out of Scope"];
const numKey = (n) => String(Number(n));

export async function scanFeature(assist, slug, diagnostics) {
  const rel = `features/${slug}`;
  const dir = path.join(assist, rel);
  const specMd = await readIfExists(path.join(dir, "spec.md"));
  const specPath = specMd == null ? null : `${rel}/spec.md`;

  if (specMd != null) {
    for (const section of SPEC_SECTIONS) {
      if (!new RegExp(`^##\\s*${section}`, "im").test(specMd)) {
        diagnostics.push({ severity: "warn", path: specPath, message: `spec is missing "## ${section}"` });
      }
    }
  } else {
    diagnostics.push({
      severity: "warn",
      path: rel,
      message: "feature has no spec.md; run /to-spec to create one",
    });
  }

  const ticketFiles = (await listDir(path.join(dir, "tickets")))
    .filter((f) => /^\d+/.test(f));

  const tickets = [];
  for (const file of ticketFiles) {
    const p = `${rel}/tickets/${file}`;
    const md = await readIfExists(path.join(dir, "tickets", file));
    if (md == null) continue;
    const t = parseTicket(md);
    if (t.n == null) t.n = Number(file.match(/^(\d+)/)[1]);
    if (!t.titleOk) {
      diagnostics.push({ severity: "warn", path: p, message: 'ticket heading is not "# NN: Title"' });
    }
    if (t.statusRaw === "unspecified") {
      diagnostics.push({ severity: "error", path: p, message: "ticket has no Status line" });
    } else if (t.status === "unknown") {
      diagnostics.push({ severity: "warn", path: p, message: `unknown ticket status "${t.statusRaw}"` });
    }
    if (!t.hasAcceptance) {
      diagnostics.push({ severity: "warn", path: p, message: 'ticket has no "## Acceptance criteria" section' });
    }
    tickets.push({ ...t, path: p });
  }

  tickets.sort((a, b) => a.n - b.n);

  const known = new Set(tickets.map((t) => numKey(t.n)));
  for (const t of tickets) {
    for (const b of t.blockedBy) {
      if (!known.has(numKey(b))) {
        diagnostics.push({ severity: "error", path: t.path, message: `blocked by ticket ${b}, which does not exist` });
      }
    }
  }
  for (const cycle of detectCycles(tickets)) {
    diagnostics.push({ severity: "error", path: `${rel}/tickets`, message: `dependency cycle: ${cycle}` });
  }

  const done = tickets.filter((t) => t.status === "done").length;

  return {
    slug,
    path: rel,
    title: (specMd && firstH1(specMd)) || titleCase(slug),
    specPath,
    specHeadings: specMd ? headings(specMd).map((h) => h.text) : [],
    tickets,
    progress: { done, total: tickets.length },
  };
}

/** Scan only the `features/` folder, for mixed docs workspaces. */
export async function scanFeatures(assist, diagnostics = []) {
  const features = [];
  for (const slug of await listSubdirs(path.join(assist, "features"))) {
    features.push(await scanFeature(assist, slug, diagnostics));
  }
  return features;
}

/** Build the navigation model for the page. */
export async function scanWorkspace(assist) {
  const diagnostics = [];

  const contextMd = await readIfExists(path.join(assist, "CONTEXT.md"));
  const context = {
    exists: contextMd != null,
    path: "CONTEXT.md",
    title: "Context",
    headings: contextMd ? headings(contextMd).filter((h) => h.level === 2).map((h) => h.text) : [],
  };

  const architecture = [];
  for (const file of await listDir(path.join(assist, "arch"))) {
    const rel = `arch/${file}`;
    const md = await readIfExists(path.join(assist, rel));
    if (md == null) continue;
    architecture.push({
      slug: file.replace(/\.md$/, ""),
      path: rel,
      title: firstH1(md) || titleCase(file.replace(/\.md$/, "")),
      headings: headings(md).filter((h) => h.level === 2).map((h) => h.text),
    });
  }

  const features = await scanFeatures(assist, diagnostics);
  const files = await scanWorkspaceFiles(assist);

  const severityRank = { error: 0, warn: 1 };
  diagnostics.sort((a, b) => (severityRank[a.severity] ?? 2) - (severityRank[b.severity] ?? 2));

  return { ok: true, mode: "desk", root: assist, context, architecture, features, files, diagnostics };
}
