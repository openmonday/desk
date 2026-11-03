/* desk scanner. Reads a `.desk` workspace into the page model. */
import fs from "node:fs/promises";
import path from "node:path";

const STATUS_ALIASES = {
  pending: "pending",
  todo: "pending",
  open: "pending",
  "in-progress": "in-progress",
  "in progress": "in-progress",
  in_progress: "in-progress",
  "in review": "in-progress",
  doing: "in-progress",
  done: "done",
  complete: "done",
  completed: "done",
  closed: "done",
  merged: "done",
  blocked: "blocked",
};

const SPEC_SECTIONS = ["Problem Statement", "Solution", "Implementation Decisions", "Testing Decisions", "Out of Scope"];

/** Walk up from `start` looking for a `.desk` directory. */
export async function findWorkspace(start) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, ".desk");
    try {
      const st = await fs.stat(candidate);
      if (st.isDirectory()) return candidate;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Strip fenced code blocks so headings inside code are ignored. */
function proseOnly(md) {
  return md.replace(/^```[\s\S]*?^```/gm, "").replace(/^~~~[\s\S]*?^~~~/gm, "");
}

export function headings(md) {
  return [...proseOnly(md).matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].replace(/[*`_]/g, "").trim(),
  }));
}

function firstH1(md) {
  return headings(md).find((h) => h.level === 1)?.text || null;
}

function titleCase(slug) {
  return slug.split(/[-_]/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function normalizeStatus(raw) {
  if (!raw) return { status: "unknown", statusRaw: "unspecified" };
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return { status: STATUS_ALIASES[key] || "unknown", statusRaw: raw.trim() };
}

function parseBlockedBy(raw) {
  if (!raw) return null;
  const clean = raw.trim();
  if (/^(none|-|—|n\/a|nothing|unblocked)$/i.test(clean)) return [];
  const nums = [...clean.matchAll(/#?(\d+)/g)].map((m) => m[1].padStart(2, "0"));
  return [...new Set(nums)];
}

export function parseTicket(md) {
  const prose = proseOnly(md);
  const h1 = firstH1(prose);
  const m = h1?.match(/^\s*#?(\d+)\s*[:.\-–]\s*(.+)$/);
  const statusRaw = prose.match(/^\s*Status:\s*(.+?)\s*$/im)?.[1] ?? null;
  const blockedRaw = prose.match(/^\s*Blocked by:\s*(.+?)\s*$/im)?.[1] ?? null;
  const { status } = normalizeStatus(statusRaw);
  const hasAcceptance = /##\s*Acceptance criteria/i.test(prose);
  const checks = (prose.match(/^\s*[-*]\s*\[[ xX]\]/gm) || []).length;
  return {
    n: m ? Number(m[1]) : null,
    title: m ? m[2].trim() : h1 || "Untitled ticket",
    titleOk: Boolean(m),
    status,
    statusRaw: statusRaw ? statusRaw.trim() : "unspecified",
    blockedBy: parseBlockedBy(blockedRaw) ?? [],
    hasAcceptance,
    checks,
  };
}

async function readIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function listDir(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith(".md") && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

async function listSubdirs(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

const numKey = (n) => String(Number(n));

function detectCycles(tickets) {
  const byN = new Map(tickets.map((t) => [numKey(t.n), t]));
  const state = new Map();
  const found = [];
  const walk = (n, trail) => {
    if (state.get(n) === "done") return;
    if (state.get(n) === "open") {
      found.push([...trail, n].join(" → "));
      return;
    }
    state.set(n, "open");
    for (const b of byN.get(n)?.blockedBy || []) walk(numKey(b), [...trail, n]);
    state.set(n, "done");
  };
  for (const t of tickets) walk(numKey(t.n), []);
  return [...new Set(found)];
}

async function scanFeature(assist, slug, diagnostics) {
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

  const features = [];
  for (const slug of await listSubdirs(path.join(assist, "features"))) {
    features.push(await scanFeature(assist, slug, diagnostics));
  }

  const severityRank = { error: 0, warn: 1 };
  diagnostics.sort((a, b) => (severityRank[a.severity] ?? 2) - (severityRank[b.severity] ?? 2));

  return { ok: true, root: assist, context, architecture, features, diagnostics };
}

/** Resolve a client-supplied relative path to a readable markdown file inside the workspace. */
export async function resolveDoc(assist, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  if (!rel.endsWith(".md")) return null;

  const root = await fs.realpath(assist);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;

  let real;
  try {
    real = await fs.realpath(abs);
  } catch {
    return null;
  }
  if (!real.startsWith(root + path.sep)) return null;

  const st = await fs.stat(real).catch(() => null);
  if (!st?.isFile() || st.size > 2 * 1024 * 1024) return null;

  return { real, mtime: st.mtimeMs };
}

export async function readDoc(assist, rel) {
  const hit = await resolveDoc(assist, rel);
  if (!hit) return null;
  const md = await fs.readFile(hit.real, "utf8");
  return { md, mtime: hit.mtime };
}
