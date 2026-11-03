/* Render the whole page in the same order as the original client. */

import { S, docTitle, docsMode, docsSections } from "./state.js";
import { renderArticle } from "./article.js";
import { renderGraph } from "./graph.js";
import { renderRail } from "./rail.js";
import { brand, tabs } from "./refs.js";

const DESK_TABS = [
  ["context", "Context"],
  ["architecture", "Architecture"],
  ["features", "Features"],
];

function tabDefs() {
  if (!docsMode()) return DESK_TABS.map(([key, label]) => ({ key, label }));
  return docsSections().map((section) => ({ key: section.key, label: section.title }));
}

function renderTabs() {
  const defs = tabDefs();
  tabs.replaceChildren();
  for (const { key, label } of defs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.dataset.tab = key;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(key === S.tab));
    b.textContent = label;
    const li = document.createElement("li");
    li.append(b);
    tabs.append(li);
  }

  const navigatingDocs = docsMode();
  const nav = tabs.closest("nav");
  if (nav) {
    nav.hidden = defs.length === 0;
    nav.setAttribute("aria-label", navigatingDocs ? "Document sections" : "Workspace sections");
  }
  if (brand) {
    brand.href = navigatingDocs ? "#/docs" : "#/features";
    brand.setAttribute("aria-label", navigatingDocs ? "desk — docs" : "desk — features");
  }

  // With many sections the tab strip scrolls; keep the selected tab in view.
  if (nav) {
    requestAnimationFrame(() => {
      const active = tabs.querySelector('.tab[aria-selected="true"]');
      if (!active) return;
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < nav.scrollLeft) nav.scrollLeft = left;
      else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth;
    });
  }
}

function render() {
  document.title = S.doc ? `${docTitle()} · desk` : "desk";
  renderArticle();
  renderGraph();
  renderRail();
  renderTabs();
}

export { render, renderTabs };
