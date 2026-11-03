/* The left rail: features, tickets, and workspace diagnostics. */

import {
  S, entryForPath, featureIndex, key, num, plural, shortState, tallyText,
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
  li.firstChild.title = `${shortState(st)} · Status: ${tk.statusRaw}`;
  return li;
}

function featureGroup(f) {
  const isOpen = S.doc?.feature?.slug === f.slug;
  const total = (f.tickets || []).length;
  const head = el("button", {
    type: "button",
    class: "feature-row",
    "aria-expanded": String(isOpen),
    onclick: () => (f.specPath ? actions.open(f.specPath) : actions.loadEntry(null)),
  }, [
    el("span", { class: "feature-title" }, [f.title]),
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
    kids.push(el("ul", { class: "tree" }, list));
  }
  return el("li", { class: `feature${isOpen ? " is-open" : ""}` }, kids);
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
  for (const parent of docsParents(path)) closedDocs.delete(parent);
}

function docsNode(node, depth = 0) {
  const indent = 10 + depth * 14;
  if (node.type === "dir") {
    const open = !closedDocs.has(node.path);
    const branch = Boolean(S.doc?.path?.startsWith(`${node.path}/`));
    const details = el("details", {
      class: `doc-details${branch ? " is-branch" : ""}`,
      open: open ? "" : null,
    }, [
      el("summary", {
        class: "doc-folder-name",
        title: `${node.title || node.name} — collapse or expand`,
        style: `padding-left:${indent}px`,
      }, [
        el("span", { class: "doc-folder-label" }, [node.title || node.name]),
        el("span", { class: "doc-folder-count" }, [String(node.count || 0)]),
        svgEl("svg", {
          class: "doc-chevron",
          viewBox: "0 0 16 16",
          width: "12",
          height: "12",
          "aria-hidden": "true",
          focusable: "false",
        }, [svgEl("path", {
          d: "M6 3.5 10.5 8 6 12.5",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "1.6",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        })]),
      ]),
      el("ul", { class: "tree doc-tree" }, (node.children || []).map((child) => docsNode(child, depth + 1))),
    ]);
    details.addEventListener("toggle", () => {
      if (details.open) closedDocs.delete(node.path);
      else closedDocs.add(node.path);
    });
    return el("li", { class: "doc-folder" }, [details]);
  }
  const li = row({
    cls: "row-doc",
    label: node.title || node.name,
    title: `${node.title || node.name} — ${node.path}`,
    active: S.doc?.path === node.path,
    path: node.path,
    onClick: () => actions.open(node.path),
  });
  li.firstChild.style.paddingLeft = `${indent}px`;
  return li;
}

function renderDocsRail() {
  const section = docsSection(S.tab) || docsSections()[0] || null;
  railLabel.textContent = section?.kind === "features" ? section.title : "Tree";
  railBody.textContent = "";
  let list;
  if (section?.kind === "features") {
    list = el("ul", { class: "features" }, (section.features || []).map(featureGroup));
    if (!list.children.length) list = el("p", { class: "empty" }, ["No features in this section."]);
  } else {
    revealDocsBranch(S.doc?.path);
    list = section?.tree?.length
      ? el("ul", { class: "tree doc-tree" }, section.tree.map((node) => docsNode(node)))
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
    if (!(t.architecture || []).length) return null;
    return el("ul", { class: "tree" }, t.architecture.map((r) => row({
      label: r.title,
      active: S.doc?.path === r.path,
      path: r.path,
      onClick: () => actions.open(r.path),
    })));
  }
  if (!(t.features || []).length) return null;
  return el("ul", { class: "features" }, t.features.map(featureGroup));
}


function emptyListHint() {
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
  const label = S.tab === "context" ? "Context" : S.tab === "architecture" ? "Architecture" : "Features";
  railLabel.textContent = label;
  railBody.textContent = "";
  const list = docList();
  railBody.append(el("nav", { class: "rail-block", "aria-label": label }, [
    list || emptyListHint(),
  ]));
  const diag = diagnosticBlock();
  if (diag) railBody.append(diag);
  requestAnimationFrame(revealActive);
}

export { renderRail };
