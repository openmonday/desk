/* Read task markdown into plain data.
 *
 * A task follows `.context/issues/<slug>/tasks/<task-slug>.md`: an
 * `# NN: Title` heading, a `Status:` line, a `Blocked by:` line, and the
 * sections the skills write. The file name is a slug, so the number always
 * comes from the heading. */
import { firstH1, proseOnly } from "../markdown.mjs";

const STATUS_ALIASES = {
  pending: "pending",
  todo: "pending",
  open: "pending",
  "in-progress": "in-progress",
  "in progress": "in-progress",
  in_progress: "in-progress",
  doing: "in-progress",
  done: "done",
  complete: "done",
  completed: "done",
  closed: "done",
  merged: "done",
  dropped: "dropped",
  removed: "dropped",
  cancelled: "dropped",
  canceled: "dropped",
};

const OWNER_RE = /^(.*?)\s*\(([^()]+)\)\s*$/;

function normalizeStatus(raw) {
  if (!raw) return { status: "unknown", statusRaw: "unspecified", owner: null };
  const clean = raw.trim();
  const m = clean.match(OWNER_RE);
  const word = (m ? m[1] : clean).trim().toLowerCase().replace(/\s+/g, " ");
  const key = STATUS_ALIASES[word] || word;
  return {
    status: STATUS_ALIASES[word] ? key : "unknown",
    statusRaw: clean,
    owner: m && key === "in-progress" ? m[2].trim() : null,
  };
}

function parseBlockedBy(raw) {
  if (!raw) return null;
  const clean = raw.trim();
  if (/^(none|-|—|n\/a|nothing|unblocked)$/i.test(clean)) return [];
  const nums = [...clean.matchAll(/#?(\d+)/g)].map((m) => m[1].padStart(2, "0"));
  return [...new Set(nums)];
}

export function parseTask(md) {
  const prose = proseOnly(md);
  const h1 = firstH1(prose);
  const m = h1?.match(/^\s*#?(\d+)\s*[:.\-–]\s*(.+)$/);
  const statusRaw = prose.match(/^\s*Status:\s*(.+?)\s*$/im)?.[1] ?? null;
  const blockedRaw = prose.match(/^\s*Blocked by:\s*(.+?)\s*$/im)?.[1] ?? null;
  const { status, owner } = normalizeStatus(statusRaw);
  const hasAcceptance = /##\s*Acceptance criteria/i.test(prose);
  const checks = (prose.match(/^\s*[-*]\s*\[[ xX]\]/gm) || []).length;
  const checked = (prose.match(/^\s*[-*]\s*\[[xX]\]/gm) || []).length;
  return {
    n: m ? Number(m[1]) : null,
    title: m ? m[2].trim() : h1 || "Untitled task",
    titleOk: Boolean(m),
    status,
    statusRaw: statusRaw ? statusRaw.trim() : "unspecified",
    owner,
    blockedBy: parseBlockedBy(blockedRaw) ?? [],
    hasAcceptance,
    checks,
    checked,
  };
}

export function detectCycles(tasks) {
  const numKey = (n) => String(Number(n));
  const byN = new Map(tasks.map((t) => [numKey(t.n), t]));
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
  for (const t of tasks) walk(numKey(t.n), []);
  return [...new Set(found)];
}
