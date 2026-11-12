/* Render the whole page in the same order as the original client. */

import { S, docTitle, docsMode, tabDefs, configuredDefault } from "./state.js";
import { renderArticle } from "./article.js";
import { renderGraph } from "./graph.js";
import { renderRail } from "./rail.js";
import { brand, tabs } from "./refs.js";

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
    const homeKey = navigatingDocs ? null : configuredDefault() || defs[0]?.key || "issues";
    const homeLabel = defs.find((d) => d.key === homeKey)?.label || "workspace";
    brand.href = navigatingDocs ? "#/docs" : `#/${homeKey}`;
    brand.setAttribute("aria-label", navigatingDocs ? "desk — docs" : `desk — ${homeLabel}`);
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

let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  document.title = S.doc ? `${docTitle()} · desk` : "desk";
  const applied = await renderArticle();
  if (!applied || seq !== renderSeq) return;
  renderGraph();
  renderRail();
  renderTabs();
}

export { render, renderTabs };
