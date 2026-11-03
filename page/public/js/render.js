/* Render the whole page in the same order as the original client. */

import { S, docTitle } from "./state.js";
import { renderArticle } from "./article.js";
import { renderGraph } from "./graph.js";
import { renderRail } from "./rail.js";

function render() {
  document.title = S.doc ? `${docTitle()} · desk` : "desk";
  renderArticle();
  renderGraph();
  renderRail();
  renderTabs();
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === S.tab));
  });
}

export { render, renderTabs };
