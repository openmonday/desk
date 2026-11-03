/* Ticket vocabulary, validation, and normalization. */
import fsp from "node:fs/promises";

export const STATUSES = new Set(["pending", "in-progress", "done", "blocked"]);

export const ALIASES = {
  todo: "pending",
  open: "pending",
  "not started": "pending",
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

export function checkFeature(feature) {
  const slug = String(feature ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug) || slug.includes("..")) {
    throw badRequest(`invalid feature slug "${feature}"`);
  }
  return slug;
}

export const exists = (p) => fsp.stat(p).then(() => true, () => false);

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

export const nn = (n) => String(n).padStart(2, "0");
