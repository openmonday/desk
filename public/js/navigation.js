/* Open a document, render it, and preserve scroll when appropriate. */

import { S, entryForPath, narrow } from "./state.js";
import { api } from "./api.js";
import { writeHash } from "./hash.js";
import { actions } from "./actions.js";
import { noteNavigation } from "./fullscreen.js";
import { articlePanel, scroller } from "./refs.js";

async function loadEntry(entry, opts = {}) {
  if (!entry) {
    S.doc = null;
    S.mdError = null;
    noteNavigation();
    actions.showArticle();
    actions.render();
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
  actions.render();
  if (opts.keepScroll) {
    scroller.style.scrollBehavior = "auto";
    scroller.scrollTop = top;
    requestAnimationFrame(() => { scroller.style.scrollBehavior = ""; });
  } else {
    scroller.scrollTop = 0;
    // Single column: the page scrolls, not the article pane. Opening an entry
    // from the rail, graph or list brings the document into view.
    if (narrow()) {
      const top = Math.max(0, window.scrollY + articlePanel.getBoundingClientRect().top - 64);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top, behavior });
    }
  }
  if (!opts.silent) writeHash(entry);
}

const open = (path) => loadEntry(entryForPath(path));

export { loadEntry, open };
