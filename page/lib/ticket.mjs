/* desk ticket writer — the AI-facing mutation layer.
 *
 * Every function takes the workspace directory (the `.desk` folder) and a plain
 * object, so the same code backs both `desk.mjs` (CLI) and `serve.mjs` (HTTP).
 * No dependencies, no state, and no assumptions about who is calling. */
import fsp from "node:fs/promises";
import path from "node:path";
import { parseTicket } from "./scan.mjs";

const STATUSES = new Set(["pending", "in-progress", "done", "blocked"]);
const ALIASES = {
  todo: "pending",
  open: "pending",
  "not started": "pending",
  todo: "pending",
  "in progress": "in-progress",
  doing: "in-progress",
  wip: "in-progress",
  started: "in-progress",
  complete: "done",
  completed: "done",
  closed: "done",
  merged: "done",
  finished: "done",
  waiting: "blocked",
};

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export const badRequest = (m) => fail(400, m);
export const notFound = (m) => fail(404, m);
export const conflict = (m) => fail(409, m);

export function canonicalStatus(raw) {
  const key = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) throw badRequest("status is required");
  const status = STATUSES.has(key) ? key : ALIASES[key];
  if (!status) throw badRequest(`unknown status "${raw}"; use pending, in-progress, done, or blocked`);
  return status;
}

export function normalizeN(raw) {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 999) throw badRequest(`invalid ticket number "${raw}"`);
  return n;
}

function checkFeature(feature) {
  const slug = String(feature ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug) || slug.includes("..")) {
    throw badRequest(`invalid feature slug "${feature}"`);
  }
  return slug;
}

const exists = (p) => fsp.stat(p).then(() => true, () => false);

export function slugify(title, max = 48) {
  const s = String(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/, "") || "ticket";
}

export function normalizeBlockedBy(list) {
  const raw = Array.isArray(list) ? list : String(list ?? "").split(/[,\s]+/);
  const nums = [];
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    if (/^(none|-|—|n\/a|nothing|unblocked)$/i.test(s)) continue;
    const m = s.match(/#?(\d+)/);
    if (!m) throw badRequest(`invalid blocker "${item}"; use ticket numbers like 01, 02`);
    nums.push(String(m[1]).padStart(2, "0"));
  }
  return [...new Set(nums)].sort();
}

const nn = (n) => String(n).padStart(2, "0");

function headerBlock(n, title, status, blockedBy) {
  return `# ${nn(n)}: ${title}\n\nStatus: ${status}\nBlocked by: ${blockedBy.length ? blockedBy.join(", ") : "None"}\n\n`;
}

function defaultBody() {
  return [
    "## What to build",
    "",
    "_Describe the change._",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] _Describe the observable result._",
    "",
  ].join("\n");
}

function bodyBlock(body) {
  const text = String(body).replace(/\r\n/g, "\n").trim();
  if (!text) return defaultBody();
  return text.endsWith("\n") ? text : `${text}\n`;
}

