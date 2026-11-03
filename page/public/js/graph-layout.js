/* Ticket graph layout: layered left-to-right columns with orthogonal edges.
 *
 * A ticket's column is its longest blocker chain. Adjacent dependencies turn in
 * the gutter between their columns; edges that skip columns travel on a labeled
 * bus below the graph. No line ever crosses a ticket card, so the SVG can never
 * sit on top of node text.
 *
 * The layout adapts to the panel: each column is only as wide as its titles
 * need, gaps absorb spare width, and row spacing grows with panel height. */

import { key, num } from "./state.js";

const GR = {
  minW: 168, maxW: 288, h: 84, padX: 14,
  rowGapMin: 20, rowGapMax: 64,
  colGapMin: 36, colGapMax: 96,
  marginX: 18, marginMin: 6, marginY: 18,
  busPad: 30, busStep: 20,
  track: 6, radius: 10, arrowGap: 4, portStep: 14,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let measureCtx = null;
function textWidth(text, font) {
  measureCtx ||= document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function lineCount(text, width, font) {
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  const space = textWidth(" ", font);
  for (const w of words) {
    const ww = textWidth(w, font);
    if (ww > width) return 99;
    if (cur && cur + space + ww > width) { lines++; cur = ww; } else cur += (cur ? space : 0) + ww;
  }
  return lines;
}

function graphFont() {
  const family = getComputedStyle(document.body).getPropertyValue("--sans-text").trim() || "sans-serif";
  return `500 13px ${family}`;
}

// Narrowest card that still fits a title in two lines, bounded by the panel.
function neededWidth(title, font) {
  let w = GR.minW;
  while (w < GR.maxW && lineCount(title, w - GR.padX * 2 - 2, font) > 2) w += 4;
  return w;
}

function columnWidths(layers, font) {
  return layers.map((layer) => layer.reduce(
    (w, it) => Math.max(w, neededWidth(it.t.title, font)), GR.minW,
  ));
}

function layoutGraph(tickets, availW, availH) {
  const byN = new Map(tickets.map((t) => [key(t.n), t]));
  const layerOf = new Map();
  const visiting = new Set();
  const walk = (t) => {
    const k = key(t.n);
    if (layerOf.has(k)) return layerOf.get(k);
    if (visiting.has(k)) return -1; // cycle: diagnostics report it; ignore this edge
    visiting.add(k);
    let d = 0;
    for (const b of t.blockedBy) {
      const bt = byN.get(key(b));
      if (!bt) continue;
      const bd = walk(bt);
      if (bd >= 0) d = Math.max(d, bd + 1);
    }
    visiting.delete(k);
    layerOf.set(k, d);
    return d;
  };
  tickets.forEach(walk);

  const nL = Math.max(0, ...layerOf.values()) + 1;
  const layers = Array.from({ length: nL }, () => []);
  const items = new Map();
  for (const t of [...tickets].sort((a, b) => a.n - b.n)) {
    const it = { id: key(t.n), t, layer: layerOf.get(key(t.n)), y: 0, h: GR.h, pred: [], succ: [] };
    items.set(it.id, it);
    layers[it.layer].push(it);
  }

  const edges = [];
  const back = [];
  for (const t of tickets) {
    for (const b of t.blockedBy) {
      const bt = byN.get(key(b));
      if (!bt || key(bt.n) === key(t.n)) continue;
      const e = {
        from: key(bt.n), to: key(t.n), done: bt.status === "done",
        adjacent: layerOf.get(key(t.n)) === layerOf.get(key(bt.n)) + 1,
      };
      if (layerOf.get(e.from) < layerOf.get(e.to)) {
        edges.push(e);
        if (e.adjacent) {
          items.get(e.from).succ.push(items.get(e.to));
          items.get(e.to).pred.push(items.get(e.from));
        }
      } else back.push(e);
    }
  }

  // Order within columns: barycentre sweeps reduce crossings.
  layers.forEach((l) => l.forEach((it, i) => { it.pos = i; }));
  const bary = (it, side) => {
    const ns = it[side];
    return ns.length ? ns.reduce((s, n) => s + n.pos, 0) / ns.length : it.pos;
  };
  for (let iter = 0; iter < 8; iter++) {
    const down = iter % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of order) {
      const bs = new Map(l.map((it) => [it, bary(it, down ? "pred" : "succ")]));
      l.sort((a, b) => bs.get(a) - bs.get(b) || a.pos - b.pos);
      l.forEach((it, i) => { it.pos = i; });
    }
  }

  // Columns get their own width, so short titles do not pay for long ones.
  const font = graphFont();
  const colW = columnWidths(layers, font);
  const sumW = colW.reduce((a, b) => a + b, 0);
  const gapCount = Math.max(0, nL - 1);

  // Compress the side margins first when the panel is tight, then center the
  // whole graph in whatever width is left.
  let marginX = GR.marginX;
  if (sumW + gapCount * GR.colGapMin + marginX * 2 > availW) marginX = GR.marginMin;
  const spare = availW - marginX * 2 - sumW;
  const gapPref = gapCount
    ? clamp(spare / gapCount, GR.colGapMin, GR.colGapMax)
    : 0;

  // Bus lanes are known before placement, so the rows can leave room for them.
  const buses = edges.filter((e) => !e.adjacent);
  const busH = buses.length ? GR.busPad + (buses.length - 1) * GR.busStep : 0;
  const rows = Math.max(1, ...layers.map((l) => l.length));
  const usable = Math.max(0, availH - GR.marginY * 2 - busH);
  const rowGap = rows > 1
    ? clamp((usable - rows * GR.h) / (rows - 1), GR.rowGapMin, GR.rowGapMax)
    : 0;

  // Vertical placement: stack a column in order, aim it at its neighbours.
  const place = (layer, want) => {
    const arr = [...layer].sort((a, b) => want.get(a) - want.get(b) || a.pos - b.pos);
    let cur = null;
    for (const it of arr) {
      const base = want.get(it);
      it.y = cur == null ? base : Math.max(base, cur + it.h + rowGap);
      cur = it.y;
    }
    const mean = arr.reduce((s, it) => s + it.y, 0) / arr.length;
    const target = arr.reduce((s, it) => s + want.get(it), 0) / arr.length;
    for (const it of arr) it.y += target - mean;
    layer.splice(0, layer.length, ...arr);
  };
  layers.forEach((l) => {
    l.forEach((it, i) => { it.y = i * (GR.h + rowGap); });
    const c = l.reduce((s, it) => s + it.y, 0) / l.length;
    l.forEach((it) => { it.y -= c; });
  });
  for (let iter = 0; iter < 12; iter++) {
    const down = iter % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of order) {
      place(l, new Map(l.map((it) => {
        const ns = it[down ? "pred" : "succ"];
        return [it, ns.length ? ns.reduce((s, n) => s + n.y, 0) / ns.length : it.y];
      })));
    }
  }

  let top = Infinity;
  for (const l of layers) for (const it of l) top = Math.min(top, it.y - it.h / 2);
  const shift = GR.marginY - top;
  let graphBottom = -Infinity;
  for (const l of layers) for (const it of l) {
    it.y += shift;
    graphBottom = Math.max(graphBottom, it.y + it.h / 2);
  }

  buses.sort((a, b) => items.get(a.from).y - items.get(b.from).y || items.get(a.to).y - items.get(b.to).y);
  buses.forEach((e, i) => {
    e.busY = graphBottom + GR.busPad + i * GR.busStep;
  });

  // Ports: spread several edges along a node's side, ordered by the far end.
  const spread = (list, node, side) => {
    const k = list.length;
    const span = Math.max(18, node.h - 40);
    const step = k > 1 ? Math.min(GR.portStep, span / (k - 1)) : 0;
    list.forEach((e, i) => { e[side] = node.y + (i - (k - 1) / 2) * step; });
  };
  for (const it of items.values()) {
    const outs = edges.filter((e) => e.from === it.id)
      .sort((a, b) => items.get(a.to).y - items.get(b.to).y);
    const ins = edges.filter((e) => e.to === it.id)
      .sort((a, b) => items.get(a.from).y - items.get(b.from).y);
    spread(outs, it, "out");
    spread(ins, it, "in");
  }

  // Vertical runs live only in the gutters next to a column. Colour the
  // intervals so two runs never share the same line.
  const runs = Array.from({ length: Math.max(1, nL - 1) }, () => []);
  for (const e of edges) {
    const s = items.get(e.from);
    const t = items.get(e.to);
    if (e.adjacent) {
      runs[s.layer].push({ e, role: "adj", y1: e.out, y2: e.in });
    } else {
      runs[s.layer].push({ e, role: "bus-out", y1: e.out, y2: e.busY });
      runs[t.layer - 1].push({ e, role: "bus-in", y1: e.busY, y2: e.in });
    }
  }
  const trackCount = runs.map((segs) => {
    segs.sort((a, b) => (a.y2 > a.y1 ? 0 : 1) - (b.y2 > b.y1 ? 0 : 1) || Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));
    const ends = [];
    for (const seg of segs) {
      const lo = Math.min(seg.y1, seg.y2);
      const hi = Math.max(seg.y1, seg.y2);
      let t = ends.findIndex((end) => end + 6 < lo);
      if (t < 0) { t = ends.length; ends.push(hi); } else ends[t] = hi;
      if (seg.role === "adj") seg.e.adjTrack = t;
      else if (seg.role === "bus-out") seg.e.busTrackOut = t;
      else seg.e.busTrackIn = t;
    }
    return Math.max(1, ends.length);
  });

  // A gutter widens only when its ladder needs the room; otherwise the
  // preferred gap is kept, so the panel never shows a crowd of tracks.
  const gapW = trackCount.map((n) => Math.max(gapPref, n * GR.track + 22));
  const colX = [marginX];
  for (let g = 0; g < nL - 1; g++) colX.push(colX[g] + colW[g] + gapW[g]);
  const Wtot = colX[nL - 1] + colW[nL - 1] + marginX;
  const trackX = (g, t) => colX[g] + colW[g] + gapW[g] / 2 + (t - (trackCount[g] - 1) / 2) * GR.track;

  for (const e of edges) {
    const s = items.get(e.from);
    const t = items.get(e.to);
    let pts;
    if (e.adjacent) {
      const x = trackX(s.layer, e.adjTrack || 0);
      pts = [[colX[s.layer] + colW[s.layer], e.out], [x, e.out], [x, e.in], [colX[t.layer] - GR.arrowGap, e.in]];
    } else {
      const x1 = trackX(s.layer, e.busTrackOut || 0);
      const x2 = trackX(t.layer - 1, e.busTrackIn || 0);
      pts = [
        [colX[s.layer] + colW[s.layer], e.out], [x1, e.out], [x1, e.busY],
        [x2, e.busY], [x2, e.in], [colX[t.layer] - GR.arrowGap, e.in],
      ];
      e.label = {
        x: (x1 + x2) / 2,
        y: e.busY - 7,
        text: `after ${num(items.get(e.from).t.n)}`,
      };
    }
    e.d = roundedPath(pts, GR.radius);
  }

  const busBottom = buses.length
    ? graphBottom + GR.busPad + (buses.length - 1) * GR.busStep
    : graphBottom;
  return {
    byN, items, layers, edges, back, colX, colW,
    H: busBottom + GR.marginY,
    Wtot,
  };
}

function roundedPath(raw, r) {
  const pts = raw.filter((p, i) => !i || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 0.5);
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = cx - ((cx - px) / d1) * rr;
    const ay = cy - ((cy - py) / d1) * rr;
    const bx = cx + ((nx - cx) / d2) * rr;
    const by = cy + ((ny - cy) / d2) * rr;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

export { GR, clamp, layoutGraph };
