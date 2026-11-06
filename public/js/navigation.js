/* Open a document, render it, and preserve scroll when appropriate. */

import { S, entryForPath, narrow } from "./state.js";
import { api } from "./api.js";
import { writeHash } from "./hash.js";
import { actions } from "./actions.js";
import { noteNavigation } from "./fullscreen.js";
import { articlePanel, scroller } from "./refs.js";

function settleView(entry, opts, top) {
  if (opts.keepScroll) {
    scroller.style.scrollBehavior = "auto";
    scroller.scrollTop = top;
    requestAnimationFrame(() => { scroller.style.scrollBehavior = ""; });
  } else {
    scroller.scrollTop = 0;
    // Single column: the page scrolls, not the article pane. Opening an entry
    // from the rail, graph or list brings the document into view.
    if (narrow()) {
      const topbar = document.querySelector(".topbar");
      const offset = (topbar?.offsetHeight || 54) + 10;
      const y = Math.max(0, window.scrollY + articlePanel.getBoundingClientRect().top - offset);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top: y, behavior });
    }
  }
  if (!opts.silent) writeHash(entry);
}

async function loadCodeGraph(entry, opts) {
  const top = scroller.scrollTop;
  let payload = null;
  let error = null;
  try {
    payload = await api("/api/codegraph");
  } catch {
    error = "The code graph could not be loaded. It may be malformed, missing, or larger than the read limit.";
  }

  if (S.doc?.kind === "codegraph" && S.doc.path === entry.path
    && S.doc.mtime === (payload?.mtime || 0) && opts.keepScroll && !opts.force) {
    S.doc = { ...S.doc, summary: entry.summary || S.tree?.graph || S.doc.summary };
    return;
  }

  S.doc = {
    ...entry,
    summary: entry.summary || S.tree?.graph || null,
    codegraph: payload?.graph || null,
    codegraphError: error,
    mtime: payload?.mtime || 0,
  };
  S.mdError = null;
  if (!opts.keepScroll) {
    noteNavigation();
    actions.showArticle();
  }
  await actions.render();
  settleView(entry, opts, top);
}

async function loadEntry(entry, opts = {}) {
  // A rail can point at a document outside the selected section. Follow the
  // document so the tab bar and rail heading stay in sync.
  if (entry?.tab && entry.tab !== S.tab) S.tab = entry.tab;
  if (!entry) {
    S.doc = null;
    S.mdError = null;
    noteNavigation();
    actions.showArticle();
    await actions.render();
    return;
  }
  if (entry.kind === "codegraph") {
    await loadCodeGraph(entry, opts);
    return;
  }

  const top = scroller.scrollTop;
  let payload;
  try {
    payload = await api(`/api/doc?path=${encodeURIComponent(entry.path)}`);
  } catch {
    payload = { md: "Could not load this document. It may have moved or been deleted.", mtime: 0, error: true };
  }
  if (S.doc && S.doc.path === entry.path && S.doc.mtime === payload.mtime && opts.keepScroll && !opts.force) {
    // Same document, same bytes: keep the DOM and only refresh tree-derived refs.
    S.doc = { ...S.doc, feature: entry.feature || S.doc.feature, ticket: entry.ticket || S.doc.ticket, title: entry.title };
    return;
  }
  S.doc = { ...entry, md: payload.md, mtime: payload.mtime };
  S.mdError = null;
  // Live refreshes keep the current view; navigation returns to the article.
  if (!opts.keepScroll) {
    noteNavigation();
    actions.showArticle();
  }
  await actions.render();
  settleView(entry, opts, top);
}

const open = (path, opts = {}) => {
  const entry = entryForPath(path);
  if (!entry) return loadEntry(null, opts);
  return loadEntry(opts.tab ? { ...entry, tab: opts.tab } : entry, opts);
};

export { loadEntry, open };
