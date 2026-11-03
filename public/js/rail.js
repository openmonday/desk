/* The left rail: features, tickets, and workspace diagnostics. */

import {
  S, entryForPath, featureIndex, key, num, plural, shortState, tallyText,
} from "./state.js";
import { cmd, el, glyph, progressLine } from "./dom.js";
import { actions } from "./actions.js";
import { rail, railBody, railLabel } from "./refs.js";

function row({ label, lead, sub, active, path, onClick, cls = "" }) {
  const b = el("button", {
    type: "button",
    class: `row ${cls}`.trim(),
    "aria-current": active ? "true" : "false",
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
      el("span", { class: "diag-title" }, ["Workspace check"]),
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
    el("p", { class: "diag-hint" }, ["Fix the file and this updates by itself. ", cmd("desk check"), " prints the same list."]),
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
