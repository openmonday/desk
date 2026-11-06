/* Architecture code graph view.
 *
 * The graph is a filtered, bounded picture of the mycel document, not a dump of
 * every symbol: the default shows callable project symbols and project-internal
 * call edges. Filtering, the node limit, the deterministic layout, and the
 * accessible table all operate on the same rendered set.
 */
import { el, svgEl } from "./dom.js";
import { layoutCodeGraph } from "./codegraph-layout.js";

const CALLABLE = new Set(["function", "method", "constructor", "destructor"]);
const MAX_NODES = 240;
const MAX_EDGES = 2200;
const CATEGORY_RANK = { internal: 0, external: 1, unresolved: 2 };
const UNRESOLVED = "unresolved:";

const view = {
  search: "",
  scope: "",
  callables: true,
  external: false,
  unresolved: false,
  labels: false,
  zoom: 1,
  selected: null,
};

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const lower = (value) => String(value || "").toLowerCase();
const unresolvedId = (name) => `${UNRESOLVED}${name}`;

function location(raw) {
  if (!raw || typeof raw !== "object") return null;
  const file = typeof raw.file === "string" ? raw.file : "";
  const span = Array.isArray(raw.span) && raw.span.length >= 4 && raw.span.every(Number.isFinite)
    ? raw.span.slice(0, 4)
    : null;
  return { file, span };
}

function firstLocation(raw) {
  for (const group of [raw.definitions, raw.declarations]) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const found = location(item);
      if (found) return found;
    }
  }
  return null;
}

function spanText(span) {
  return span ? `${span[0]}:${span[1]}–${span[2]}:${span[3]}` : "—";
}

function buildModel(graph) {
  const files = new Map();
  for (const file of Array.isArray(graph.files) ? graph.files : []) {
    if (file && typeof file.id === "string") files.set(file.id, file);
  }
  const filePath = (id) => files.get(id)?.path || id || "";

  const symbolsById = new Map();
  const symbols = [];
  for (const raw of Array.isArray(graph.symbols) ? graph.symbols : []) {
    if (!raw || typeof raw.id !== "string") continue;
    const at = firstLocation(raw);
    const symbol = {
      id: raw.id,
      name: typeof raw.name === "string" && raw.name ? raw.name : raw.anonymous ? "(anonymous)" : raw.id,
      kind: typeof raw.kind === "string" && raw.kind ? raw.kind : "symbol",
      external: raw.external === true,
      file: filePath(at?.file),
      span: at?.span || null,
      degree: 0,
    };
    symbolsById.set(symbol.id, symbol);
    symbols.push(symbol);
  }

  const outCount = new Map();
  const inCount = new Map();
  const unresolved = new Map();
  const edges = [];

  for (const raw of Array.isArray(graph.edges) ? graph.edges : []) {
    if (!raw || typeof raw.from !== "string") continue;
    const source = symbolsById.get(raw.from);
    if (!source) continue;
    const to = typeof raw.to === "string" ? raw.to : null;
    const target = to ? symbolsById.get(to) : null;
    const at = location(raw.at);
    const name = typeof raw.name === "string" ? raw.name : "";
    const category = !target ? "unresolved" : target.external || source.external ? "external" : "internal";
    const edge = {
      from: source.id,
      to: to && target ? target.id : null,
      name,
      kind: typeof raw.kind === "string" ? raw.kind : "call",
      category,
      at,
    };
    edges.push(edge);
    outCount.set(source.id, (outCount.get(source.id) || 0) + 1);
    if (target) inCount.set(target.id, (inCount.get(target.id) || 0) + 1);
    if (category === "unresolved") {
      const key = name || "(unresolved call)";
      const info = unresolved.get(key) || { name: key, file: at ? filePath(at.file) : "", count: 0 };
      info.count += 1;
      unresolved.set(key, info);
    }
  }

  for (const symbol of symbols) {
    symbol.degree = (inCount.get(symbol.id) || 0) + (outCount.get(symbol.id) || 0);
  }

  return { symbols, symbolsById, edges, inCount, outCount, unresolved, filePath };
}