function splitHead(md) {
  const eol = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  const h1i = lines.findIndex((l) => /^#\s+/.test(l));
  const nextSection = lines.findIndex((l, i) => i > h1i && /^##\s+/.test(l));
  return { eol, lines, h1i, secI: nextSection === -1 ? lines.length : nextSection };
}

function fieldIndex(lines, from, to, key) {
  for (let i = from; i < to; i++) {
    if (new RegExp(`^\\s*${key}\\s*:`, "i").test(lines[i])) return i;
  }
  return -1;
}

function setTitle(md, title, n) {
  const { eol, lines, h1i } = splitHead(md);
  if (h1i === -1) throw badRequest('ticket has no "# NN: Title" heading');
  const clean = String(title).replace(/^\s*\d+\s*[:.\-–]\s*/, "").replace(/\s+/g, " ").trim();
  if (!clean) throw badRequest("title is required");
  lines[h1i] = `# ${nn(n)}: ${clean}`;
  return lines.join(eol);
}

function setField(md, key, value) {
  const { eol, lines, h1i, secI } = splitHead(md);
  if (h1i === -1) throw badRequest('ticket has no "# NN: Title" heading');
  const at = fieldIndex(lines, h1i + 1, secI, key);
  if (at !== -1) {
    lines[at] = `${key}: ${value}`;
  } else {
    let insertAt = h1i + 1;
    for (let i = h1i + 1; i < secI; i++) {
      if (/^\s*(Status|Blocked by)\s*:/i.test(lines[i])) insertAt = i + 1;
    }
    if (insertAt === h1i + 1 && lines[h1i + 1] === "") insertAt = h1i + 2;
    lines.splice(insertAt, 0, `${key}: ${value}`);
  }
  return lines.join(eol);
}

const setStatus = (md, status) => setField(md, "Status", status);
const setBlockedBy = (md, list) => setField(md, "Blocked by", list.length ? list.join(", ") : "None");

function setBody(md, body) {
  const { eol, lines, secI } = splitHead(md);
  if (secI === lines.length) {
    const head = lines.join(eol).replace(/\s+$/, "");
    return `${head}${eol}${eol}${bodyBlock(body)}`;
  }
  const head = lines.slice(0, secI).join(eol).replace(/\s+$/, "");
  return `${head}${eol}${eol}${bodyBlock(body)}`;
}

function tickBoxes(md) {
  return md.replace(/^(\s*[-*]\s*)\[ \](\s)/gm, "$1[x]$2");
}

async function readTicketFile(workspace, feature, n) {
  const ticketsDir = path.join(workspace, "features", feature, "tickets");
  const files = await fsp.readdir(ticketsDir).catch(() => []);
  const hit = files.find((f) => /^\d+.*\.md$/.test(f) && Number(f.match(/^\d+/)[0]) === n);
  if (!hit) throw notFound(`ticket ${nn(n)} not found in feature "${feature}"`);
  return { file: path.join(ticketsDir, hit), dir: ticketsDir };
}

async function nextNumber(ticketsDir) {
  const files = await fsp.readdir(ticketsDir).catch(() => []);
  const nums = files.filter((f) => /^\d+.*\.md$/.test(f)).map((f) => Number(f.match(/^\d+/)[0]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

async function result(workspace, feature, n, action) {
  const { file } = await readTicketFile(workspace, feature, n);
  const md = await fsp.readFile(file, "utf8");
  const t = parseTicket(md);
  return {
    ok: true,
    action,
    feature,
    n,
    path: path.relative(workspace, file).split(path.sep).join("/"),
    title: t.title,
    status: t.status,
    blockedBy: t.blockedBy,
  };
}

export async function createTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const title = String(input.title ?? "").replace(/^\s*\d+\s*[:.\-–]\s*/, "").replace(/\s+/g, " ").trim();
  if (!title) throw badRequest("title is required");
  const status = input.status ? canonicalStatus(input.status) : "pending";
  const blockedBy = normalizeBlockedBy(input.blockedBy);

  const featureDir = path.join(workspace, "features", feature);
  if (!(await exists(featureDir))) throw notFound(`feature "${feature}" not found under features/`);
  const ticketsDir = path.join(featureDir, "tickets");
  await fsp.mkdir(ticketsDir, { recursive: true });

  const n = await nextNumber(ticketsDir);
  const file = path.join(ticketsDir, `${nn(n)}-${slugify(title)}.md`);
  const md = headerBlock(n, title, status, blockedBy) + bodyBlock(input.body ?? "");
  await fsp.writeFile(file, md, { flag: "wx" });
  return result(workspace, feature, n, "created");
}

export async function updateTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const n = normalizeN(input.n);
  const { file } = await readTicketFile(workspace, feature, n);

  let md = await fsp.readFile(file, "utf8");
  let changed = false;
  if (input.title != null) { md = setTitle(md, input.title, n); changed = true; }
  if (input.status != null) { md = setStatus(md, canonicalStatus(input.status)); changed = true; }
  if (input.blockedBy != null) { md = setBlockedBy(md, normalizeBlockedBy(input.blockedBy)); changed = true; }
  if (input.body != null) { md = setBody(md, input.body); changed = true; }
  if (!changed) throw badRequest("nothing to update; pass title, status, blockedBy, or body");

  await fsp.writeFile(file, md);
  return result(workspace, feature, n, "updated");
}

export async function completeTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const n = normalizeN(input.n);
  const { file } = await readTicketFile(workspace, feature, n);

  let md = await fsp.readFile(file, "utf8");
  md = setStatus(md, "done");
  md = tickBoxes(md);
  await fsp.writeFile(file, md);
  return result(workspace, feature, n, "completed");
}

export async function removeTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const n = normalizeN(input.n);
  const { file, dir } = await readTicketFile(workspace, feature, n);

  const dependents = [];
  for (const name of await fsp.readdir(dir)) {
    if (!/^\d+.*\.md$/.test(name)) continue;
    const p = path.join(dir, name);
    const t = parseTicket(await fsp.readFile(p, "utf8"));
    if (t.blockedBy.some((b) => Number(b) === n)) dependents.push(nn(t.n));
  }

  if (dependents.length && !input.force) {
    throw conflict(`ticket ${nn(n)} is blocked-by for ${dependents.join(", ")}; pass force to delete anyway`);
  }
  await fsp.unlink(file);
  return { ok: true, action: "removed", feature, n, path: path.relative(workspace, file).split(path.sep).join("/"), dependents };
}

/** Compact list for agents: one row per ticket, blockers and readiness included. */
export function listTickets(tree, feature) {
  const features = feature ? tree.features.filter((f) => f.slug === feature) : tree.features;
  return features.flatMap((f) => {
    const byN = new Map(f.tickets.map((t) => [String(t.n), t]));
    return f.tickets.map((t) => {
      const open = t.blockedBy.map((b) => byN.get(String(Number(b)))).filter((b) => b && b.status !== "done");
      return {
        feature: f.slug,
        n: t.n,
        title: t.title,
        status: t.status,
        blockedBy: t.blockedBy,
        open,
        ready: t.status === "pending" && open.length === 0,
        path: t.path,
      };
    });
  });
}
