/* The work area's two views: task graph and article.
 *
 * Only one is visible at a time. The graph is opened from the rail; choosing
 * any document switches back to the article. The rail keeps its resize handle,
 * and every view has an in-page fullscreen button. */

import { S, narrow } from "./state.js";
import { el, svgEl } from "./dom.js";
import { clamp } from "./graph-layout.js";
import { actions } from "./actions.js";
import { writeHash, writeTabHash } from "./hash.js";
import {
  exitFullscreenExcept, fullscreenButton, initFullscreen,
} from "./fullscreen.js";
import {
  articlePanel, articleTools, graphPanel, graphTools, rail, railSplit,
  railTools, viewport, work,
} from "./refs.js";

let graphToggle = null;
let graphFs = null;

const graphView = () => work.dataset.view === "graph";

function applyPanelChrome() {
  const available = work.dataset.panel === "on";
  const onGraph = available && graphView();
  if (graphToggle) {
    graphToggle.hidden = !available;
    graphToggle.setAttribute("aria-pressed", String(onGraph));
    graphToggle.setAttribute("aria-expanded", String(onGraph));
    const text = onGraph ? "Show article" : "Show task graph";
    graphToggle.title = text;
    graphToggle.setAttribute("aria-label", text);
  }
  if (graphFs) graphFs.hidden = !onGraph;
}

function graphIcon() {
  return svgEl("svg", {
    viewBox: "0 0 16 16",
    width: "14",
    height: "14",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "aria-hidden": "true",
    focusable: "false",
  }, [
    svgEl("path", { d: "M7.3 4.6L4.1 10.6M8.7 4.6l3.2 6M4.9 12.2h6.2" }),
    svgEl("circle", { cx: "8", cy: "3.2", r: "1.7", fill: "currentColor", stroke: "none" }),
    svgEl("circle", { cx: "3.4", cy: "12.2", r: "1.7", fill: "currentColor", stroke: "none" }),
    svgEl("circle", { cx: "12.6", cy: "12.2", r: "1.7", fill: "currentColor", stroke: "none" }),
  ]);
}

function showArticle() {
  exitFullscreenExcept("article");
  work.dataset.view = "article";
  graphPanel.hidden = true;
  articlePanel.hidden = false;
  applyPanelChrome();
}

function showGraph() {
  if (work.dataset.panel !== "on") return;
  exitFullscreenExcept("graph");
  work.dataset.view = "graph";
  graphPanel.hidden = false;
  articlePanel.hidden = true;
  applyPanelChrome();
  actions.renderGraph(true);
}

function toggleGraphView() {
  if (graphView()) {
    showArticle();
    if (S.doc) writeHash(S.doc);
    return;
  }
  showGraph();
  if (S.tab === "issues") writeTabHash("issues");
}

function initTools() {
  if (graphToggle) return;
  graphToggle = el("button", {
    type: "button",
    class: "icon-btn",
    "aria-controls": "graph-panel",
    "aria-pressed": "false",
  }, [graphIcon()]);
  graphToggle.addEventListener("click", toggleGraphView);

  railTools.append(graphToggle, fullscreenButton("rail", "navigation"));
  graphFs = fullscreenButton("graph", "task graph");
  graphTools.append(graphFs);
  articleTools.append(fullscreenButton("article", "article"));
  initFullscreen();
}

let reflowTimer = null;

function reflowGraph() {
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(() => {
    if (work.dataset.panel === "on" && graphView()) actions.renderGraph(true);
  }, 90);
}

const RAIL_KEY = "desk.rail";

function railRange() {
  return [220, Math.min(560, Math.round(window.innerWidth * 0.45))];
}

function setRailWidth(w, persist = true) {
  const [lo, hi] = railRange();
  const px = Math.round(clamp(w, lo, hi));
  viewport.style.setProperty("--rail", `${px}px`);
  railSplit.setAttribute("aria-valuenow", String(px));
  if (persist) {
    try { localStorage.setItem(RAIL_KEY, String(px)); } catch { /* private mode */ }
  }
  reflowGraph();
}

function initRailSplit() {
  let saved = 0;
  try { saved = Number(localStorage.getItem(RAIL_KEY)) || 0; } catch { /* private mode */ }
  if (saved) {
    const [lo, hi] = railRange();
    const px = Math.round(clamp(saved, lo, hi));
    viewport.style.setProperty("--rail", `${px}px`);
    railSplit.setAttribute("aria-valuenow", String(px));
  }

  let drag = null;
  railSplit.addEventListener("pointerdown", (ev) => {
    drag = ev.pointerId;
    railSplit.setPointerCapture(ev.pointerId);
    railSplit.classList.add("is-active");
    document.body.classList.add("is-resizing-x");
    ev.preventDefault();
  });
  railSplit.addEventListener("pointermove", (ev) => {
    if (drag !== ev.pointerId) return;
    setRailWidth(ev.clientX - viewport.getBoundingClientRect().left);
  });
  const end = (ev) => {
    if (drag !== ev.pointerId) return;
    drag = null;
    railSplit.classList.remove("is-active");
    document.body.classList.remove("is-resizing-x");
    reflowGraph();
  };
  railSplit.addEventListener("pointerup", end);
  railSplit.addEventListener("pointercancel", end);
  railSplit.addEventListener("dblclick", () => setRailWidth(320));
  railSplit.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const now = parseFloat(getComputedStyle(viewport).getPropertyValue("--rail")) || 320;
    setRailWidth(now + (ev.key === "ArrowRight" ? 16 : -16));
  });
}

function initPanel() {
  initTools();
  work.dataset.view = "article";
  graphPanel.hidden = true;
  articlePanel.hidden = false;
  applyPanelChrome();

  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      applyPanelChrome();
      if (work.dataset.panel === "on" && graphView()) actions.renderGraph(true);
    }, 180);
  });
}

export {
  applyPanelChrome, initPanel, initRailSplit, showArticle, showGraph,
};