function matchesScope(file, scope) {
  return !scope || file === scope || file.startsWith(`${scope}/`);
}

function matchesSearch(name, file, term) {
  return !term || lower(name).includes(term) || lower(file).includes(term);
}

function radiusFor(degree) {
  return 5 + Math.min(9, Math.sqrt(Math.max(0, degree)) * 1.5);
}

function candidates(model, state) {
  const term = state.search.trim().toLowerCase();
  const found = [];

  for (const symbol of model.symbols) {
    if (symbol.external && !state.external) continue;
    if (state.callables && !CALLABLE.has(symbol.kind)) continue;
    if (!matchesScope(symbol.file, state.scope)) continue;
    if (!matchesSearch(symbol.name, symbol.file, term)) continue;
    found.push({
      ...symbol,
      category: symbol.external ? "external" : "internal",
    });
  }

  if (state.unresolved) {
    for (const info of model.unresolved.values()) {
      if (!matchesScope(info.file, state.scope)) continue;
      if (!matchesSearch(info.name, info.file, term)) continue;
      found.push({
        id: unresolvedId(info.name),
        name: info.name,
        kind: "unresolved call",
        external: false,
        file: info.file,
        span: null,
        degree: info.count,
        calls: info.count,
        category: "unresolved",
      });
    }
  }

  found.sort(compareNodes);
  return found;
}

function compareNodes(a, b) {
  return b.degree - a.degree
    || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
    || compare(a.file, b.file)
    || compare(a.name, b.name)
    || compare(a.id, b.id);
}

function selectNodes(found, model, state) {
  if (found.length <= MAX_NODES) return found;

  const available = new Map(found.map((node) => [node.id, node]));
  const neighbours = new Map();
  const link = (a, b) => {
    if (!neighbours.has(a)) neighbours.set(a, []);
    neighbours.get(a).push(b);
  };
  for (const edge of model.edges) {
    if (edge.category === "external" && !state.external) continue;
    if (edge.category === "unresolved" && !state.unresolved) continue;
    if (!available.has(edge.from)) continue;
    const to = edge.category === "unresolved" ? unresolvedId(edge.name || "(unresolved call)") : edge.to;
    if (!to || !available.has(to)) continue;
    link(edge.from, to);
    link(to, edge.from);
  }

  const selected = [];
  const chosen = new Set();
  const add = (node) => {
    if (!node || chosen.has(node.id)) return false;
    chosen.add(node.id);
    selected.push(node);
    return true;
  };

  // Seed on the most connected symbols, then follow their neighbourhood so the
  // default picture has visible structure instead of a cloud of isolated hubs.
  const seedCount = Math.min(found.length, Math.floor(MAX_NODES * 0.35));
  for (let i = 0; i < seedCount; i += 1) add(found[i]);
  const queue = [...selected];
  const connectedTarget = Math.floor(MAX_NODES * 0.85);
  for (let i = 0; i < queue.length && selected.length < connectedTarget; i += 1) {
    const next = (neighbours.get(queue[i].id) || [])
      .map((id) => available.get(id))
      .filter((node) => node && !chosen.has(node.id))
      .sort(compareNodes);
    for (const node of next) {
      if (selected.length >= connectedTarget) break;
      if (add(node)) queue.push(node);
    }
  }
  for (const node of found) {
    if (selected.length >= MAX_NODES) break;
    add(node);
  }
  return selected;
}

