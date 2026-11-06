/* The left rail: features, tickets, and workspace diagnostics. */

import {
  S, CODE_GRAPH_PATH, entryForPath, featureIndex, key, num, plural, shortState, tallyText,
  docsMode, docsSection, docsSections,
} from "./state.js";
import { cmd, el, glyph, progressLine, svgEl } from "./dom.js";
import { actions } from "./actions.js";
import { rail, railBody, railLabel } from "./refs.js";

function row({ label, lead, sub, active, path, onClick, cls = "", title }) {
  const b = el("button", {
    type: "button",
    class: `row ${cls}`.trim(),
    "aria-current": active ? "true" : "false",
    title: title || label,
    onclick: onClick,
  }, [
    lead || null,
    el("span", { class: "row-label" }, [label]),
    sub ? el("span", { class: "row-sub" }, [sub]) : null,
  ]);
  if (path) b.dataset.path = path;
  return el("li", {}, [b]);
}

function ticketRow(f, tk) {
  const st = featureIndex(f).states.get(key(tk.n));
  const done = S.justDone.has(tk.path);
  const dot = el("i", {
    class: `dot${done ? " just-done" : ""}`,
    "data-status": tk.status,
    "data-kind": st.kind,
  }, [glyph(st.kind, 12)]);
  const li = row({
    cls: "row-ticket",
    lead: el("span", { class: "row-lead" }, [dot, el("span", { class: "row-n" }, [num(tk.n)])]),
    label: tk.title,
    active: S.doc?.path === tk.path,
    path: tk.path,
    onClick: () => actions.open(tk.path),
  });
  li.firstChild.title = `${tk.title} — ${shortState(st)} · Status: ${tk.statusRaw}`;
  return li;
}

function featureGroup(f) {
  const isOpen = S.doc?.feature?.slug === f.slug;
  const total = (f.tickets || []).length;
  const head = el("button", {
    type: "button",
    class: "feature-row",
    "aria-expanded": String(isOpen),
    title: `${f.title} — ${tallyText(f)}`,
    onclick: () => (f.specPath ? actions.open(f.specPath) : actions.loadEntry(null)),
  }, [
    folderIcon(),
    el("span", { class: "feature-title" }, [f.title, el("span", { class: "feature-slash" }, ["/"])]),
    el("span", { class: "feature-count", title: tallyText(f) }, [total ? `${f.progress.done}/${total}` : "—"]),
  ]);
  const kids = [head];
  if (total) kids.push(progressLine(f, "progress-rail"));
  if (isOpen) {
    const list = [];
    if (f.specPath) {
      list.push(row({
        cls: "row-spec",
        lead: el("span", { class: "row-lead" }, [el("span", { class: "row-n" }, ["spec"])]),
        label: "Overview",
        active: S.doc?.kind === "spec",
        path: f.specPath,
        onClick: () => actions.open(f.specPath),
      }));
    }
    for (const tk of f.tickets || []) list.push(ticketRow(f, tk));
    kids.push(el("ul", { class: "tree doc-tree feature-docs" }, list));
  }
  return el("li", { class: `feature${isOpen ? " is-open" : ""}` }, kids);
}

// Keep the feature/ticket view, but put it under a `features/` tree root so
// the rail reads like the rest of the filesystem.
function featureRoot(features, path = "features") {
  if (!(features || []).length) return null;
  const count = features.reduce((n, f) => n + (f.specPath ? 1 : 0) + (f.tickets || []).length, 0);
  const open = !closedDocs.has(path);
  const details = el("details", {
    class: `doc-details${onDocsPath({ path }) ? " is-branch" : ""}`,
    open: open ? "" : null,
  }, [
    el("summary", {
      class: "doc-folder-name",
      title: `${path} — ${plural(count, "document")}, collapse or expand`,
    }, [
      folderIcon(),
      el("span", { class: "doc-folder-label" }, [path]),
      el("span", { class: "doc-count" }, [String(count)]),
    ]),
    el("ul", { class: "features doc-tree feature-list" }, features.map(featureGroup)),
  ]);
  details.addEventListener("toggle", () => {
    if (details.open) closedDocs.delete(path);
    else closedDocs.add(path);
  });
  return el("ul", { class: "tree doc-tree feature-tree" }, [el("li", { class: "doc-folder" }, [details])]);
}

// Folders are open by default. A collapsed folder is remembered for the life
// of the page, but navigating into a nested document reopens its whole branch.
const closedDocs = new Set();
let lastDocsActive = null;

function docsParents(path) {
  const parts = String(path || "").split("/").slice(0, -1).filter(Boolean);
  const out = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    out.push(current);
  }
  return out;
}

function revealDocsBranch(path) {
  if (!path || path === lastDocsActive) return;
  lastDocsActive = path;
  closedDocs.delete(""); // the library root is an ancestor of every document
  for (const parent of docsParents(path)) closedDocs.delete(parent);
}

function docsCount(node) {
  if (node.type === "file") return 1;
  return (node.children || []).reduce((n, c) => n + docsCount(c), 0);
}

function onDocsPath(node) {
  const p = S.doc?.path;
  if (!p) return false;
  if (node.path === "") return true; // the library root
  return p === node.path || p.startsWith(`${node.path}/`);
}

