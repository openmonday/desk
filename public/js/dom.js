/* Small DOM builders shared by every view. */

import { issueIndex, key, tallyText } from "./state.js";

/* ---------- helpers ---------- */

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids || []) {
    if (kid == null || kid === false) continue;
    n.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  for (const kid of kids || []) n.append(kid);
  return n;
}


function glyph(kind, size = 14) {
  const s = svgEl("svg", {
    class: "glyph", "data-kind": kind, viewBox: "0 0 16 16",
    width: size, height: size, "aria-hidden": "true", focusable: "false",
  });
  const ring = (extra = "") => svgEl("circle", { cx: 8, cy: 8, r: 6.25, class: `g-ring${extra}` });
  switch (kind) {
    case "done":
      s.append(svgEl("circle", { cx: 8, cy: 8, r: 7, class: "g-fill" }),
        svgEl("path", { d: "M4.9 8.2l2.1 2.1 4.2-4.5", class: "g-knock" }));
      break;
    case "active":
      s.append(ring(), svgEl("path", { d: "M8 3.5a4.5 4.5 0 0 1 0 9z", class: "g-fill" }));
      break;
    case "ready":
      s.append(ring());
      break;
    case "waiting":
      s.append(ring(" g-dash"));
      break;
    case "dropped":
      s.append(ring(" g-dash"), svgEl("path", { d: "M5 8h6", class: "g-ring", fill: "none" }));
      break;
    default:
      s.append(ring(" g-dash"), svgEl("circle", { cx: 8, cy: 8, r: 1.6, class: "g-fill" }));
  }
  return s;
}

function progressLine(issue, cls = "") {
  const { states } = issueIndex(issue);
  const tasks = issue.tasks || [];
  return el("div", {
    class: `progress ${cls}`.trim(), role: "img", "aria-label": tallyText(issue),
  }, tasks.map((t) => el("i", { "data-kind": states.get(key(t.n))?.kind || "unknown" })));
}

const cmd = (s) => el("code", {}, [s]);

export { el, svgEl, glyph, progressLine, cmd };
