/* Ticket graph rendering, interaction, and the graph panel contents. */

import {
  S, featureIndex, num, shortState, KIND_LABEL,
} from "./state.js";
import { cmd, el, glyph, svgEl } from "./dom.js";
import { actions } from "./actions.js";
import { articlePanel, graphBody, graphPanel, work } from "./refs.js";
import { applyPanelChrome } from "./panel.js";
import { layoutGraph } from "./graph-layout.js";

function graphNode(f, it, L) {
  const t = it.t;
  const st = featureIndex(f).states.get(it.id);
  const done = S.justDone.has(t.path);
  const deps = featureIndex(f).dependents.get(it.id) || [];
  const spoken = [
    `${num(t.n)}: ${t.title}.`,
    shortState(st) + ".",
    t.blockedBy.length ? `After ${t.blockedBy.join(", ")}.` : "No blockers.",
    deps.length ? `Unblocks ${deps.map((d) => num(d.n)).join(", ")}.` : "",
  ].join(" ");
  return el("button", {
    type: "button",
    class: `node${S.doc?.path === t.path ? " is-active" : ""}${done ? " just-done" : ""}`,
    "data-status": t.status,
    "data-kind": st.kind,
    "data-key": it.id,
    "data-path": t.path,
    "data-layer": String(it.layer),
    style: `left:${L.colX[it.layer]}px;top:${it.y - it.h / 2}px;width:${L.colW[it.layer]}px;height:${it.h}px`,
    title: t.title,
    "aria-label": spoken,
    onclick: () => actions.open(t.path),
  }, [
    el("span", { class: "node-top" }, [
      el("span", { class: `node-glyph${done ? " node-check" : ""}` }, [glyph(st.kind, 14)]),
      el("span", { class: "node-n" }, [num(t.n)]),
      el("span", { class: "node-state" }, [st.kind === "waiting" && st.open.length === 1 ? shortState(st) : KIND_LABEL[st.kind]]),
    ]),
    el("span", { class: "node-title" }, [t.title]),
  ]);
}

function graphSvg(L) {
  const svg = svgEl("svg", {
    width: L.Wtot, height: L.H, viewBox: `0 0 ${L.Wtot} ${L.H}`, "aria-hidden": "true",
  });
  const defs = svgEl("defs");
  for (const id of ["arrow-open", "arrow-done", "arrow-lit"]) {
    defs.append(svgEl("marker", {
      id, class: id, viewBox: "0 0 8 8", refX: "7.5", refY: "4",
      markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse", orient: "auto",
    }, [svgEl("path", { d: "M0,0.6 L7.5,4 L0,7.4 Z" })]));
  }
  svg.append(defs);
  // Satisfied edges first so open ones draw on top.
  const sorted = [...L.edges].sort((a, b) => Number(b.done) - Number(a.done));
  for (const e of sorted) {
    svg.append(svgEl("path", {
      class: "edge",
      "data-from": e.from,
      "data-to": e.to,
      "data-state": e.done ? "done" : "open",
      d: e.d,
      "marker-end": `url(#${e.done ? "arrow-done" : "arrow-open"})`,
    }));
  }
  for (const e of L.edges) {
    if (!e.label) continue;
    svg.append(svgEl("text", {
      class: "edge-label", x: e.label.x, y: e.label.y, "text-anchor": "middle",
    }, [document.createTextNode(e.label.text)]));
  }
  return svg;
}

function lightEdges(canvas, k) {
  canvas.classList.toggle("is-tracing", Boolean(k));
  canvas.querySelectorAll(".edge").forEach((p) => {
    const lit = Boolean(k) && (p.dataset.from === k || p.dataset.to === k);
    p.classList.toggle("is-lit", lit);
    p.setAttribute("marker-end", `url(#${lit ? "arrow-lit" : p.dataset.state === "done" ? "arrow-done" : "arrow-open"})`);
  });
  canvas.querySelectorAll(".node").forEach((n) => {
    const near = k && (n.dataset.key === k || canvas.querySelector(`.edge.is-lit[data-from="${n.dataset.key}"], .edge.is-lit[data-to="${n.dataset.key}"]`));
    n.classList.toggle("is-near", Boolean(near));
  });
}

// Arrow keys walk the graph: ←/→ follow dependencies, ↑/↓ move within a column.
function graphKeys(ev, L) {
  const node = ev.target.closest?.(".node");
  if (!node) return;
  const it = L.items.get(node.dataset.key);
  const nodesIn = (layer) => (L.layers[layer] || []).filter((x) => !x.dummy);
  const nearest = (list) => list.filter(Boolean).sort((a, b) => Math.abs(a.y - it.y) - Math.abs(b.y - it.y))[0];
  let next = null;
  if (ev.key === "ArrowRight") next = nearest(L.edges.filter((e) => e.from === it.id).map((e) => L.items.get(e.to)));
  else if (ev.key === "ArrowLeft") next = nearest(L.edges.filter((e) => e.to === it.id).map((e) => L.items.get(e.from)));
  else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    const col = nodesIn(it.layer);
    next = col[col.indexOf(it) + (ev.key === "ArrowDown" ? 1 : -1)];
  } else return;
  ev.preventDefault();
  if (next) node.parentElement.querySelector(`.node[data-key="${next.id}"]`)?.focus();
}

