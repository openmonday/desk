/* Build the page model from a `.context/` workspace.
 *
 * The workspace has three lasting parts: the glossary, the map records, and
 * the issues. An issue groups one unit of work: a spec, an optional research
 * report with its diagrams, and the task files that split the spec. */
import fs from "node:fs/promises";
import path from "node:path";
import { firstH1, headings, titleCase } from "../markdown.mjs";
import { listDir, listSubdirs, readIfExists } from "../workspace.mjs";
import { detectCycles, parseTask } from "../tasks/parse.mjs";
import { parseRecord } from "../records/parse.mjs";
import { scanWorkspaceFiles } from "../workspace-files.mjs";

const SPEC_SECTIONS = [
  "Problem Statement",
  "Solution",
  "User Stories",
  "Implementation Decisions",
  "Constraints",
  "Testing Decisions",
  "Out of Scope",
];
const MD_RE = /\.md$/i;
const numKey = (n) => String(Number(n));

export async function scanRecord(assist, rel, diagnostics) {
  const md = await readIfExists(path.join(assist, rel));
  if (md == null) return null;
  const record = parseRecord(md);
  for (const problem of record.problems) {
    diagnostics.push({ severity: "warn", path: rel, message: `record front matter: ${problem}` });
  }
  if (record.type === "feat" && !record.hasFeature) {
    diagnostics.push({ severity: "warn", path: rel, message: 'feat record has no "## Feature" section' });
  }
  if (record.type === "refactor" && (!record.hasConstraints || !record.hasArchitecture)) {
    diagnostics.push({ severity: "warn", path: rel, message: 'refactor record needs "## Constraints" and "## Architecture"' });
  }
  return {
    ...record,
    slug: rel.replace(/^map\//, "").replace(/\.md$/, ""),
    path: rel,
    title: record.title || titleCase(path.basename(rel, ".md")),
  };
}

/** Every record under `map/`, including module folders. */
async function scanMap(assist, diagnostics) {
  const root = path.join(assist, "map");
  const records = [];
  const walk = async (rel) => {
    let entries;
    try {
      entries = await fs.readdir(path.join(assist, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(childRel);
        continue;
      }
      if (!entry.isFile() || !MD_RE.test(entry.name)) continue;
      const record = await scanRecord(assist, childRel, diagnostics);
      if (record) records.push(record);
    }
  };
  await walk("map");
  return { path: "map", records };
}

async function scanIssue(assist, slug, diagnostics) {
  const rel = `issues/${slug}`;
  const dir = path.join(assist, rel);
  const title = titleCase(slug);
  const specMd = await readIfExists(path.join(dir, "spec.md"));
  const specPath = specMd == null ? null : `${rel}/spec.md`;

  if (specMd != null) {
    if (firstH1(specMd)) {
      diagnostics.push({ severity: "warn", path: specPath, message: "spec has an H1; specs start at ## Problem Statement" });
    }
    for (const section of SPEC_SECTIONS) {
      if (!new RegExp(`^##\\s*${section}`, "im").test(specMd)) {
        diagnostics.push({ severity: "warn", path: specPath, message: `spec is missing "## ${section}"` });
      }
    }
  } else {
    diagnostics.push({
      severity: "warn",
      path: rel,
      message: "issue has no spec.md; run /to-spec to create one",
    });
  }

  const researchMd = await readIfExists(path.join(dir, "research.md"));
  const researchPath = researchMd == null ? null : `${rel}/research.md`;

  const taskFiles = (await listDir(path.join(dir, "tasks"))).filter((f) => MD_RE.test(f));
  const tasks = [];
  const seen = new Map();
  for (const file of taskFiles) {
    const p = `${rel}/tasks/${file}`;
    const md = await readIfExists(path.join(dir, "tasks", file));
    if (md == null) continue;
    const t = parseTask(md);
    if (t.n == null) {
      diagnostics.push({ severity: "error", path: p, message: 'task heading is not "# NN: Title", so it has no number' });
    } else if (seen.has(numKey(t.n))) {
      diagnostics.push({ severity: "error", path: p, message: `task number ${t.n} is already used by ${seen.get(numKey(t.n))}` });
    } else {
      seen.set(numKey(t.n), p);
    }
    if (t.statusRaw === "unspecified") {
      diagnostics.push({ severity: "error", path: p, message: "task has no Status line" });
    } else if (t.status === "unknown") {
      diagnostics.push({ severity: "warn", path: p, message: `unknown task status "${t.statusRaw}"; use pending, in-progress, done, or dropped` });
    }
    if (!t.hasAcceptance) {
      diagnostics.push({ severity: "warn", path: p, message: 'task has no "## Acceptance criteria" section' });
    }
    tasks.push({ ...t, path: p });
  }

  tasks.sort((a, b) => (a.n ?? Number.MAX_SAFE_INTEGER) - (b.n ?? Number.MAX_SAFE_INTEGER)
    || a.path.localeCompare(b.path));

  const byN = new Map(tasks.filter((t) => t.n != null).map((t) => [numKey(t.n), t]));
  for (const t of tasks) {
    for (const b of t.blockedBy) {
      const blocker = byN.get(numKey(b));
      if (!blocker) {
        diagnostics.push({ severity: "error", path: t.path, message: `blocked by task ${b}, which does not exist` });
      } else if (blocker.status === "dropped") {
        diagnostics.push({ severity: "warn", path: t.path, message: `blocked by task ${b}, which is dropped` });
      }
    }
  }
  for (const cycle of detectCycles(tasks.filter((t) => t.n != null))) {
    diagnostics.push({ severity: "error", path: `${rel}/tasks`, message: `dependency cycle: ${cycle}` });
  }

  const open = tasks.filter((t) => t.status !== "dropped");
  const done = open.filter((t) => t.status === "done").length;

  return {
    slug,
    path: rel,
    title,
    specPath,
    specHeadings: specMd ? headings(specMd).map((h) => h.text) : [],
    researchPath,
    tasks,
    progress: { done, total: open.length, dropped: tasks.length - open.length },
  };
}

/** Scan only the `issues/` folder. */
export async function scanIssues(assist, diagnostics = []) {
  const issues = [];
  for (const slug of await listSubdirs(path.join(assist, "issues"))) {
    issues.push(await scanIssue(assist, slug, diagnostics));
  }
  return issues;
}

/** Build the navigation model for the page. */
export async function scanWorkspace(assist) {
  const diagnostics = [];

  const glossaryMd = await readIfExists(path.join(assist, "GLOSSARY.md"));
  const glossary = {
    exists: glossaryMd != null,
    path: "GLOSSARY.md",
    title: "Glossary",
    headings: glossaryMd ? headings(glossaryMd).filter((h) => h.level === 2).map((h) => h.text) : [],
  };

  const map = await scanMap(assist, diagnostics);
  const issues = await scanIssues(assist, diagnostics);
  const files = await scanWorkspaceFiles(assist);

  const severityRank = { error: 0, warn: 1 };
  diagnostics.sort((a, b) => (severityRank[a.severity] ?? 2) - (severityRank[b.severity] ?? 2));

  return {
    ok: true,
    mode: "context",
    root: assist,
    glossary,
    map,
    issues,
    files,
    diagnostics,
  };
}
