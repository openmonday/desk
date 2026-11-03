/* Shared page state, ticket-state derivations, and small helpers. */

const S = {
  tab: "features",
  tree: null,
  doc: null,
  mdError: null,
  justDone: new Set(),
  graphSig: "",
};


const num = (n) => String(n).padStart(2, "0");
const key = (n) => String(Number(n));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const narrow = () => window.matchMedia("(max-width: 900px)").matches;

function featureBySlug(s) {
  return (S.tree?.features || []).find((f) => f.slug === s) || null;
}

function entryForPath(path) {
  const t = S.tree;
  if (!t || !path) return null;
  if (t.context?.path === path && t.context?.exists) {
    return { kind: "context", path, title: t.context.title || "Context", tab: "context" };
  }
  const arch = (t.architecture || []).find((a) => a.path === path);
  if (arch) return { kind: "arch", path, title: arch.title, tab: "architecture", record: arch };
  for (const f of t.features || []) {
    if (f.specPath === path) return { kind: "spec", path, title: f.title, tab: "features", feature: f };
    const tk = (f.tickets || []).find((x) => x.path === path);
    if (tk) return { kind: "ticket", path, title: tk.title, tab: "features", feature: f, ticket: tk };
  }
  return null;
}

// "Waiting" = pending with open blockers; "Blocked" = the file says blocked.

const KIND_LABEL = {
  done: "Done",
  active: "In progress",
  ready: "Ready",
  waiting: "Waiting",
  blocked: "Blocked",
  unknown: "Unknown status",
};

const indexCache = new WeakMap();
function featureIndex(f) {
  let idx = indexCache.get(f);
  if (idx) return idx;
  const tickets = f.tickets || [];
  const byN = new Map(tickets.map((t) => [key(t.n), t]));
  const dependents = new Map();
  for (const t of tickets) {
    for (const b of t.blockedBy) {
      const k = key(b);
      if (!dependents.has(k)) dependents.set(k, []);
      dependents.get(k).push(t);
    }
  }
  const states = new Map(tickets.map((t) => [key(t.n), stateOf(t, byN)]));
  idx = { byN, dependents, states };
  indexCache.set(f, idx);
  return idx;
}

function stateOf(t, byN) {
  const blockers = t.blockedBy.map((b) =>
    byN.get(key(b)) || { n: Number(b), title: "missing ticket", status: "unknown", missing: true });
  const open = blockers.filter((b) => b.status !== "done");
  let kind;
  if (t.status === "done") kind = "done";
  else if (t.status === "in-progress") kind = "active";
  else if (t.status === "blocked") kind = "blocked";
  else if (t.status === "unknown") kind = "unknown";
  else kind = open.length ? "waiting" : "ready";
  return { kind, blockers, open };
}

function shortState(st) {
  if (st.kind === "waiting") return `Waiting on ${st.open.map((b) => num(b.n)).join(", ")}`;
  return KIND_LABEL[st.kind];
}

function tally(f) {
  const { states } = featureIndex(f);
  const c = { done: 0, active: 0, ready: 0, waiting: 0, blocked: 0, unknown: 0 };
  for (const st of states.values()) c[st.kind]++;
  return c;
}

function tallyText(f) {
  const c = tally(f);
  const total = (f.tickets || []).length;
  const parts = [`${c.done} of ${total} done`];
  if (c.active) parts.push(`${c.active} in progress`);
  if (c.ready) parts.push(`${c.ready} ready`);
  if (c.waiting) parts.push(`${c.waiting} waiting`);
  if (c.blocked) parts.push(`${c.blocked} blocked`);
  if (c.unknown) parts.push(`${c.unknown} unknown`);
  return parts.join(" · ");
}


/* ---------- data ---------- */

function treeSignature(tree) {
  if (!tree) return "";
  return JSON.stringify((tree.features || []).map((f) => [
    f.slug,
    f.progress.done,
    f.progress.total,
    (f.tickets || []).map((t) => [t.n, t.status, t.statusRaw, t.title, t.blockedBy.join(",")]),
  ]));
}

/* ---------- rail ---------- */

function docTitle() {
  if (!S.doc) return "desk";
  if (S.doc.kind === "spec") return S.doc.feature.title;
  if (S.doc.kind === "ticket") return `${num(S.doc.ticket.n)} ${S.doc.ticket.title}`;
  return S.doc.title;
}

export {
  S, num, key, plural, narrow, featureBySlug, entryForPath,
  KIND_LABEL, featureIndex, stateOf, shortState, tally, tallyText,
  treeSignature, docTitle,
};