function edgesFor(model, state, nodeMap) {
  const accepted = [];
  for (const edge of model.edges) {
    if (!nodeMap.has(edge.from)) continue;
    let to = edge.to;
    if (edge.category === "external" && !state.external) continue;
    if (edge.category === "unresolved") {
      if (!state.unresolved) continue;
      to = unresolvedId(edge.name || "(unresolved call)");
    }
    if (!to || !nodeMap.has(to)) continue;
    accepted.push({ ...edge, drawTo: to });
  }
  accepted.sort((a, b) =>
    compare(nodeMap.get(a.from).file, nodeMap.get(b.from).file)
    || compare(nodeMap.get(a.from).name, nodeMap.get(b.from).name)
    || compare(nodeMap.get(a.drawTo).file, nodeMap.get(b.drawTo).file)
    || compare(nodeMap.get(a.drawTo).name, nodeMap.get(b.drawTo).name)
    || compare(a.at?.file || "", b.at?.file || "")
    || (a.at?.span?.[0] || 0) - (b.at?.span?.[0] || 0)
    || (a.at?.span?.[1] || 0) - (b.at?.span?.[1] || 0)
    || compare(a.name, b.name));
  return accepted;
}

function scopeOptions(model) {
  const files = new Map();
  const dirs = new Map();
  for (const symbol of model.symbols) {
    const file = symbol.file;
    if (!file) continue;
    files.set(file, (files.get(file) || 0) + 1);
    const parts = file.split("/");
    parts.pop();
    let dir = parts.join("/");
    while (dir) {
      dirs.set(dir, (dirs.get(dir) || 0) + 1);
      const parent = dir.split("/");
      parent.pop();
      dir = parent.join("/");
    }
  }
  return {
    files: [...files].sort((a, b) => compare(a[0], b[0])),
    dirs: [...dirs].sort((a, b) => compare(a[0], b[0])),
  };
}

function markers() {
  const defs = svgEl("defs");
  for (const category of ["internal", "external", "unresolved"]) {
    defs.append(svgEl("marker", {
      id: `cg-arrow-${category}`,
      class: `cg-arrow cg-arrow-${category}`,
      viewBox: "0 0 7 7",
      refX: "6.4",
      refY: "3.5",
      markerWidth: "7",
      markerHeight: "7",
      markerUnits: "userSpaceOnUse",
      orient: "auto",
    }, [svgEl("path", { d: "M0,0.5 L6.4,3.5 L0,6.5 Z" })]));
  }
  return defs;
}

