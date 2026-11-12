/* Shared page state, task-state derivations, and small helpers. */

const S = {
  tab: "issues",
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

function issueBySlug(slug) {
  return (S.tree?.issues || []).find((issue) => issue.slug === slug) || null;
}

function recordBySlug(slug) {
  return (S.tree?.map?.records || []).find((record) => record.slug === slug) || null;
}

const docsMode = () => S.tree?.mode === "docs";

function docsSections() {
  return S.tree?.sections || [];
}

function docsSection(keyName) {
  return docsSections().find((section) => section.key === keyName) || null;
}

const WORKSPACE_TABS = ["glossary", "map", "issues"];
const TAB_LABELS = {
  overview: "Overview", glossary: "Glossary", map: "Map", issues: "Issues",
};

/** Top tabs in configured order, hidden ones left out. */
function tabDefs() {
  if (docsMode()) return docsSections().map((section) => ({ key: section.key, label: section.title }));
  const nav = S.tree?.nav;
  const order = Array.isArray(nav?.order) && nav.order.length ? nav.order : WORKSPACE_TABS;
  const hidden = new Set(nav?.hidden || []);
  const sections = order
    .filter((id) => TAB_LABELS[id] && !hidden.has(id))
    .map((id) => ({ key: id, label: TAB_LABELS[id] }));
  return [{ key: "overview", label: TAB_LABELS.overview }, ...sections];
}

/** The configured landing tab, or null when the default is automatic. */
function configuredDefault() {
  const preferred = S.tree?.nav?.default;
  return preferred && tabDefs().some((tab) => tab.key === preferred) ? preferred : null;
}

function findTreeFile(nodes, path) {
  for (const node of nodes || []) {
    if (node.type === "file" && node.path === path) return node;
    if (node.type === "dir") {
      const hit = findTreeFile(node.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

function firstTreeFile(nodes) {
  for (const node of nodes || []) {
    if (node.type === "file") return node;
    if (node.type === "dir") {
      const hit = firstTreeFile(node.children);
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

function docsEntryByPath(path) {
  for (const section of docsSections()) {
    const file = findTreeFile(section.tree, path);
    if (file) return docsEntryForFile(section, file);
  }
  return null;
}

function docsEntryByTab(tab) {
  const section = docsSection(tab) || docsSections()[0];
  if (!section || !section.firstPath) return null;
  return docsEntryByPath(section.firstPath);
}

function defaultDocsEntry() {
  const overview = docsSections().find((section) => section.kind === "overview");
  const first = overview || docsSections()[0];
  return first ? docsEntryByTab(first.key) : null;
}

function overviewEntryForPath(path) {
  const entry = entryForPath(path);
  return entry ? { ...entry, tab: "overview" } : null;
}

function firstOverviewEntry() {
  const file = firstTreeFile(S.tree?.files?.children || S.tree?.files || []);
  return file ? overviewEntryForPath(file.path) : null;
}

function entryForPath(path) {
  const t = S.tree;
  if (!t || !path) return null;
  if (t.mode === "docs") return docsEntryByPath(path);
  if (t.glossary?.exists && t.glossary.path === path) {
    return { kind: "glossary", path, title: t.glossary.title || "Glossary", tab: "glossary" };
  }
  const record = (t.map?.records || []).find((item) => item.path === path);
  if (record) return { kind: "record", path, title: record.title, tab: "map", record };
  for (const issue of t.issues || []) {
    if (issue.specPath === path) return { kind: "spec", path, title: issue.title, tab: "issues", issue };
    if (issue.researchPath === path) {
      return { kind: "research", path, title: "Research", tab: "issues", issue };
    }
    const task = (issue.tasks || []).find((item) => item.path === path);
    if (task) return { kind: "task", path, title: task.title, tab: "issues", issue, task };
  }
  const file = findTreeFile(t.files?.children || t.files || [], path);
  if (file) {
    return {
      kind: "doc",
      path,
      title: file.title || file.name,
      tab: "overview",
      section: { key: "overview", title: "Overview", kind: "overview" },
      file,
    };
  }
  return null;
}

// "Waiting" = pending with open blockers; "Dropped" = removed from the plan.

const KIND_LABEL = {
  done: "Done",
  active: "In progress",
  ready: "Ready",
  waiting: "Waiting",
  dropped: "Dropped",
  unknown: "Unknown status",
};

const indexCache = new WeakMap();
function issueIndex(issue) {
  let idx = indexCache.get(issue);
  if (idx) return idx;
  const tasks = issue.tasks || [];
  const byN = new Map(tasks.filter((t) => t.n != null).map((t) => [key(t.n), t]));
  const dependents = new Map();
  for (const t of tasks) {
    for (const b of t.blockedBy) {
      const k = key(b);
      if (!dependents.has(k)) dependents.set(k, []);
      dependents.get(k).push(t);
    }
  }
  const states = new Map(tasks.filter((t) => t.n != null).map((t) => [key(t.n), stateOf(t, byN)]));
  idx = { byN, dependents, states };
  indexCache.set(issue, idx);
  return idx;
}

function stateOf(t, byN) {
  const blockers = t.blockedBy.map((b) =>
    byN.get(key(b)) || { n: Number(b), title: "missing task", status: "unknown", missing: true });
  const open = blockers.filter((b) => b.status !== "done");
  let kind;
  if (t.status === "done") kind = "done";
  else if (t.status === "in-progress") kind = "active";
  else if (t.status === "dropped") kind = "dropped";
  else if (t.status === "unknown") kind = "unknown";
  else kind = open.length ? "waiting" : "ready";
  return { kind, blockers, open };
}

function shortState(st) {
  if (st.kind === "waiting") return `Waiting on ${st.open.map((b) => num(b.n)).join(", ")}`;
  return KIND_LABEL[st.kind];
}

function tally(issue) {
  const { states } = issueIndex(issue);
  const c = { done: 0, active: 0, ready: 0, waiting: 0, dropped: 0, unknown: 0 };
  for (const st of states.values()) c[st.kind]++;
  return c;
}

function tallyText(issue) {
  const c = tally(issue);
  const total = (issue.tasks || []).length;
  const parts = [`${c.done} of ${total} done`];
  if (c.active) parts.push(`${c.active} in progress`);
  if (c.ready) parts.push(`${c.ready} ready`);
  if (c.waiting) parts.push(`${c.waiting} waiting`);
  if (c.dropped) parts.push(`${c.dropped} dropped`);
  if (c.unknown) parts.push(`${c.unknown} unknown`);
  return parts.join(" · ");
}


/* ---------- routes ---------- */

const encodeParts = (path) => String(path || "").split("/").map(encodeURIComponent).join("/");

/** The hash a document outside the page's record types opens at. */
function hashForPath(path) {
  const t = S.tree;
  if (!t) return null;
  if (t.mode === "docs") return `#/docs/${encodeParts(path)}`;
  const entry = entryForPath(path);
  return entry ? hashForEntry(entry) : `#/overview/${encodeParts(path)}`;
}

function hashForEntry(entry) {
  if (!entry) return null;
  if (S.tree?.mode === "docs") return `#/docs/${encodeParts(entry.path)}`;
  if (entry.kind === "glossary") return "#/glossary";
  if (entry.kind === "record") return `#/map/${encodeParts(entry.record.slug)}`;
  if (entry.kind === "spec") return `#/issues/${encodeParts(entry.issue.slug)}`;
  if (entry.kind === "research") return `#/issues/${encodeParts(entry.issue.slug)}/research`;
  if (entry.kind === "task") return `#/issues/${encodeParts(entry.issue.slug)}/${entry.task.n}`;
  if (entry.tab === "overview" || entry.kind === "doc") return `#/overview/${encodeParts(entry.path)}`;
  return `#/${entry.tab}`;
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

function taskSignature(issue) {
  return [
    issue.slug,
    issue.specPath,
    issue.researchPath,
    issue.progress?.done,
    issue.progress?.total,
    (issue.tasks || []).map((t) => [t.path, t.status, t.statusRaw, t.title, t.blockedBy.join(",")]),
  ];
}

function treeSignature(tree) {
  if (!tree) return "";
  if (tree.mode === "docs") {
    return JSON.stringify((tree.sections || []).map((s) => [s.key, s.kind, s.firstPath, docsPaths(s.tree)]));
  }
  return JSON.stringify({
    glossary: [tree.glossary?.path, tree.glossary?.exists],
    records: (tree.map?.records || []).map((r) => [r.path, r.title, r.type, r.since]),
    issues: (tree.issues || []).map(taskSignature),
    files: docsPaths(tree.files ? [tree.files] : []),
  });
}

/* ---------- rail ---------- */

function docTitle() {
  if (!S.doc) return "desk";
  if (S.doc.kind === "spec") return S.doc.issue.title;
  if (S.doc.kind === "task") return `${num(S.doc.task.n)} ${S.doc.task.title}`;
  if (S.doc.kind === "research") return `${S.doc.issue.title} · Research`;
  return S.doc.title;
}

export {
  S, num, key, plural, narrow, issueBySlug, recordBySlug, entryForPath, hashForPath, hashForEntry,
  docsMode, docsSections, docsSection, docsEntryByTab, defaultDocsEntry,
  firstOverviewEntry, tabDefs, configuredDefault, KIND_LABEL, issueIndex, stateOf, shortState,
  tally, tallyText, treeSignature, docTitle,
};
