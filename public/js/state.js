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

const docsMode = () => S.tree?.mode === "docs";

function docsSections() {
  return S.tree?.sections || [];
}

function docsSection(key) {
  return docsSections().find((s) => s.key === key) || null;
}

const WORKSPACE_TABS = ["context", "architecture", "features"];
const TAB_LABELS = { context: "Context", architecture: "Architecture", features: "Features" };

/** Top tabs in configured order, hidden ones left out. */
function tabDefs() {
  if (docsMode()) return docsSections().map((section) => ({ key: section.key, label: section.title }));
  const nav = S.tree?.nav;
  const order = Array.isArray(nav?.order) && nav.order.length ? nav.order : WORKSPACE_TABS;
  const hidden = new Set(nav?.hidden || []);
  return order
    .filter((id) => TAB_LABELS[id] && !hidden.has(id))
    .map((id) => ({ key: id, label: TAB_LABELS[id] }));
}

/** The configured landing tab, or null when the default is automatic. */
function configuredDefault() {
  const preferred = S.tree?.nav?.default;
  return preferred && tabDefs().some((tab) => tab.key === preferred) ? preferred : null;
}

function findDocsFile(nodes, path) {
  for (const node of nodes || []) {
    if (node.type === "file" && node.path === path) return node;
    if (node.type === "dir") {
      const hit = findDocsFile(node.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

function docsEntryForFile(section, file) {
  return {
    kind: "doc",
    path: file.path,
    title: file.title,
    tab: section.key,
    section,
    file,
  };
}

function docsEntryForFeature(section, feature) {
  if (feature.specPath) {
    return {
      kind: "spec",
      path: feature.specPath,
      title: feature.title,
      tab: section.key,
      feature,
    };
  }
  const first = feature.tickets?.[0];
  return first ? {
    kind: "ticket", path: first.path, title: first.title, tab: section.key, feature, ticket: first,
  } : null;
}

function docsFeatureByPath(path) {
  for (const section of docsSections()) {
    if (section.kind !== "features") continue;
    for (const feature of section.features || []) {
      if (feature.specPath === path) return { section, feature, ticket: null };
      const ticket = (feature.tickets || []).find((t) => t.path === path);
      if (ticket) return { section, feature, ticket };
    }
  }
  return null;
}

function docsEntryByPath(path) {
  for (const section of docsSections()) {
    const file = findDocsFile(section.tree, path);
    if (file) return docsEntryForFile(section, file);
  }
  return null;
}

function docsEntryByTab(tab) {
  const section = docsSection(tab) || docsSections()[0];
  if (!section) return null;
  if (section.kind === "features") {
    const feature = section.features?.find((f) => f.specPath) || section.features?.[0];
    return feature ? docsEntryForFeature(section, feature) : null;
  }
  if (!section.firstPath) return null;
  return docsEntryByPath(section.firstPath);
}

function defaultDocsEntry() {
  const overview = docsSections().find((section) => section.kind === "overview");
  const first = overview || docsSections()[0];
  if (!first) return null;
  return first.kind === "features" ? docsEntryByTab(first.key) : docsEntryByPath(first.firstPath);
}

function entryForPath(path) {
  const t = S.tree;
  if (!t || !path) return null;
  if (t.mode === "docs") {
    const feature = docsFeatureByPath(path);
    if (feature) {
      if (feature.ticket) {
        return {
          kind: "ticket",
          path,
          title: feature.ticket.title,
          tab: feature.section.key,
          feature: feature.feature,
          ticket: feature.ticket,
        };
      }
      return docsEntryForFeature(feature.section, feature.feature);
    }
    return docsEntryByPath(path);
  }
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

function docsPaths(nodes) {
  const out = [];
  for (const node of nodes || []) {
    if (node.type === "file") out.push([node.path, node.title]);
    else out.push(...docsPaths(node.children));
  }
  return out;
}

function docsFeatureSignature(section) {
  return (section.features || []).map((f) => [
    f.slug,
    f.specPath,
    f.progress?.done,
    f.progress?.total,
    (f.tickets || []).map((t) => [t.path, t.status, t.statusRaw, t.title, t.blockedBy.join(",")]),
  ]);
}

function treeSignature(tree) {
  if (!tree) return "";
  if (tree.mode === "docs") {
    return JSON.stringify((tree.sections || []).map((s) => [
      s.key, s.kind, s.firstPath, docsPaths(s.tree), docsFeatureSignature(s),
    ]));
  }
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
  if (S.doc.kind === "doc") return S.doc.title;
  if (S.doc.kind === "spec") return S.doc.feature.title;
  if (S.doc.kind === "ticket") return `${num(S.doc.ticket.n)} ${S.doc.ticket.title}`;
  return S.doc.title;
}

export {
  S, num, key, plural, narrow, featureBySlug, entryForPath,
  docsMode, docsSections, docsSection, docsEntryByTab, defaultDocsEntry,
  docsEntryForFeature, docsFeatureByPath, tabDefs, configuredDefault,
  KIND_LABEL, featureIndex, stateOf, shortState, tally, tallyText,
  treeSignature, docTitle,
};
