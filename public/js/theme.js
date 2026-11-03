/* Theme modes: auto (follow the operating system), light, and dark.
 *
 * The head script applies the saved mode before CSS paints. This module keeps
 * the page in sync with live system changes, the button, and other tabs. */

import { themeToggle } from "./refs.js";

const KEY = "desk.theme";
const MODES = new Set(["system", "light", "dark"]);
const root = document.documentElement;
const media = window.matchMedia?.("(prefers-color-scheme: dark)") || null;

let mode = "system";

const systemTheme = () => (media?.matches ? "dark" : "light");
const resolve = (m) => (m === "system" ? systemTheme() : m);

function storedMode() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/* From auto, flip to the opposite of the system theme; then show the explicit
 * matching theme; then return to auto. Every early click visibly changes the
 * page, and all three modes are reachable from either system setting. */
function nextMode() {
  const system = systemTheme();
  const opposite = system === "dark" ? "light" : "dark";
  if (mode === "system") return opposite;
  if (mode === opposite) return system;
  return "system";
}

function label() {
  const theme = root.dataset.theme === "dark" ? "dark" : "light";
  const next = nextMode();
  const target = next === "system" ? "auto (follow system)" : next;
  const current = mode === "system" ? `auto — currently ${theme}` : mode;
  return `Theme: ${current}. Switch to ${target}.`;
}

function apply(next, { persist = true } = {}) {
  mode = MODES.has(next) ? next : "system";
  const theme = resolve(mode);

  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  root.style.colorScheme = theme;

  // Keep in sync with --paper in styles/base.css.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#1b1a17" : "#faf9f5";

  if (themeToggle) {
    themeToggle.dataset.mode = mode;
    const text = label();
    themeToggle.title = text;
    themeToggle.setAttribute("aria-label", text);
  }

  if (persist) {
    try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  }
}

function onSystemChange() {
  if (mode === "system") apply("system", { persist: false });
}

function initTheme() {
  const initial = root.dataset.themeMode || storedMode() || "system";
  apply(initial, { persist: false });

  themeToggle?.addEventListener("click", () => apply(nextMode()));

  if (media?.addEventListener) media.addEventListener("change", onSystemChange);
  else media?.addListener?.(onSystemChange);

  window.addEventListener("storage", (ev) => {
    if (ev.key === KEY || ev.key === null) apply(ev.newValue || "system", { persist: false });
  });
}

export { initTheme };
