/* Read ticket markdown into plain data. */
import { firstH1, proseOnly } from "../markdown.mjs";

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

export function detectCycles(tickets) {
  const numKey = (n) => String(Number(n));
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
