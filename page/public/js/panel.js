/* The resizable graph panel and navigation rail.
 *
 * The graph sits above the document, split like an IDE editor and terminal.
 * Opening a ticket swaps the document only; the graph keeps its layout and
 * scroll, and simply marks the node you are reading. */

import { narrow } from "./state.js";
import { clamp } from "./graph-layout.js";
import { actions } from "./actions.js";
import {
  graphPanel, panelSplit, panelToggle, railSplit, viewport, work,
} from "./refs.js";

const PANEL_KEY = "desk.panel";

function readPanel() {
  try { return JSON.parse(localStorage.getItem(PANEL_KEY) || "{}"); } catch { return {}; }
}

function writePanel(patch) {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify({ ...readPanel(), ...patch })); } catch { /* private mode */ }
}

const panelCollapsed = () => work.dataset.collapsed === "true";

function applyPanelChrome() {
  const off = work.dataset.panel === "off";
  panelToggle.hidden = off;
  panelSplit.hidden = off || panelCollapsed();
  panelToggle.textContent = panelCollapsed() ? "Show" : "Hide";
  panelToggle.setAttribute("aria-expanded", String(!panelCollapsed()));
}

let reflowTimer = null;

function reflowGraph() {
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(() => {
    if (work.dataset.panel === "on") actions.renderGraph(true);
  }, 90);
}

function setPanelHeight(h) {
  const max = Math.max(160, work.clientHeight - 44);
  const px = Math.round(clamp(h, 120, max));
  work.style.setProperty("--panel-h", `${px}px`);
  panelSplit.setAttribute("aria-valuenow", String(px));
  writePanel({ h: px });
  reflowGraph();
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
  const saved = readPanel();
  if (Number.isFinite(saved.h)) {
    const max = Math.max(160, work.clientHeight - 44);
    const h = Math.round(narrow() ? saved.h : clamp(saved.h, 120, max));
    work.style.setProperty("--panel-h", `${h}px`);
    panelSplit.setAttribute("aria-valuenow", String(h));
  }
  if (saved.collapsed) work.dataset.collapsed = "true";
  applyPanelChrome();

  panelToggle.addEventListener("click", () => {
    const next = !panelCollapsed();
    work.dataset.collapsed = String(next);
    writePanel({ collapsed: next });
    applyPanelChrome();
    if (!next) actions.renderGraph(true);
  });

  let drag = null;
  panelSplit.addEventListener("pointerdown", (ev) => {
    if (panelCollapsed()) return;
    drag = ev.pointerId;
    panelSplit.setPointerCapture(ev.pointerId);
    panelSplit.classList.add("is-active");
    document.body.classList.add("is-resizing");
    ev.preventDefault();
  });
  panelSplit.addEventListener("pointermove", (ev) => {
    if (drag !== ev.pointerId) return;
    setPanelHeight(ev.clientY - work.getBoundingClientRect().top);
  });
  const end = (ev) => {
    if (drag !== ev.pointerId) return;
    drag = null;
    panelSplit.classList.remove("is-active");
    document.body.classList.remove("is-resizing");
    reflowGraph();
  };
  panelSplit.addEventListener("pointerup", end);
  panelSplit.addEventListener("pointercancel", end);
  panelSplit.addEventListener("dblclick", () => setPanelHeight(Math.round(window.innerHeight * 0.48)));
  panelSplit.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    const h = graphPanel.getBoundingClientRect().height || 380;
    setPanelHeight(h + (ev.key === "ArrowDown" ? 24 : -24));
  });

  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!narrow()) {
        const h = parseFloat(work.style.getPropertyValue("--panel-h"));
        if (h > work.clientHeight - 44) setPanelHeight(work.clientHeight - 44);
      }
      applyPanelChrome();
      if (work.dataset.panel === "on") actions.renderGraph(true);
    }, 180);
  });
}

export { applyPanelChrome, initPanel, initRailSplit };
