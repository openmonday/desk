/* desk page client entry.
 *
 * The UI is split into focused modules under `js/`. This file wires the shared
 * action registry and starts the page; all reads go through the
 * same API and hash routes as before. */
import { actions } from "./js/actions.js";
import { S, defaultDocsEntry, docsMode, docsSections, configuredDefault, tabDefs } from "./js/state.js";
import { connectEvents, scheduleRefresh } from "./js/live.js";
import { defaultEntry, entryForTab, readHash, writeHash, writeTabHash } from "./js/hash.js";
import { loadEntry, open } from "./js/navigation.js";
import { refreshTree } from "./js/data.js";
import { render, renderTabs } from "./js/render.js";
import { renderRail } from "./js/rail.js";
import { renderGraph } from "./js/graph.js";
import { initPanel, initRailSplit, showArticle, showGraph } from "./js/panel.js";
import { initTheme } from "./js/theme.js";
import { tabs } from "./js/refs.js";

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
  tabs.addEventListener("click", async (ev) => {
    const b = ev.target.closest?.(".tab");
    if (!b || !tabs.contains(b)) return;
    S.tab = b.dataset.tab;
    const loc = readHash();
    const preferred = loc?.entry?.issue?.slug;
    const graphLanding = !docsMode() && S.tab === "issues";
    let entry = loc && loc.tab === S.tab && !graphLanding ? loc.entry : null;
    if (!entry) entry = entryForTab(S.tab, preferred);
    await loadEntry(entry, { silent: true });
    if (graphLanding) {
      showGraph();
      writeTabHash("issues");
    } else {
      writeHash(entry);
    }
    renderTabs();
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
  else if (docsMode()) {
    const first = defaultDocsEntry();
    S.tab = first?.tab || docsSections()[0]?.key || "";
  }
  else {
    const preferred = configuredDefault();
    S.tab = preferred || "overview";
    const visible = tabDefs().map((tab) => tab.key);
    if (!visible.includes(S.tab)) S.tab = visible[0] || "overview";
  }
  const entry = loc ? (loc.entry || entryForTab(loc.tab)) : defaultEntry();
  if (!loc && docsMode() && entry) S.tab = entry.tab;
  const graphLanding = !docsMode() && (loc ? loc.tab === "issues" && !loc.entry : S.tab === "issues");
  await loadEntry(entry, { silent: true });
  if (graphLanding) {
    showGraph();
    writeTabHash("issues");
  } else if (entry) writeHash(entry);
  else {
    await render();
    writeTabHash(S.tab);
  }
  connectEvents();
}

window.addEventListener("hashchange", async () => {
  const loc = readHash();
  if (!loc) return;
  S.tab = loc.tab;
  const preferred = S.doc?.issue?.slug;
  await loadEntry(loc.entry || entryForTab(loc.tab, preferred), { silent: true });
  if (!docsMode() && loc.tab === "issues" && !loc.entry) showGraph();
  renderTabs();
});

initTheme();
boot();
