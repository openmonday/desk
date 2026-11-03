/* desk page client entry.
 *
 * The UI is split into focused modules under `js/`. This file wires the shared
 * action registry and starts the page; all reads and writes still go through the
 * same API and hash routes as before. */
import { actions } from "./js/actions.js";
import { S } from "./js/state.js";
import { connectEvents, scheduleRefresh } from "./js/live.js";
import { defaultEntry, entryForTab, readHash, writeHash, writeTabHash } from "./js/hash.js";
import { loadEntry, open } from "./js/navigation.js";
import { refreshTree } from "./js/data.js";
import { render, renderTabs } from "./js/render.js";
import { renderRail } from "./js/rail.js";
import { renderGraph } from "./js/graph.js";
import { initPanel, initRailSplit, showArticle } from "./js/panel.js";
import { initTheme } from "./js/theme.js";

Object.assign(actions, {
  open,
  loadEntry,
  render,
  renderRail,
  renderGraph,
  refreshTree,
  scheduleRefresh,
  showArticle,
});

function bindTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", async () => {
      S.tab = b.dataset.tab;
      const loc = readHash();
      const preferred = loc?.entry?.feature?.slug;
      let entry = loc && loc.tab === S.tab ? loc.entry : null;
      if (!entry) entry = entryForTab(S.tab, preferred);
      await loadEntry(entry, { silent: true });
      writeHash(entry);
    });
  });
}

async function boot() {
  bindTabs();
  initPanel();
  initRailSplit();
  try { await document.fonts?.ready; } catch { /* measure with fallbacks */ }
  await refreshTree();
  const loc = readHash();
  if (loc) S.tab = loc.tab;
  else if (!(S.tree?.features || []).some((f) => f.specPath) && (S.tree?.architecture || []).length) S.tab = "architecture";
  else if (!(S.tree?.features || []).length && !(S.tree?.architecture || []).length && !S.tree?.context?.exists) S.tab = "features";
  const entry = loc ? (loc.entry || entryForTab(loc.tab)) : defaultEntry();
  await loadEntry(entry, { silent: true });
  if (entry) writeHash(entry);
  else {
    render();
    writeTabHash(S.tab);
  }
  connectEvents();
}

window.addEventListener("hashchange", async () => {
  const loc = readHash();
  if (!loc) return;
  S.tab = loc.tab;
  await loadEntry(loc.entry || entryForTab(loc.tab), { silent: true });
  renderTabs();
});

initTheme();
boot();