function hashText(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function edgePath(from, to, edge, index) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const ux = dx / length;
  const uy = dy / length;
  const sx = from.x + ux * (from.r + 3);
  const sy = from.y + uy * (from.r + 3);
  const tx = to.x - ux * (to.r + 7);
  const ty = to.y - uy * (to.r + 7);
  const bend = ((hashText(`${edge.from}|${edge.drawTo}|${index}`) % 17) - 8) * 1.35;
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${((sx + tx) / 2 - uy * bend).toFixed(1)},${((sy + ty) / 2 + ux * bend).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
}

function nodeElement(node, point, model, labelAll) {
  const incoming = model.inCount.get(node.id) || 0;
  const outgoing = model.outCount.get(node.id) || 0;
  const place = `${node.file || "external"}${node.span ? `, ${spanText(node.span)}` : ""}`;
  const label = node.name.length > 28 ? `${node.name.slice(0, 26)}…` : node.name;
  const spoken = `${node.name}, ${node.kind}, ${place}. ${incoming} incoming and ${outgoing} outgoing edges.`;
  const labelled = view.labels || labelAll || node.degree >= 8 || view.selected === node.id;

  const group = svgEl("g", {
    class: `cg-node cg-node-${node.category}${view.selected === node.id ? " is-selected" : ""}${labelled ? " is-labelled" : ""}`,
    tabindex: "0",
    role: "button",
    "aria-pressed": String(view.selected === node.id),
    "aria-label": spoken,
    "data-id": node.id,
  });
  group.append(svgEl("title", {}, [document.createTextNode(spoken)]));
  group.append(svgEl("circle", {
    class: "cg-dot", cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: point.r.toFixed(1),
  }));
  group.append(svgEl("text", {
    class: "cg-label",
    x: point.x.toFixed(1),
    y: (point.y + point.r + 11).toFixed(1),
    "text-anchor": "middle",
  }, [document.createTextNode(label)]));
  return group;
}

function renderTable(nodes, model) {
  if (!nodes.length) return el("p", { class: "cg-empty" }, ["No symbols match these filters."]);
  const rows = nodes.map((node) => el("tr", {}, [
    el("th", { scope: "row" }, [node.name]),
    el("td", {}, [node.kind]),
    el("td", {}, [el("code", {}, [node.file || "external"])]),
    el("td", {}, [spanText(node.span)]),
    el("td", { class: "cg-num" }, [fmt(model.inCount.get(node.id) || node.calls || 0)]),
    el("td", { class: "cg-num" }, [fmt(model.outCount.get(node.id) || 0)]),
  ]));
  return el("details", { class: "cg-table" }, [
    el("summary", {}, [`Accessible list of the ${fmt(nodes.length)} rendered symbols`]),
    el("div", { class: "cg-table-scroll" }, [
      el("table", {}, [
        el("caption", { class: "sr-only" }, ["Symbols currently drawn in the code graph"]),
        el("thead", {}, [el("tr", {}, [
          el("th", { scope: "col" }, ["Name"]),
          el("th", { scope: "col" }, ["Kind"]),
          el("th", { scope: "col" }, ["File"]),
          el("th", { scope: "col" }, ["Span"]),
          el("th", { scope: "col" }, ["In"]),
          el("th", { scope: "col" }, ["Out"]),
        ])]),
        el("tbody", {}, rows),
      ]),
    ]),
  ]);
}

function detailBlock(model, node) {
  if (!node) {
    return el("div", { class: "cg-detail-empty" }, [
      el("p", { class: "cg-detail-lead" }, ["Select a symbol"]),
      el("p", {}, ["Click a node, or focus one with Tab and press Enter, to see its kind, file, span, and edge counts."]),
    ]);
  }

  const incoming = model.inCount.get(node.id) || 0;
  const outgoing = model.outCount.get(node.id) || 0;
  const rows = [
    ["Kind", node.kind],
    ["File", node.file || "external"],
    ["Span", spanText(node.span)],
    ["Edges", `${fmt(incoming)} in · ${fmt(outgoing)} out`],
  ];
  if (node.category === "external") rows.push(["Visibility", "External symbol"]);
  if (node.category === "unresolved") rows.push(["Calls", `${fmt(node.calls || 0)} unresolved calls`]);

  return el("div", { class: "cg-detail-body" }, [
    el("p", { class: "eyebrow" }, ["Selected symbol"]),
    el("h2", {}, [node.name]),
    el("dl", {}, rows.flatMap(([term, value]) => [
      el("dt", {}, [term]),
      el("dd", {}, [term === "File" ? el("code", {}, [value]) : value]),
    ])),
  ]);
}

function setSelection(refs, model, id) {
  view.selected = id;
  const node = id ? refs.nodes.get(id) : null;
  for (const [nodeId, group] of refs.nodeElements) {
    const on = nodeId === id;
    group.classList.toggle("is-selected", on);
    group.classList.toggle("is-labelled", view.labels || refs.labelAll || (refs.nodes.get(nodeId)?.degree || 0) >= 8 || on);
    group.setAttribute("aria-pressed", String(on));
  }
  refs.detail.replaceChildren(detailBlock(model, node || null));
}

function applyZoom(refs) {
  refs.zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`;
  const svg = refs.canvas.querySelector(".cg-svg");
  if (!svg) return;
  svg.setAttribute("width", String(Math.round(refs.base.width * view.zoom)));
  svg.setAttribute("height", String(Math.round(refs.base.height * view.zoom)));
}

function schedule(draw) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 120);
  };
}

export function renderCodeGraph(graph, opts = {}) {
  if (!graph) {
    return el("section", { class: "codegraph", "aria-labelledby": "cg-title" }, [
      el("p", { class: "eyebrow" }, ["Code graph · architecture/graph.json"]),
      el("h1", { id: "cg-title" }, ["Code graph"]),
      el("p", { class: "cg-error", role: "alert" }, [
        opts.error || "This workspace has no code graph yet. Put mycel's graph.json under .desk/architecture/.",
      ]),
      el("p", { class: "cg-hint" }, ["The Markdown records still work. The rail diagnostic names the graph problem."]),
    ]);
  }

  const model = buildModel(graph);
  const scopes = scopeOptions(model);
  const section = el("section", { class: "codegraph", "aria-labelledby": "cg-title" });
  const generator = graph.generator && typeof graph.generator === "object" ? graph.generator : {};
  const header = el("header", { class: "cg-head" }, [
    el("p", { class: "eyebrow" }, [`Code graph · architecture/graph.json · ${generator.name || "generator"} ${generator.version || ""}`.trim()]),
    el("h1", { id: "cg-title" }, ["Code graph"]),
    el("p", { class: "cg-summary" }, [
      `${fmt(graph.symbols.length)} symbols · ${fmt(graph.edges.length)} edges · ${fmt(graph.files.length)} files`,
      el("span", { class: "cg-root" }, [`root ${graph.root || "."}`]),
    ]),
  ]);

  const count = el("p", { class: "cg-count", "aria-live": "polite" });
  const zoomLabel = el("span", { class: "cg-zoom-label", "aria-live": "polite" }, ["100%"]);
  const canvas = el("div", { class: "cg-canvas" });
  const scroll = el("div", {
    class: "cg-canvas-scroll", tabindex: "0", "aria-label": "Code graph canvas; scroll to explore",
  }, [canvas]);
  const detail = el("aside", { class: "cg-detail", "aria-label": "Selected symbol" });
  const table = el("div", { class: "cg-table-host" });
  const refs = {
    count, canvas, detail, table, zoomLabel,
    nodes: new Map(), nodeElements: new Map(), labelAll: false,
    base: { width: 960, height: 620 },
  };

  const search = el("input", {
    type: "search", id: "cg-search", class: "cg-input", placeholder: "Name or file",
    autocomplete: "off", spellcheck: "false",
  });
  search.value = view.search;

  const scope = el("select", { id: "cg-scope", class: "cg-select" }, [
    el("option", { value: "" }, ["All files and folders"]),
    ...(scopes.dirs.length ? [el("optgroup", { label: "Folders" }, scopes.dirs.map(([dir, n]) =>
      el("option", { value: dir }, [`${dir}/ (${fmt(n)})`]))) ] : []),
    ...(scopes.files.length ? [el("optgroup", { label: "Files" }, scopes.files.map(([file, n]) =>
      el("option", { value: file }, [`${file} (${fmt(n)})`]))) ] : []),
  ]);
  scope.value = view.scope;

  const check = (label, key, onChange) => {
    const input = el("input", { type: "checkbox" });
    input.checked = view[key];
    input.addEventListener("change", () => {
      view[key] = input.checked;
      onChange();
    });
    return el("label", { class: "cg-check" }, [input, el("span", {}, [label])]);
  };

  const draw = () => {
    const found = candidates(model, view);
    const shown = selectNodes(found, model, view).map((node) => ({ ...node, radius: radiusFor(node.degree) }));
    const nodeMap = new Map(shown.map((node) => [node.id, node]));
    if (view.selected && !nodeMap.has(view.selected)) view.selected = null;

    const accepted = edgesFor(model, view, nodeMap);
    const drawn = accepted.slice(0, MAX_EDGES);
    const layout = layoutCodeGraph(shown, drawn);
    refs.nodes = nodeMap;
    refs.base = { width: layout.width, height: layout.height };
    refs.labelAll = shown.length <= 20;

    const hiddenNodes = Math.max(0, found.length - shown.length);
    const hiddenEdges = Math.max(0, accepted.length - drawn.length);
    refs.count.replaceChildren(
      el("strong", {}, [`Showing ${fmt(shown.length)} of ${fmt(found.length)} matching symbols`]),
      hiddenNodes ? ` · ${fmt(hiddenNodes)} hidden by the ${MAX_NODES}-node limit` : " · no symbols hidden by the node limit",
      ` · ${fmt(drawn.length)} edges drawn between shown symbols`,
      hiddenEdges ? ` · ${fmt(hiddenEdges)} hidden by the ${fmt(MAX_EDGES)}-edge limit` : "",
    );

    refs.canvas.replaceChildren();
    if (!shown.length) {
      refs.canvas.append(el("p", { class: "cg-empty" }, [
        "No symbols match these filters. Clear the search, widen the scope, or allow external or unresolved edges.",
      ]));
      refs.table.replaceChildren(renderTable(shown, model));
      setSelection(refs, model, null);
      applyZoom(refs);
      return;
    }

    const desc = el("p", { id: "cg-desc", class: "sr-only" }, [
      `Interactive code graph with ${shown.length} symbols and ${drawn.length} edges. `
      + "Use Tab to move through symbols and Enter to select one. The accessible table below lists the same symbols.",
    ]);

    const svg = svgEl("svg", {
      class: "cg-svg",
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: String(Math.round(layout.width * view.zoom)),
      height: String(Math.round(layout.height * view.zoom)),
      role: "group",
      "aria-label": "Code graph",
      "aria-describedby": "cg-desc",
    });
    svg.append(markers());

    const edgeLayer = svgEl("g", { class: "cg-edges", "aria-hidden": "true" });
    const incident = new Map();
    for (let i = 0; i < drawn.length; i += 1) {
      const edge = drawn[i];
      const from = layout.points.get(edge.from);
      const to = layout.points.get(edge.drawTo);
      if (!from || !to) continue;
      const d = edgePath(from, to, edge, i);
      if (!d) continue;
      const path = svgEl("path", {
        class: "cg-edge",
        "data-category": edge.category,
        "data-from": edge.from,
        "data-to": edge.drawTo,
        d,
        "marker-end": `url(#cg-arrow-${edge.category})`,
      });
      edgeLayer.append(path);
      for (const id of [edge.from, edge.drawTo]) {
        if (!incident.has(id)) incident.set(id, []);
        incident.get(id).push(path);
      }
    }
    svg.append(edgeLayer);

    const nodeLayer = svgEl("g", { class: "cg-nodes" });
    const nodeElements = new Map();
    for (const node of shown) {
      const point = layout.points.get(node.id);
      if (!point) continue;
      const group = nodeElement(node, point, model, refs.labelAll);
      group.dataset.id = node.id;
      nodeElements.set(node.id, group);
      nodeLayer.append(group);
    }
    svg.append(nodeLayer);

    let lit = [];
    const trace = (id) => {
      for (const path of lit) path.classList.remove("is-lit");
      lit = [];
      const near = id ? new Set([id]) : new Set();
      if (id) {
        for (const path of incident.get(id) || []) {
          path.classList.add("is-lit");
          lit.push(path);
          near.add(path.dataset.from);
          near.add(path.dataset.to);
        }
      }
      svg.classList.toggle("is-tracing", Boolean(id));
      for (const [nodeId, group] of nodeElements) group.classList.toggle("is-near", near.has(nodeId));
    };

    svg.addEventListener("click", (ev) => {
      const group = ev.target.closest?.(".cg-node");
      setSelection(refs, model, group ? group.dataset.id : null);
    });
    svg.addEventListener("keydown", (ev) => {
      const group = ev.target.closest?.(".cg-node");
      if (!group) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        setSelection(refs, model, group.dataset.id);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        setSelection(refs, model, null);
      }
    });
    svg.addEventListener("mouseover", (ev) => {
      const group = ev.target.closest?.(".cg-node");
      trace(group ? group.dataset.id : null);
    });
    svg.addEventListener("mouseleave", () => trace(null));
    svg.addEventListener("focusin", (ev) => {
      const group = ev.target.closest?.(".cg-node");
      if (group) trace(group.dataset.id);
    });
    svg.addEventListener("focusout", (ev) => {
      if (!svg.contains(ev.relatedTarget)) trace(null);
    });

    refs.nodeElements = nodeElements;
    refs.canvas.append(desc, svg);
    refs.table.replaceChildren(renderTable(shown, model));
    setSelection(refs, model, view.selected);
    applyZoom(refs);
  };

  const redrawSoon = schedule(draw);

  search.addEventListener("input", () => {
    view.search = search.value;
    redrawSoon();
  });
  scope.addEventListener("change", () => {
    view.scope = scope.value;
    draw();
  });
  const callables = check("Callable symbols only", "callables", draw);
  const external = check("External edges", "external", draw);
  const unresolved = check("Unresolved edges", "unresolved", draw);
  const labels = check("Show all labels", "labels", draw);

  const reset = el("button", { type: "button", class: "cg-btn" }, ["Reset filters"]);
  reset.addEventListener("click", () => {
    view.search = "";
    view.scope = "";
    view.callables = true;
    view.external = false;
    view.unresolved = false;
    view.labels = false;
    view.selected = null;
    view.zoom = 1;
    search.value = "";
    scope.value = "";
    for (const [input, on] of [[callables.querySelector("input"), true], [external.querySelector("input"), false], [unresolved.querySelector("input"), false], [labels.querySelector("input"), false]]) {
      input.checked = on;
    }
    draw();
  });

  const zoom = (delta) => {
    view.zoom = Math.max(0.5, Math.min(2.5, Math.round((view.zoom + delta) * 10) / 10));
    applyZoom(refs);
  };
  const zoomOut = el("button", { type: "button", class: "cg-btn cg-btn-icon", "aria-label": "Zoom out", title: "Zoom out" }, ["−"]);
  const zoomIn = el("button", { type: "button", class: "cg-btn cg-btn-icon", "aria-label": "Zoom in", title: "Zoom in" }, ["+"]);
  const zoomReset = el("button", {
    type: "button", class: "cg-btn", "aria-label": "Reset zoom", title: "Reset zoom",
  }, ["100%"]);
  zoomOut.addEventListener("click", () => zoom(-0.2));
  zoomIn.addEventListener("click", () => zoom(0.2));
  zoomReset.addEventListener("click", () => {
    view.zoom = 1;
    applyZoom(refs);
  });

  const controls = el("div", { class: "cg-controls", role: "group", "aria-label": "Code graph filters" }, [
    el("label", { class: "cg-field cg-field-search" }, [
      el("span", {}, ["Search"]),
      search,
    ]),
    el("label", { class: "cg-field cg-field-scope" }, [
      el("span", {}, ["Scope"]),
      scope,
    ]),
    el("div", { class: "cg-checks" }, [callables, external, unresolved, labels]),
    el("div", { class: "cg-zoom" }, [
      el("span", { class: "cg-zoom-title" }, ["Zoom"]),
      zoomOut, zoomLabel, zoomIn, zoomReset,
    ]),
    el("div", { class: "cg-reset" }, [reset]),
  ]);

  section.append(
    header,
    controls,
    count,
    el("div", { class: "cg-body" }, [scroll, detail]),
    table,
  );
  draw();
  // The canvas is often wider than the article. Start centered on the drawing
  // instead of on an empty top-left corner.
  requestAnimationFrame(() => {
    if (!section.isConnected) return;
    scroll.scrollLeft = Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2);
    scroll.scrollTop = Math.max(0, (scroll.scrollHeight - scroll.clientHeight) / 2);
  });
  return section;
}