// The Overview tree: root files first, then every top-level folder. Other
// tabs show their own section root instead, the way an IDE opens a subfolder.
function docsRoot() {
  const sections = docsSections();
  const children = [];
  for (const section of sections) {
    if (section.kind !== "overview") continue;
    children.push(...(section.tree || []));
    break;
  }
  for (const section of sections) {
    if (section.kind === "overview" || !section.path) continue;
    const kids = section.tree || [];
    if (!kids.length) continue;
    children.push({
      type: "dir",
      name: section.path,
      title: section.path,
      path: section.path,
      count: kids.reduce((n, child) => n + docsCount(child), 0),
      children: kids,
    });
  }
  if (!children.length) return null;
  return {
    type: "dir",
    name: S.tree?.name || "Documents",
    title: S.tree?.name || "Documents",
    path: "",
    count: children.reduce((n, child) => n + docsCount(child), 0),
    children,
  };
}

function sectionRoot(section) {
  const children = section?.tree || [];
  if (!children.length || !section?.path) return null;
  return {
    type: "dir",
    name: section.path,
    title: section.path,
    path: section.path,
    count: children.reduce((n, child) => n + docsCount(child), 0),
    children,
  };
}

function findDirNode(nodes, path) {
  for (const node of nodes || []) {
    if (node.type !== "dir") continue;
    if (node.path === path) return node;
    const hit = findDirNode(node.children, path);
    if (hit) return hit;
  }
  return null;
}

function dirRoot(path, fallbackChildren = []) {
  const node = findDirNode(S.tree?.files?.children, path);
  const children = node?.children || fallbackChildren;
  if (!children.length) return null;
  return {
    type: "dir",
    name: path.split("/").pop(),
    title: path.split("/").pop(),
    path,
    count: children.reduce((n, child) => n + docsCount(child), 0),
    children,
  };
}

const openDoc = (path) => actions.open(path);

// Hairline connectors join each folder to its children. The child that leads
// to the open document, and the siblings the line passes on the way, turn clay.
function docsList(nodes, openPath = openDoc) {
  const lead = nodes.findIndex(onDocsPath);
  return el("ul", { class: "tree doc-tree" }, nodes.map((child, i) => {
    const li = docsNode(child, openPath);
    if (i === lead) li.classList.add("on-path");
    else if (i < lead) li.classList.add("through-path");
    return li;
  }));
}

function folderIcon() {
  return svgEl("svg", {
    class: "doc-icon",
    viewBox: "0 0 16 16",
    width: "15",
    height: "15",
    "aria-hidden": "true",
    focusable: "false",
  }, [svgEl("path", {
    d: "M1.75 4.25c0-.7.55-1.25 1.25-1.25h3.1l1.5 1.6h5.4c.7 0 1.25.55 1.25 1.25v6.4c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.3",
    "stroke-linejoin": "round",
  })]);
}

function docsNode(node, openPath = openDoc) {
  if (node.type === "dir") {
    const open = !closedDocs.has(node.path);
    const count = docsCount(node);
    const details = el("details", {
      class: `doc-details${onDocsPath(node) ? " is-branch" : ""}`,
      open: open ? "" : null,
    }, [
      el("summary", {
        class: "doc-folder-name",
        title: `${node.title || node.name} — ${plural(count, "document")}, collapse or expand`,
      }, [
        folderIcon(),
        el("span", { class: "doc-folder-label" }, [node.title || node.name]),
        el("span", { class: "doc-count" }, [String(count)]),
      ]),
      docsList(node.children || [], openPath),
    ]);
    details.addEventListener("toggle", () => {
      if (details.open) closedDocs.delete(node.path);
      else closedDocs.add(node.path);
    });
    return el("li", { class: "doc-folder" }, [details]);
  }
  return row({
    cls: "row-doc",
    label: node.title || node.name,
    title: `${node.title || node.name} — ${node.path}`,
    active: S.doc?.path === node.path,
    path: node.path,
    onClick: () => openPath(node.path),
  });
}

function renderDocsRail() {
  const section = docsSection(S.tab) || docsSections()[0] || null;
  railLabel.textContent = section?.title || "Documents";
  railBody.textContent = "";
  revealDocsBranch(S.doc?.path);
  let list;
  if (section?.kind === "features") {
    list = featureRoot(section.features, section.path || "features");
    if (!list) list = el("p", { class: "empty" }, ["No features in this section."]);
  } else {
    const root = section?.kind === "overview" ? docsRoot() : sectionRoot(section);
    list = root
      ? el("ul", { class: "tree doc-tree" }, [docsNode(root)])
      : el("p", { class: "empty" }, ["No Markdown documents in this section."]);
  }
  railBody.append(el("nav", { class: "rail-block", "aria-label": section?.title || "Documents" }, [list]));
  const diag = diagnosticBlock();
  if (diag) railBody.append(diag);
  requestAnimationFrame(revealActive);
}

