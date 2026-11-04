/* Live status, toasts, SSE-driven refreshes, and scroll-preserving reloads. */

import { S, entryForPath, treeSignature } from "./state.js";
import { defaultEntry, readHash } from "./hash.js";
import { el } from "./dom.js";
import { actions } from "./actions.js";
import { live } from "./refs.js";

function setLive(state) {
  live.dataset.state = state;
  const target = S.tree?.mode === "docs" ? "docs" : ".desk";
  live.title = state === "up"
    ? `Live: watching ${target}. Changes made by you or an agent appear here on their own.`
    : state === "stale"
      ? "Reconnecting to the local desk server."
      : "Offline: the local desk server is not reachable. Restart it with node src/serve.mjs.";
  const label = live.querySelector("span");
  if (label) label.textContent = state === "up" ? "Live" : state === "stale" ? "Reconnecting" : "Offline";
}

let flashTimer = null;
function flashLive() {
  live.classList.remove("is-tick");
  void live.offsetWidth; // restart the animation
  live.classList.add("is-tick");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => live.classList.remove("is-tick"), 1400);
}

let toastTimer = null;
function toast(text) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = el("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(node);
  }
  node.textContent = text;
  node.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-on"), 3200);
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const before = treeSignature(S.tree);
    if (!(await actions.refreshTree())) return;
    const changed = before !== treeSignature(S.tree);

    if (!S.doc) {
      const entry = readHash()?.entry || defaultEntry();
      if (entry) await actions.loadEntry(entry, { silent: true });
      else await actions.render();
      return;
    }
    const entry = entryForPath(S.doc.path);
    if (!entry) {
      // The open file disappeared: show the section default and replace the
      // stale hash so a reload does not land on a missing document.
      await actions.loadEntry(defaultEntry(), { silent: false });
      return;
    }
    await actions.loadEntry(entry, { silent: true, keepScroll: true, force: changed || S.justDone.size > 0 });
    if (changed) actions.renderRail();
  }, 120);
}

function connectEvents() {
  const es = new EventSource("/api/events");
  es.onopen = () => setLive("up");
  es.onerror = () => setLive("stale");
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "change") {
        flashLive();
        scheduleRefresh();
      }
    } catch { /* ignore malformed events */ }
  };
}

export { setLive, toast, scheduleRefresh, connectEvents };