// Phone: the same graph as an ordered list, indented by column.
function graphList(f, L) {
  const { states } = featureIndex(f);
  const items = L.layers.flatMap((l) => l.filter((it) => !it.dummy));
  return el("ol", { class: "graph-list" }, items.map((it) => {
    const t = it.t;
    const st = states.get(it.id);
    const after = t.blockedBy.length && st.kind !== "waiting" ? ` · after ${t.blockedBy.map((b) => num(b)).join(", ")}` : "";
    return el("li", { style: `--depth:${Math.min(it.layer, 4)}` }, [
      el("button", {
        type: "button",
        class: `list-node${S.justDone.has(t.path) ? " just-done" : ""}`,
        "data-kind": st.kind,
        "data-key": it.id,
        "data-path": t.path,
        onclick: () => actions.open(t.path),
      }, [
        el("span", { class: `node-glyph${S.justDone.has(t.path) ? " node-check" : ""}` }, [glyph(st.kind, 14)]),
        el("span", { class: "list-body" }, [
          el("span", { class: "list-title" }, [el("span", { class: "node-n" }, [num(t.n)]), " ", t.title]),
          el("span", { class: "list-sub" }, [shortState(st) + after]),
        ]),
      ]),
    ]);
  }));
}

function graphBlock(feature) {
  const tickets = feature.tickets || [];
  if (!tickets.length) {
    graphPanel.dataset.overflow = "false";
    graphPanel.dataset.atEnd = "true";
    return el("div", { class: "graph graph-empty" }, [
      el("p", {}, [
        "No tickets yet. Run ", cmd("/to-tickets"), ", or add one with ",
        cmd(`desk add ${feature.slug} --title "…"`), ".",
      ]),
    ]);
  }

  const cs = getComputedStyle(graphBody);
  const availW = Math.max(360, graphBody.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const availH = Math.max(220, graphBody.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 6);
  const L = layoutGraph(tickets, availW, availH);
  const canvas = el("div", { class: "graph-canvas", style: `width:${L.Wtot}px;height:${L.H}px` }, [
    graphSvg(L),
    ...L.layers.flatMap((l) => l.filter((it) => !it.dummy)).map((it) => graphNode(feature, it, L)),
  ]);
  canvas.style.marginLeft = `${Math.max(0, Math.round((availW - L.Wtot) / 2))}px`;
  canvas.style.marginTop = `${Math.max(0, Math.round((availH - L.H) / 2))}px`;

  const trace = (ev) => {
    const n = ev.target.closest?.(".node");
    lightEdges(canvas, n ? n.dataset.key : null);
  };
  canvas.addEventListener("mouseover", trace);
  canvas.addEventListener("focusin", trace);
  canvas.addEventListener("mouseleave", () => lightEdges(canvas, null));
  canvas.addEventListener("focusout", (ev) => { if (!canvas.contains(ev.relatedTarget)) lightEdges(canvas, null); });
  canvas.addEventListener("keydown", (ev) => graphKeys(ev, L));

  const scroll = el("div", { class: "graph-scroll", tabindex: "-1" }, [canvas]);

  const notes = [];
  if (L.back.length) {
    notes.push(el("span", { class: "graph-warn" }, [
      `Dependency cycle: ${L.back.map((e) => `${num(e.to)} → ${num(e.from)}`).join(", ")} is not drawn. See Workspace check.`,
    ]));
  }

  const block = el("div", { class: "graph", "aria-label": "Ticket dependency graph" }, [
    scroll,
    graphList(feature, L),
    ...(notes.length ? [el("p", { class: "graph-note" }, notes)] : []),
  ]);

  const measure = () => {
    const over = scroll.scrollWidth > scroll.clientWidth + 2;
    graphPanel.dataset.overflow = String(over);
    graphPanel.dataset.atEnd = String(scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 2);
  };
  scroll.addEventListener("scroll", measure, { passive: true });
  new ResizeObserver(measure).observe(scroll);
  return block;
}

/* ---------- graph panel ----------
 * The graph sits above the document, split like an IDE editor and terminal.
 * Opening a ticket swaps the document only; the graph keeps its layout and
 * scroll, and simply marks the node you are reading. */

function graphSignature(f) {
  return JSON.stringify([
    f.slug,
    f.tickets.map((t) => [t.n, t.title, t.status, t.blockedBy.join(","), S.justDone.has(t.path)]),
  ]);
}

function updateGraphActive() {
  const path = S.doc?.kind === "ticket" ? S.doc.path : null;
  graphBody.querySelectorAll(".node, .list-node").forEach((n) => {
    const on = Boolean(path) && n.dataset.path === path;
    n.classList.toggle("is-active", on);
    if (on) n.setAttribute("aria-current", "true");
    else n.removeAttribute("aria-current");
  });
}

function renderGraph(force = false) {
  const f = S.doc && (S.doc.kind === "spec" || S.doc.kind === "ticket") ? S.doc.feature : null;
  if (!f) {
    work.dataset.panel = "off";
    work.dataset.view = "article";
    graphPanel.hidden = true;
    articlePanel.hidden = false;
    S.graphSig = "";
    applyPanelChrome();
    return;
  }
  const wasOn = work.dataset.panel === "on";
  const graphView = work.dataset.view === "graph";
  work.dataset.panel = "on";
  graphPanel.hidden = !graphView;
  articlePanel.hidden = graphView;
  applyPanelChrome();
  if (!graphView) {
    S.graphSig = "";
    return;
  }

  const sig = graphSignature(f);
  if (!force && wasOn && sig === S.graphSig) {
    updateGraphActive();
    return;
  }
  S.graphSig = sig;
  const before = graphBody.querySelector(".graph-scroll");
  const left = before ? before.scrollLeft : 0;
  const top = graphBody.scrollTop;
  graphBody.replaceChildren(graphBlock(f));
  requestAnimationFrame(() => {
    const after = graphBody.querySelector(".graph-scroll");
    if (after) after.scrollLeft = left;
    graphBody.scrollTop = top;
  });
  updateGraphActive();
}

export { renderGraph, updateGraphActive };
