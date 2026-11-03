/* In-page fullscreen for the rail, graph, and article views.
 *
 * This expands a panel inside the page (hiding the top bar and the other views)
 * instead of asking the operating system for native fullscreen. Esc always
 * exits. */
import { el, svgEl } from "./dom.js";

const EDGES = {
  enter: [
    "M6 2H2v4",
    "M10 2h4v4",
    "M14 10v4h-4",
    "M2 10v4h4",
  ],
  exit: [
    "M2 6h4V2",
    "M14 6h-4V2",
    "M2 10h4v4",
    "M14 10h-4v4",
  ],
};

const buttons = new Map();
let mode = null;
let savedScroll = 0;
let listening = false;

function icon(active) {
  return svgEl("svg", {
    viewBox: "0 0 16 16",
    width: "14",
    height: "14",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  }, EDGES[active ? "exit" : "enter"].map((d) => svgEl("path", { d })));
}

function sync() {
  for (const [button, { target, label }] of buttons) {
    const on = mode === target;
    button.replaceChildren(icon(on));
    button.setAttribute("aria-pressed", String(on));
    const text = `${on ? "Exit fullscreen" : "Fullscreen"} ${label}`;
    button.title = text;
    button.setAttribute("aria-label", text);
  }
}

function setMode(next) {
  if (next && !mode) savedScroll = window.scrollY;
  mode = next;
  if (next) {
    document.body.dataset.fullscreen = next;
    window.scrollTo(0, 0);
  } else {
    delete document.body.dataset.fullscreen;
    window.scrollTo(0, savedScroll);
    savedScroll = 0;
  }
  sync();
  // The active view changed size; let its layout re-measure.
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

export function fullscreenButton(target, label) {
  const button = el("button", {
    type: "button",
    class: "icon-btn",
    "aria-pressed": "false",
    "aria-label": `Fullscreen ${label}`,
    title: `Fullscreen ${label}`,
  }, [icon(false)]);
  button.addEventListener("click", () => setMode(mode === target ? null : target));
  buttons.set(button, { target, label });
  return button;
}

/** Leave fullscreen unless the view being opened is the one already expanded. */
export function exitFullscreenExcept(keep) {
  if (mode && mode !== keep) setMode(null);
}

/** A new document starts at its own top; do not restore the old page offset. */
export function noteNavigation() {
  if (mode) savedScroll = window.scrollY;
}

export function initFullscreen() {
  if (listening) return;
  listening = true;
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !mode) return;
    ev.preventDefault();
    setMode(null);
  });
  sync();
}