function docList() {
  const t = S.tree || {};
  if (S.tab === "context") {
    if (!t.context?.exists) return null;
    return el("ul", { class: "tree" }, [row({
      label: "Glossary",
      sub: "CONTEXT.md",
      active: S.doc?.path === t.context.path,
      path: t.context.path,
      onClick: () => actions.open(t.context.path),
    })]);
  }
  if (S.tab === "architecture") {
    const parts = [];
    if (t.graph) {
      const symbols = t.graph.symbols ?? 0;
      const edges = t.graph.edges ?? 0;
      parts.push(el("ul", { class: "tree cg-entry" }, [row({
        cls: "row-graph",
        lead: el("span", { class: "row-lead" }, [el("span", { class: "row-n" }, ["graph"])]),
        label: "Code graph",
        sub: `${symbols} · ${edges}`,
        active: S.doc?.kind === "codegraph",
        path: CODE_GRAPH_PATH,
        title: `Code graph — ${symbols} symbols, ${edges} edges`,
        onClick: () => actions.open(CODE_GRAPH_PATH),
      })]));
    }
    const fallback = (t.architecture || []).map((r) => ({
      type: "file",
      name: r.path.split("/").pop(),
      path: r.path,
      title: r.title,
    }));
    const root = dirRoot("architecture", fallback);
    if (root) parts.push(el("ul", { class: "tree doc-tree" }, [docsNode(root)]));
    return parts.length ? el("div", { class: "arch-rail" }, parts) : null;
  }
  return featureRoot(t.features, "features");
}


function emptyListHint() {
  if (S.tab === "overview") {
    return el("p", { class: "empty" }, ["No Markdown files in this workspace yet."]);
  }
  if (S.tab === "context") {
    return el("p", { class: "empty" }, ["No glossary yet. Run ", cmd("/setup-desk"), " to create ", cmd("CONTEXT.md"), "."]);
  }
  if (S.tab === "architecture") {
    return el("p", { class: "empty" }, ["No records yet. Run ", cmd("/setup-desk"), " to create them, or ", cmd("/update-arch"), " after a change."]);
  }
  return el("p", { class: "empty" }, ["No features yet. Run ", cmd("/to-spec"), " to write a spec, then ", cmd("/to-tickets"), " to split it into tickets."]);
}

function diagnostics() {
  const ds = [...(S.tree?.diagnostics || [])];
  if (S.mdError && S.doc) {
    ds.unshift({ severity: "error", path: S.doc.path, message: `could not render markdown: ${S.mdError}` });
  }
  return ds;
}

function diagnosticBlock() {
  const ds = diagnostics();
  if (!ds.length) return null;
  const errors = ds.filter((d) => d.severity === "error").length;
  const warns = ds.length - errors;
  const summary = [errors ? plural(errors, "error") : null, warns ? plural(warns, "warning") : null].filter(Boolean).join(", ");
  return el("details", { class: "diagnostics", open: errors ? "" : null, "data-worst": errors ? "error" : "warn" }, [
    el("summary", {}, [
      el("span", { class: "diag-title" }, [docsMode() ? "Docs check" : "Workspace check"]),
      el("span", { class: "diag-count" }, [summary]),
    ]),
    el("ul", {}, ds.map((d) => {
      const target = entryForPath(d.path);
      return el("li", { "data-severity": d.severity || "warn" }, [
        el("span", { class: "severity" }, [d.severity === "error" ? "Error" : "Warning"]),
        el("span", { class: "diag-msg" }, [d.message.charAt(0).toUpperCase() + d.message.slice(1)]),
        target
          ? el("button", { type: "button", class: "where", onclick: () => actions.loadEntry(target) }, [d.path])
          : el("span", { class: "where" }, [d.path]),
      ]);
    })),
    el("p", { class: "diag-hint" }, [
      "Fix the file and this updates by itself. ",
      cmd(docsMode() ? "desk check --docs <dir>" : "desk check"),
      " prints the same list.",
    ]),
  ]);
}

function revealActive() {
  if (getComputedStyle(rail).overflowY !== "auto") return; // single column: rail does not scroll
  const all = rail.querySelectorAll('button[aria-current="true"]');
  const b = all[all.length - 1];
  if (!b) return;
  const rr = rail.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  if (br.top < rr.top + 8 || br.bottom > rr.bottom - 8) {
    b.scrollIntoView({ block: "nearest" });
  }
}

function renderRail() {
  if (docsMode()) return renderDocsRail();
  const label = S.tab === "overview"
    ? "Overview"
    : S.tab === "context" ? "Context" : S.tab === "architecture" ? "Architecture" : "Features";
  railLabel.textContent = label;
  railBody.textContent = "";
  revealDocsBranch(S.doc?.path);
  let list;
  if (S.tab === "overview") {
    const root = S.tree?.files;
    list = root?.children?.length
      ? el("ul", { class: "tree doc-tree" }, [docsNode(root, (path) => actions.open(path, { tab: "overview" }))])
      : null;
  } else {
    list = docList();
  }
  railBody.append(el("nav", { class: "rail-block", "aria-label": label }, [
    list || emptyListHint(),
  ]));
  const diag = diagnosticBlock();
  if (diag) railBody.append(diag);
  requestAnimationFrame(revealActive);
}

export { renderRail };
