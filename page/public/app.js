/* desk page client. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const rail = $("#rail");
  const article = $("#article");
  const scroller = $("#scroll");
  const live = $("#live");
  const work = $("#work");
  const viewport = $(".viewport");
  const railSplit = $("#rail-split");
  const graphPanel = $("#graph-panel");
  const graphBody = $("#graph-body");
  const graphTally = $("#graph-tally");
  const panelSplit = $("#splitter");
  const panelToggle = $("#panel-toggle");

  const S = {
    tab: "features",
    tree: null,
    doc: null,
    mdError: null,
    justDone: new Set(),
    graphSig: "",
  };

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

  async function api(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }

  const slug = (s) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

  const num = (n) => String(n).padStart(2, "0");
  const key = (n) => String(Number(n));
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const narrow = () => window.matchMedia("(max-width: 900px)").matches;

  function featureBySlug(s) {
    return (S.tree?.features || []).find((f) => f.slug === s) || null;
  }

  function entryForPath(path) {
    const t = S.tree;
    if (!t || !path) return null;
    if (t.context?.path === path && t.context?.exists) {
      return { kind: "context", path, title: t.context.title || "Context", tab: "context" };
    }
    const arch = (t.architecture || []).find((a) => a.path === path);
    if (arch) return { kind: "arch", path, title: arch.title, tab: "architecture", record: arch };
    for (const f of t.features || []) {
      if (f.specPath === path) return { kind: "spec", path, title: f.title, tab: "features", feature: f };
      const tk = (f.tickets || []).find((x) => x.path === path);
      if (tk) return { kind: "ticket", path, title: tk.title, tab: "features", feature: f, ticket: tk };
    }
    return null;
  }

  /* ---------- ticket state ---------- */
  // One vocabulary everywhere: Done, In progress, Ready, Waiting, Blocked.
  // "Waiting" = pending with open blockers; "Blocked" = the file says blocked.

  const KIND_LABEL = {
    done: "Done",
    active: "In progress",
    ready: "Ready",
    waiting: "Waiting",
    blocked: "Blocked",
    unknown: "Unknown status",
  };

  const indexCache = new WeakMap();
  function featureIndex(f) {
    let idx = indexCache.get(f);
    if (idx) return idx;
    const tickets = f.tickets || [];
    const byN = new Map(tickets.map((t) => [key(t.n), t]));
    const dependents = new Map();
    for (const t of tickets) {
      for (const b of t.blockedBy) {
        const k = key(b);
        if (!dependents.has(k)) dependents.set(k, []);
        dependents.get(k).push(t);
      }
    }
    const states = new Map(tickets.map((t) => [key(t.n), stateOf(t, byN)]));
    idx = { byN, dependents, states };
    indexCache.set(f, idx);
    return idx;
  }

  function stateOf(t, byN) {
    const blockers = t.blockedBy.map((b) =>
      byN.get(key(b)) || { n: Number(b), title: "missing ticket", status: "unknown", missing: true });
    const open = blockers.filter((b) => b.status !== "done");
    let kind;
    if (t.status === "done") kind = "done";
    else if (t.status === "in-progress") kind = "active";
    else if (t.status === "blocked") kind = "blocked";
    else if (t.status === "unknown") kind = "unknown";
    else kind = open.length ? "waiting" : "ready";
    return { kind, blockers, open };
  }

  function shortState(st) {
    if (st.kind === "waiting") return `Waiting on ${st.open.map((b) => num(b.n)).join(", ")}`;
    return KIND_LABEL[st.kind];
  }

  function tally(f) {
    const { states } = featureIndex(f);
    const c = { done: 0, active: 0, ready: 0, waiting: 0, blocked: 0, unknown: 0 };
    for (const st of states.values()) c[st.kind]++;
    return c;
  }

  function tallyText(f) {
    const c = tally(f);
    const total = (f.tickets || []).length;
    const parts = [`${c.done} of ${total} done`];
    if (c.active) parts.push(`${c.active} in progress`);
    if (c.ready) parts.push(`${c.ready} ready`);
    if (c.waiting) parts.push(`${c.waiting} waiting`);
    if (c.blocked) parts.push(`${c.blocked} blocked`);
    if (c.unknown) parts.push(`${c.unknown} unknown`);
    return parts.join(" · ");
  }

  /* Status glyphs: shape carries meaning, colour reinforces it. */
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
      case "blocked":
        s.append(svgEl("circle", { cx: 8, cy: 8, r: 7, class: "g-fill" }),
          svgEl("path", { d: "M4.8 8h6.4", class: "g-knock" }));
        break;
      default:
        s.append(ring(" g-dash"), svgEl("circle", { cx: 8, cy: 8, r: 1.6, class: "g-fill" }));
    }
    return s;
  }

  function progressLine(f, cls = "") {
    const { states } = featureIndex(f);
    const tickets = f.tickets || [];
    return el("div", {
      class: `progress ${cls}`.trim(), role: "img", "aria-label": tallyText(f),
    }, tickets.map((t) => el("i", { "data-kind": states.get(key(t.n)).kind })));
  }

  /* ---------- hash ---------- */

  function readHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    if (!raw) return null;
    const parts = raw.split("/").filter(Boolean);
    const tab = parts[0];
    if (tab === "context") return { tab, entry: entryForPath(S.tree?.context?.path) };
    if (tab === "architecture") {
      const rec = (S.tree?.architecture || []).find((a) => a.slug === parts[1]);
      return { tab, entry: rec ? entryForPath(rec.path) : null };
    }
    if (tab === "features") {
      const f = featureBySlug(parts[1]);
      if (!f) return { tab, entry: null };
      if (parts[2] && /^\d+$/.test(parts[2])) {
        const tk = (f.tickets || []).find((x) => key(x.n) === key(parts[2]));
        return { tab, entry: tk ? entryForPath(tk.path) : null };
      }
      return { tab, entry: f.specPath ? entryForPath(f.specPath) : null };
    }
    return null;
  }

  function writeHash(entry) {
    if (!entry) return writeTabHash(S.tab);
    let h = `#/${entry.tab}`;
    if (entry.kind === "arch") h += `/${entry.record.slug}`;
    if (entry.kind === "spec") h += `/${entry.feature.slug}`;
    if (entry.kind === "ticket") h += `/${entry.feature.slug}/${entry.ticket.n}`;
    history.replaceState(null, "", h);
  }

  function writeTabHash(tab) {
    history.replaceState(null, "", `#/${tab}`);
  }

  function firstSpec() {
    const f = (S.tree?.features || []).find((x) => x.specPath);
    return f ? entryForPath(f.specPath) : null;
  }

  function defaultEntry() {
    const t = S.tree;
    if (!t) return null;
    const spec = firstSpec();
    if (spec) return spec;
    const a = (t.architecture || [])[0];
    if (a) return entryForPath(a.path);
    if (t.context?.exists) return entryForPath(t.context.path);
    return null;
  }

  /* ---------- data ---------- */

  function treeSignature(tree) {
    if (!tree) return "";
    return JSON.stringify((tree.features || []).map((f) => [
      f.slug,
      f.progress.done,
      f.progress.total,
      (f.tickets || []).map((t) => [t.n, t.status, t.statusRaw, t.title, t.blockedBy.join(",")]),
    ]));
  }

  async function refreshTree() {
    const prev = S.tree;
    try {
      S.tree = await api("/api/tree");
      setLive("up");
    } catch {
      setLive("down");
      if (!S.tree) S.tree = { ok: false, features: [], architecture: [], context: { exists: false }, diagnostics: [] };
      return false;
    }

    if (prev) {
      const finished = [];
      for (const f of S.tree.features || []) {
        const old = (prev.features || []).find((x) => x.slug === f.slug);
        for (const t of f.tickets || []) {
          const before = old?.tickets?.find((x) => x.path === t.path);
          if (before && before.status !== "done" && t.status === "done") {
            S.justDone.add(t.path);
            finished.push(t);
          }
        }
      }
      if (finished.length === 1) toast(`Done · ${num(finished[0].n)} ${finished[0].title}`);
      else if (finished.length > 1) toast(`${finished.length} tickets done · ${finished.map((t) => num(t.n)).join(", ")}`);
      if (S.justDone.size) {
        setTimeout(() => { S.justDone.clear(); }, 2400);
      }
    }
    return true;
  }

  async function loadEntry(entry, opts = {}) {
    if (!entry) {
      S.doc = null;
      S.mdError = null;
      render();
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
    render();
    if (opts.keepScroll) {
      scroller.style.scrollBehavior = "auto";
      scroller.scrollTop = top;
      requestAnimationFrame(() => { scroller.style.scrollBehavior = ""; });
    } else {
      scroller.scrollTop = 0;
      // Single column: the page scrolls, not the article pane. Opening an entry
      // from the rail, graph or list brings the document into view.
      if (narrow()) {
        const top = Math.max(0, window.scrollY + article.getBoundingClientRect().top - 64);
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        window.scrollTo({ top, behavior });
      }
    }
    if (!opts.silent) writeHash(entry);
  }

  const open = (path) => loadEntry(entryForPath(path));

  /* ---------- markdown ---------- */

  function stripDangerous(html) {
    return html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<(iframe|object|embed|link|meta|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/javascript:/gi, "");
  }

  function mdToNodes(md) {
    const raw = window.marked.parse(md, { gfm: true, breaks: false });
    const holder = document.createElement("div");
    holder.innerHTML = stripDangerous(raw);
    const used = new Set();
    holder.querySelectorAll("h1, h2, h3").forEach((h) => {
      const base = slug(h.textContent) || "section";
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      h.id = id;
    });
    return holder;
  }

  /* ---------- rail ---------- */

  function docTitle() {
    if (!S.doc) return "desk";
    if (S.doc.kind === "spec") return S.doc.feature.title;
    if (S.doc.kind === "ticket") return `${num(S.doc.ticket.n)} ${S.doc.ticket.title}`;
    return S.doc.title;
  }

  function row({ label, lead, sub, active, path, onClick, cls = "" }) {
    const b = el("button", {
      type: "button",
      class: `row ${cls}`.trim(),
      "aria-current": active ? "true" : "false",
      onclick: onClick,
    }, [
      lead || null,
      el("span", { class: "row-label" }, [label]),
      sub ? el("span", { class: "row-sub" }, [sub]) : null,
    ]);
    if (path) b.dataset.path = path;
    return el("li", {}, [b]);
  }

  function ticketRow(f, tk) {
    const st = featureIndex(f).states.get(key(tk.n));
    const done = S.justDone.has(tk.path);
    const dot = el("i", {
      class: `dot${done ? " just-done" : ""}`,
      "data-status": tk.status,
      "data-kind": st.kind,
    }, [glyph(st.kind, 12)]);
    const li = row({
      cls: "row-ticket",
      lead: el("span", { class: "row-lead" }, [dot, el("span", { class: "row-n" }, [num(tk.n)])]),
      label: tk.title,
      active: S.doc?.path === tk.path,
      path: tk.path,
      onClick: () => open(tk.path),
    });
    li.firstChild.title = `${shortState(st)} · Status: ${tk.statusRaw}`;
    return li;
  }

  function featureGroup(f) {
    const isOpen = S.doc?.feature?.slug === f.slug;
    const total = (f.tickets || []).length;
    const head = el("button", {
      type: "button",
      class: "feature-row",
      "aria-expanded": String(isOpen),
      onclick: () => (f.specPath ? open(f.specPath) : loadEntry(null)),
    }, [
      el("span", { class: "feature-title" }, [f.title]),
      el("span", { class: "feature-count", title: tallyText(f) }, [total ? `${f.progress.done}/${total}` : "—"]),
    ]);
    const kids = [head];
    if (total) kids.push(progressLine(f, "progress-rail"));
    if (isOpen) {
      const list = [];
      if (f.specPath) {
        list.push(row({
          cls: "row-spec",
          lead: el("span", { class: "row-lead" }, [el("span", { class: "row-n" }, ["spec"])]),
          label: "Overview",
          active: S.doc?.kind === "spec",
          path: f.specPath,
          onClick: () => open(f.specPath),
        }));
      }
      for (const tk of f.tickets || []) list.push(ticketRow(f, tk));
      kids.push(el("ul", { class: "tree" }, list));
    }
    return el("li", { class: `feature${isOpen ? " is-open" : ""}` }, kids);
  }

  function docList() {
    const t = S.tree || {};
    if (S.tab === "context") {
      if (!t.context?.exists) return null;
      return el("ul", { class: "tree" }, [row({
        label: "Glossary",
        sub: "CONTEXT.md",
        active: S.doc?.path === t.context.path,
        path: t.context.path,
        onClick: () => open(t.context.path),
      })]);
    }
    if (S.tab === "architecture") {
      if (!(t.architecture || []).length) return null;
      return el("ul", { class: "tree" }, t.architecture.map((r) => row({
        label: r.title,
        active: S.doc?.path === r.path,
        path: r.path,
        onClick: () => open(r.path),
      })));
    }
    if (!(t.features || []).length) return null;
    return el("ul", { class: "features" }, t.features.map(featureGroup));
  }

  const cmd = (s) => el("code", {}, [s]);

  function emptyListHint() {
    if (S.tab === "context") {
      return el("p", { class: "empty" }, ["No glossary yet. Run ", cmd("/setup-desk"), " to create ", cmd("CONTEXT.md"), "."]);
    }
    if (S.tab === "architecture") {
      return el("p", { class: "empty" }, ["No records yet. Run ", cmd("/setup-desk"), " to create them, or ", cmd("/update-arch"), " after a change."]);
    }
    return el("p", { class: "empty" }, ["No features yet. Run ", cmd("/to-spec"), " to write a spec, then ", cmd("/to-tickets"), " to split it into tickets."]);
  }

  function diagnostics() {
    const ds = [...(S.tree?.diagnostics || [])];
    if (S.mdError && S.doc) {
      ds.unshift({ severity: "error", path: S.doc.path, message: `could not render markdown: ${S.mdError}` });
    }
    return ds;
  }

  function diagnosticBlock() {
    const ds = diagnostics();
    if (!ds.length) return null;
    const errors = ds.filter((d) => d.severity === "error").length;
    const warns = ds.length - errors;
    const summary = [errors ? plural(errors, "error") : null, warns ? plural(warns, "warning") : null].filter(Boolean).join(", ");
    return el("details", { class: "diagnostics", open: errors ? "" : null, "data-worst": errors ? "error" : "warn" }, [
      el("summary", {}, [
        el("span", { class: "diag-title" }, ["Workspace check"]),
        el("span", { class: "diag-count" }, [summary]),
      ]),
      el("ul", {}, ds.map((d) => {
        const target = entryForPath(d.path);
        return el("li", { "data-severity": d.severity || "warn" }, [
          el("span", { class: "severity" }, [d.severity === "error" ? "Error" : "Warning"]),
          el("span", { class: "diag-msg" }, [d.message.charAt(0).toUpperCase() + d.message.slice(1)]),
          target
            ? el("button", { type: "button", class: "where", onclick: () => loadEntry(target) }, [d.path])
            : el("span", { class: "where" }, [d.path]),
        ]);
      })),
      el("p", { class: "diag-hint" }, ["Fix the file and this updates by itself. ", cmd("desk check"), " prints the same list."]),
    ]);
  }

  function revealActive() {
    if (getComputedStyle(rail).overflowY !== "auto") return; // single column: rail does not scroll
    const all = rail.querySelectorAll('button[aria-current="true"]');
    const b = all[all.length - 1];
    if (!b) return;
    const rr = rail.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    if (br.top < rr.top + 8 || br.bottom > rr.bottom - 8) {
      b.scrollIntoView({ block: "nearest" });
    }
  }

  function renderRail() {
    rail.textContent = "";
    const label = S.tab === "context" ? "Context" : S.tab === "architecture" ? "Architecture" : "Features";
    const list = docList();
    rail.append(el("nav", { class: "rail-block", "aria-label": label }, [
      el("p", { class: "eyebrow" }, [label]),
      list || emptyListHint(),
    ]));
    const diag = diagnosticBlock();
    if (diag) rail.append(diag);
    requestAnimationFrame(revealActive);
  }

  /* ---------- ticket graph ----------
   * Layered left → right: a ticket's column is its longest blocker chain.
   * Adjacent dependencies turn in the gutter between their columns; edges that
   * skip columns travel on a labeled bus below the graph. No line ever crosses
   * a ticket card, so the SVG can never sit on top of node text.
   *
   * The layout adapts to the panel: each column is only as wide as its titles
   * need, gaps absorb spare width, and row spacing grows with panel height. */

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

  function graphNode(f, it, L) {
    const t = it.t;
    const st = featureIndex(f).states.get(it.id);
    const done = S.justDone.has(t.path);
    const deps = featureIndex(f).dependents.get(it.id) || [];
    const spoken = [
      `${num(t.n)}: ${t.title}.`,
      shortState(st) + ".",
      t.blockedBy.length ? `After ${t.blockedBy.join(", ")}.` : "No blockers.",
      deps.length ? `Unblocks ${deps.map((d) => num(d.n)).join(", ")}.` : "",
    ].join(" ");
    return el("button", {
      type: "button",
      class: `node${S.doc?.path === t.path ? " is-active" : ""}${done ? " just-done" : ""}`,
      "data-status": t.status,
      "data-kind": st.kind,
      "data-key": it.id,
      "data-path": t.path,
      "data-layer": String(it.layer),
      style: `left:${L.colX[it.layer]}px;top:${it.y - it.h / 2}px;width:${L.colW[it.layer]}px;height:${it.h}px`,
      title: t.title,
      "aria-label": spoken,
      onclick: () => open(t.path),
    }, [
      el("span", { class: "node-top" }, [
        el("span", { class: `node-glyph${done ? " node-check" : ""}` }, [glyph(st.kind, 14)]),
        el("span", { class: "node-n" }, [num(t.n)]),
        el("span", { class: "node-state" }, [st.kind === "waiting" && st.open.length === 1 ? shortState(st) : KIND_LABEL[st.kind]]),
      ]),
      el("span", { class: "node-title" }, [t.title]),
    ]);
  }

  function graphSvg(L) {
    const svg = svgEl("svg", {
      width: L.Wtot, height: L.H, viewBox: `0 0 ${L.Wtot} ${L.H}`, "aria-hidden": "true",
    });
    const defs = svgEl("defs");
    for (const id of ["arrow-open", "arrow-done", "arrow-lit"]) {
      defs.append(svgEl("marker", {
        id, class: id, viewBox: "0 0 8 8", refX: "7.5", refY: "4",
        markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse", orient: "auto",
      }, [svgEl("path", { d: "M0,0.6 L7.5,4 L0,7.4 Z" })]));
    }
    svg.append(defs);
    // Satisfied edges first so open ones draw on top.
    const sorted = [...L.edges].sort((a, b) => Number(b.done) - Number(a.done));
    for (const e of sorted) {
      svg.append(svgEl("path", {
        class: "edge",
        "data-from": e.from,
        "data-to": e.to,
        "data-state": e.done ? "done" : "open",
        d: e.d,
        "marker-end": `url(#${e.done ? "arrow-done" : "arrow-open"})`,
      }));
    }
    for (const e of L.edges) {
      if (!e.label) continue;
      svg.append(svgEl("text", {
        class: "edge-label", x: e.label.x, y: e.label.y, "text-anchor": "middle",
      }, [document.createTextNode(e.label.text)]));
    }
    return svg;
  }

  function lightEdges(canvas, k) {
    canvas.classList.toggle("is-tracing", Boolean(k));
    canvas.querySelectorAll(".edge").forEach((p) => {
      const lit = Boolean(k) && (p.dataset.from === k || p.dataset.to === k);
      p.classList.toggle("is-lit", lit);
      p.setAttribute("marker-end", `url(#${lit ? "arrow-lit" : p.dataset.state === "done" ? "arrow-done" : "arrow-open"})`);
    });
    canvas.querySelectorAll(".node").forEach((n) => {
      const near = k && (n.dataset.key === k || canvas.querySelector(`.edge.is-lit[data-from="${n.dataset.key}"], .edge.is-lit[data-to="${n.dataset.key}"]`));
      n.classList.toggle("is-near", Boolean(near));
    });
  }

  // Arrow keys walk the graph: ←/→ follow dependencies, ↑/↓ move within a column.
  function graphKeys(ev, L) {
    const node = ev.target.closest?.(".node");
    if (!node) return;
    const it = L.items.get(node.dataset.key);
    const nodesIn = (layer) => (L.layers[layer] || []).filter((x) => !x.dummy);
    const nearest = (list) => list.filter(Boolean).sort((a, b) => Math.abs(a.y - it.y) - Math.abs(b.y - it.y))[0];
    let next = null;
    if (ev.key === "ArrowRight") next = nearest(L.edges.filter((e) => e.from === it.id).map((e) => L.items.get(e.to)));
    else if (ev.key === "ArrowLeft") next = nearest(L.edges.filter((e) => e.to === it.id).map((e) => L.items.get(e.from)));
    else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      const col = nodesIn(it.layer);
      next = col[col.indexOf(it) + (ev.key === "ArrowDown" ? 1 : -1)];
    } else return;
    ev.preventDefault();
    if (next) node.parentElement.querySelector(`.node[data-key="${next.id}"]`)?.focus();
  }

  // Phone: the same graph as an ordered list, indented by column.
  function graphList(f, L) {
    const { states } = featureIndex(f);
    const items = L.layers.flatMap((l) => l.filter((it) => !it.dummy));
    return el("ol", { class: "graph-list" }, items.map((it) => {
      const t = it.t;
      const st = states.get(it.id);
      const after = t.blockedBy.length && st.kind !== "waiting" ? ` · after ${t.blockedBy.map((b) => num(b)).join(", ")}` : "";
      return el("li", { style: `--depth:${Math.min(it.layer, 4)}` }, [
        el("button", {
          type: "button",
          class: `list-node${S.justDone.has(t.path) ? " just-done" : ""}`,
          "data-kind": st.kind,
          "data-key": it.id,
          "data-path": t.path,
          onclick: () => open(t.path),
        }, [
          el("span", { class: `node-glyph${S.justDone.has(t.path) ? " node-check" : ""}` }, [glyph(st.kind, 14)]),
          el("span", { class: "list-body" }, [
            el("span", { class: "list-title" }, [el("span", { class: "node-n" }, [num(t.n)]), " ", t.title]),
            el("span", { class: "list-sub" }, [shortState(st) + after]),
          ]),
        ]),
      ]);
    }));
  }

  function graphBlock(feature) {
    const tickets = feature.tickets || [];
    if (!tickets.length) {
      graphPanel.dataset.overflow = "false";
      graphPanel.dataset.atEnd = "true";
      return el("div", { class: "graph graph-empty" }, [
        el("p", {}, [
          "No tickets yet. Run ", cmd("/to-tickets"), ", or add one with ",
          cmd(`desk add ${feature.slug} --title "…"`), ".",
        ]),
      ]);
    }

    const cs = getComputedStyle(graphBody);
    const availW = Math.max(360, graphBody.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const availH = Math.max(220, graphBody.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 6);
    const L = layoutGraph(tickets, availW, availH);
    const canvas = el("div", { class: "graph-canvas", style: `width:${L.Wtot}px;height:${L.H}px` }, [
      graphSvg(L),
      ...L.layers.flatMap((l) => l.filter((it) => !it.dummy)).map((it) => graphNode(feature, it, L)),
    ]);
    canvas.style.marginLeft = `${Math.max(0, Math.round((availW - L.Wtot) / 2))}px`;
    canvas.style.marginTop = `${Math.max(0, Math.round((availH - L.H) / 2))}px`;

    const trace = (ev) => {
      const n = ev.target.closest?.(".node");
      lightEdges(canvas, n ? n.dataset.key : null);
    };
    canvas.addEventListener("mouseover", trace);
    canvas.addEventListener("focusin", trace);
    canvas.addEventListener("mouseleave", () => lightEdges(canvas, null));
    canvas.addEventListener("focusout", (ev) => { if (!canvas.contains(ev.relatedTarget)) lightEdges(canvas, null); });
    canvas.addEventListener("keydown", (ev) => graphKeys(ev, L));

    const scroll = el("div", { class: "graph-scroll", tabindex: "-1" }, [canvas]);

    const notes = [];
    if (L.back.length) {
      notes.push(el("span", { class: "graph-warn" }, [
        `Dependency cycle: ${L.back.map((e) => `${num(e.to)} → ${num(e.from)}`).join(", ")} is not drawn. See Workspace check.`,
      ]));
    }

    const block = el("div", { class: "graph", "aria-label": "Ticket dependency graph" }, [
      scroll,
      graphList(feature, L),
      ...(notes.length ? [el("p", { class: "graph-note" }, notes)] : []),
    ]);

    const measure = () => {
      const over = scroll.scrollWidth > scroll.clientWidth + 2;
      graphPanel.dataset.overflow = String(over);
      graphPanel.dataset.atEnd = String(scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 2);
    };
    scroll.addEventListener("scroll", measure, { passive: true });
    new ResizeObserver(measure).observe(scroll);
    return block;
  }

  /* ---------- graph panel ----------
   * The graph sits above the document, split like an IDE editor and terminal.
   * Opening a ticket swaps the document only; the graph keeps its layout and
   * scroll, and simply marks the node you are reading. */

  function graphSignature(f) {
    return JSON.stringify([
      f.slug,
      f.tickets.map((t) => [t.n, t.title, t.status, t.blockedBy.join(","), S.justDone.has(t.path)]),
    ]);
  }

  function updateGraphActive() {
    const path = S.doc?.kind === "ticket" ? S.doc.path : null;
    graphBody.querySelectorAll(".node, .list-node").forEach((n) => {
      const on = Boolean(path) && n.dataset.path === path;
      n.classList.toggle("is-active", on);
      if (on) n.setAttribute("aria-current", "true");
      else n.removeAttribute("aria-current");
    });
  }

  function renderGraph(force = false) {
    const f = S.doc && (S.doc.kind === "spec" || S.doc.kind === "ticket") ? S.doc.feature : null;
    if (!f) {
      graphPanel.hidden = true;
      work.dataset.panel = "off";
      S.graphSig = "";
      applyPanelChrome();
      return;
    }
    // Coming back from a non-graph tab may mean the window was resized while
    // the panel was hidden, so rebuild once even when the data is unchanged.
    const wasOn = work.dataset.panel === "on";
    graphPanel.hidden = false;
    work.dataset.panel = "on";
    applyPanelChrome();

    const sig = graphSignature(f);
    if (!force && wasOn && sig === S.graphSig) {
      updateGraphActive();
      return;
    }
    S.graphSig = sig;
    graphTally.textContent = tallyText(f);
    const before = graphBody.querySelector(".graph-scroll");
    const left = before ? before.scrollLeft : 0;
    const top = graphBody.scrollTop;
    graphBody.replaceChildren(graphBlock(f));
    requestAnimationFrame(() => {
      const after = graphBody.querySelector(".graph-scroll");
      if (after) after.scrollLeft = left;
      graphBody.scrollTop = top;
    });
    updateGraphActive();
  }

  const PANEL_KEY = "desk.panel";

  function readPanel() {
    try { return JSON.parse(localStorage.getItem(PANEL_KEY) || "{}"); } catch { return {}; }
  }

  function writePanel(patch) {
    try { localStorage.setItem(PANEL_KEY, JSON.stringify({ ...readPanel(), ...patch })); } catch { /* private mode */ }
  }

  const panelCollapsed = () => work.dataset.collapsed === "true";

  function applyPanelChrome() {
    const off = work.dataset.panel === "off";
    panelToggle.hidden = off;
    panelSplit.hidden = off || panelCollapsed();
    panelToggle.textContent = panelCollapsed() ? "Show" : "Hide";
    panelToggle.setAttribute("aria-expanded", String(!panelCollapsed()));
  }

  let reflowTimer = null;

  function reflowGraph() {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => {
      if (work.dataset.panel === "on") renderGraph(true);
    }, 90);
  }

  function setPanelHeight(h) {
    const max = Math.max(160, work.clientHeight - 44);
    const px = Math.round(clamp(h, 120, max));
    work.style.setProperty("--panel-h", `${px}px`);
    panelSplit.setAttribute("aria-valuenow", String(px));
    writePanel({ h: px });
    reflowGraph();
  }

  const RAIL_KEY = "desk.rail";

  function railRange() {
    return [220, Math.min(560, Math.round(window.innerWidth * 0.45))];
  }

  function setRailWidth(w, persist = true) {
    const [lo, hi] = railRange();
    const px = Math.round(clamp(w, lo, hi));
    viewport.style.setProperty("--rail", `${px}px`);
    railSplit.setAttribute("aria-valuenow", String(px));
    if (persist) {
      try { localStorage.setItem(RAIL_KEY, String(px)); } catch { /* private mode */ }
    }
    reflowGraph();
  }

  function initRailSplit() {
    let saved = 0;
    try { saved = Number(localStorage.getItem(RAIL_KEY)) || 0; } catch { /* private mode */ }
    if (saved) {
      const [lo, hi] = railRange();
      const px = Math.round(clamp(saved, lo, hi));
      viewport.style.setProperty("--rail", `${px}px`);
      railSplit.setAttribute("aria-valuenow", String(px));
    }

    let drag = null;
    railSplit.addEventListener("pointerdown", (ev) => {
      drag = ev.pointerId;
      railSplit.setPointerCapture(ev.pointerId);
      railSplit.classList.add("is-active");
      document.body.classList.add("is-resizing-x");
      ev.preventDefault();
    });
    railSplit.addEventListener("pointermove", (ev) => {
      if (drag !== ev.pointerId) return;
      setRailWidth(ev.clientX - viewport.getBoundingClientRect().left);
    });
    const end = (ev) => {
      if (drag !== ev.pointerId) return;
      drag = null;
      railSplit.classList.remove("is-active");
      document.body.classList.remove("is-resizing-x");
      reflowGraph();
    };
    railSplit.addEventListener("pointerup", end);
    railSplit.addEventListener("pointercancel", end);
    railSplit.addEventListener("dblclick", () => setRailWidth(320));
    railSplit.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      const now = parseFloat(getComputedStyle(viewport).getPropertyValue("--rail")) || 320;
      setRailWidth(now + (ev.key === "ArrowRight" ? 16 : -16));
    });
  }

  function initPanel() {
    const saved = readPanel();
    if (Number.isFinite(saved.h)) {
      const max = Math.max(160, work.clientHeight - 44);
      const h = Math.round(narrow() ? saved.h : clamp(saved.h, 120, max));
      work.style.setProperty("--panel-h", `${h}px`);
      panelSplit.setAttribute("aria-valuenow", String(h));
    }
    if (saved.collapsed) work.dataset.collapsed = "true";
    applyPanelChrome();

    panelToggle.addEventListener("click", () => {
      const next = !panelCollapsed();
      work.dataset.collapsed = String(next);
      writePanel({ collapsed: next });
      applyPanelChrome();
      if (!next) renderGraph(true);
    });

    let drag = null;
    panelSplit.addEventListener("pointerdown", (ev) => {
      if (panelCollapsed()) return;
      drag = ev.pointerId;
      panelSplit.setPointerCapture(ev.pointerId);
      panelSplit.classList.add("is-active");
      document.body.classList.add("is-resizing");
      ev.preventDefault();
    });
    panelSplit.addEventListener("pointermove", (ev) => {
      if (drag !== ev.pointerId) return;
      setPanelHeight(ev.clientY - work.getBoundingClientRect().top);
    });
    const end = (ev) => {
      if (drag !== ev.pointerId) return;
      drag = null;
      panelSplit.classList.remove("is-active");
      document.body.classList.remove("is-resizing");
      reflowGraph();
    };
    panelSplit.addEventListener("pointerup", end);
    panelSplit.addEventListener("pointercancel", end);
    panelSplit.addEventListener("dblclick", () => setPanelHeight(Math.round(window.innerHeight * 0.48)));
    panelSplit.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
      ev.preventDefault();
      const h = graphPanel.getBoundingClientRect().height || 380;
      setPanelHeight(h + (ev.key === "ArrowDown" ? 24 : -24));
    });

    let timer = null;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!narrow()) {
          const h = parseFloat(work.style.getPropertyValue("--panel-h"));
          if (h > work.clientHeight - 44) setPanelHeight(work.clientHeight - 44);
        }
        applyPanelChrome();
        if (work.dataset.panel === "on") renderGraph(true);
      }, 180);
    });
  }

  /* ---------- article ---------- */

  function emptyArticle() {
    const page = (title, ...kids) => [el("h1", {}, [title]), el("p", { class: "empty" }, kids)];
    if (!S.tree || S.tree.ok === false) {
      return page("No workspace found", "There is no ", cmd(".desk/"), " directory here. Run ", cmd("/setup-desk"), " in this project; the page picks it up on its own.");
    }
    if (S.tab === "context") {
      return page("No glossary yet", "Run ", cmd("/setup-desk"), " to create ", cmd("CONTEXT.md"), " with the project's domain terms.");
    }
    if (S.tab === "architecture") {
      return page("No architecture records yet", "Run ", cmd("/setup-desk"), " to write records for the existing code, or ", cmd("/update-arch"), " after a change.");
    }
    if ((S.tree?.features || []).length) {
      return page("This feature has no spec", "Run ", cmd("/to-spec"), " to write one, then ", cmd("/to-tickets"), " to split it into tickets.");
    }
    return page("No features yet", "Run ", cmd("/to-spec"), " to write a spec, then ", cmd("/to-tickets"), " to split it into tickets.");
  }

  async function act(feature, n, body, button) {
    const group = button?.closest(".actions");
    const label = button?.textContent;
    group?.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    if (button) button.textContent = "Saving…";
    try {
      const res = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature, n, ...body }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `request failed (${res.status})`);
      scheduleRefresh();
    } catch (err) {
      group?.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      if (button) button.textContent = label;
      toast(`Could not save · ${String(err?.message || err)}`);
    }
  }

  function ticketLink(t, f) {
    const st = t.missing ? { kind: "unknown" } : featureIndex(f).states.get(key(t.n));
    const label = [el("span", { class: "link-n" }, [num(t.n)]), " ", t.missing ? "does not exist" : t.title];
    return t.missing
      ? el("span", { class: "tlink is-missing" }, [glyph("unknown", 12), ...label])
      : el("a", {
        class: "tlink", href: `#/features/${f.slug}/${t.n}`,
        title: `${KIND_LABEL[st.kind]} · Status: ${t.statusRaw}`,
      }, [glyph(st.kind, 12), ...label]);
  }

  const joinLinks = (list, f) => list.flatMap((t, i) => (i ? [el("span", { class: "sep" }, ["·"]), ticketLink(t, f)] : [ticketLink(t, f)]));

  // One sentence that says what the state means for the reader.
  function stateSentence(st, tk, f) {
    switch (st.kind) {
      case "done": return ["Completed."];
      case "active": return ["Someone is working on this now."];
      case "ready": return [tk.blockedBy.length ? "Unblocked — ready to start." : "No blockers — ready to start."];
      case "waiting": return [`Can start once ${st.open.length === 1 ? "its blocker is" : `${st.open.length} blockers are`} done.`];
      case "blocked": return ["The ticket file marks this as blocked."];
      default: return [`The status "${tk.statusRaw}" is not one the page knows. Use pending, in-progress, done, or blocked.`];
    }
  }

  function ticketHeader(doc) {
    const f = doc.feature;
    const tk = doc.ticket;
    const idx = featureIndex(f);
    const st = idx.states.get(key(tk.n));
    const deps = idx.dependents.get(key(tk.n)) || [];
    const tickets = f.tickets || [];
    const i = tickets.findIndex((x) => x.path === tk.path);
    const prev = tickets[i - 1];
    const next = tickets[i + 1];

    const crumbs = el("nav", { class: "crumbs", "aria-label": "Ticket location" }, [
      f.specPath
        ? el("a", { class: "crumb-back", href: `#/features/${f.slug}`, title: "Back to the overview" }, [
          el("span", { "aria-hidden": "true" }, ["← "]), f.title,
        ])
        : el("span", {}, [f.title]),
      el("span", { class: "crumb-here" }, [`Ticket ${num(tk.n)} of ${num(tickets.length)}`]),
      el("span", { class: "crumb-step" }, [
        prev ? el("a", { href: `#/features/${f.slug}/${prev.n}`, title: `Previous: ${prev.title}`, "aria-label": `Previous ticket, ${num(prev.n)}` }, [`‹ ${num(prev.n)}`]) : null,
        next ? el("a", { href: `#/features/${f.slug}/${next.n}`, title: `Next: ${next.title}`, "aria-label": `Next ticket, ${num(next.n)}` }, [`${num(next.n)} ›`]) : null,
      ]),
    ]);

    const feature = f.slug;
    const button = (label, cls, body) => el("button", {
      type: "button", class: `action ${cls}`,
      onclick: (ev) => act(feature, tk.n, body, ev.currentTarget),
    }, [label]);
    const actions = [];
    if (st.kind === "done") actions.push(button("Reopen", "action-secondary", { status: "pending" }));
    else if (st.kind === "active") actions.push(button("Mark done", "action-primary", { action: "complete" }));
    else actions.push(button("Start", "action-primary", { status: "in-progress" }), button("Mark done", "action-secondary", { action: "complete" }));

    const relations = [];
    if (st.blockers.length) {
      relations.push(el("div", { class: "rel" }, [
        el("dt", {}, ["Depends on"]),
        el("dd", {}, joinLinks(st.blockers, f)),
      ]));
    }
    if (deps.length) {
      relations.push(el("div", { class: "rel" }, [
        el("dt", {}, ["Unblocks"]),
        el("dd", {}, joinLinks(deps, f)),
      ]));
    }

    const fileName = tk.path.split("/").pop();
    const status = el("section", { class: "status", "data-kind": st.kind, "aria-label": "Ticket status" }, [
      el("div", { class: "status-main" }, [
        el("p", { class: "status-line" }, [
          el("span", { class: `status-glyph${S.justDone.has(tk.path) ? " node-check" : ""}` }, [glyph(st.kind, 18)]),
          el("strong", { class: "status-word" }, [KIND_LABEL[st.kind]]),
          el("span", { class: "status-raw", title: `As written in ${fileName}` }, [`Status: ${tk.statusRaw}`]),
        ]),
        el("p", { class: "status-say" }, stateSentence(st, tk, f)),
        relations.length ? el("dl", { class: "rels" }, relations) : null,
      ]),
      el("div", { class: "actions" }, actions),
    ]);

    return [crumbs, el("h1", {}, [tk.title]), status];
  }

  function nextUp(f) {
    const { states } = featureIndex(f);
    const tickets = f.tickets || [];
    const of = (kind) => tickets.filter((t) => states.get(key(t.n)).kind === kind);
    const total = tickets.length;
    if (!total) return ["No tickets yet."];
    const c = tally(f);
    if (c.done === total) return [`All ${plural(total, "ticket")} are done.`];
    const active = of("active");
    const ready = of("ready");
    const out = [];
    if (active.length) out.push(el("span", { class: "next-label" }, ["In progress"]), ...joinLinks(active, f));
    if (ready.length) {
      if (out.length) out.push(el("span", { class: "next-gap" }));
      out.push(el("span", { class: "next-label" }, [active.length ? "Ready next" : "Start with"]), ticketLink(ready[0], f));
      if (ready.length > 1) out.push(el("span", { class: "next-more" }, [`and ${ready.length - 1} more ready`]));
    }
    if (!out.length) return ["Nothing can start: every open ticket is waiting or blocked."];
    return out;
  }

  function specHeader(f) {
    const total = (f.tickets || []).length;
    return [
      el("p", { class: "eyebrow eyebrow-doc", title: `features/${f.slug}/spec.md` }, [
        "Feature", el("span", { class: "eyebrow-quiet" }, [` · ${plural(total, "ticket")}`]),
      ]),
      el("h1", {}, [f.title]),
      el("p", { class: "next" }, nextUp(f)),
    ];
  }

  function docEyebrow() {
    if (S.doc.kind === "arch") return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, ["Architecture record"]);
    if (S.doc.kind === "context") return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, ["Glossary"]);
    return null;
  }

  function articleMarkdown() {
    let md = S.doc?.md || "";
    if (S.doc?.kind === "arch") md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    if (S.doc?.kind !== "ticket") return md;
    // The ticket header carries these; do not repeat them in the body.
    return md.replace(/^[ \t]*(Status|Blocked by):.*$/gim, "").replace(/\n{3,}/g, "\n\n").trimStart();
  }

  function renderArticle() {
    article.textContent = "";
    S.mdError = null;
    article.dataset.kind = S.doc?.kind || "empty";

    if (!S.tree || S.tree.ok === false || !S.doc) {
      article.append(...emptyArticle());
      return;
    }

    let nodes;
    try {
      nodes = mdToNodes(articleMarkdown());
    } catch (err) {
      S.mdError = String(err?.message || err);
      nodes = document.createElement("div");
      nodes.append(
        el("p", { class: "parse-error" }, ["This document could not be rendered; showing its source instead."]),
        el("pre", {}, [el("code", {}, [S.doc.md])])
      );
    }

    const heading = nodes.querySelector("h1");
    if (heading) heading.remove();

    if (S.doc.kind === "ticket") article.append(...ticketHeader(S.doc));
    else if (S.doc.kind === "spec") {
      article.append(...specHeader(S.doc.feature));
    } else {
      const eb = docEyebrow();
      if (eb) article.append(eb);
      article.append(heading || el("h1", {}, [S.doc.title]));
    }

    const body = el("div", { class: "prose" });
    body.append(...nodes.childNodes);
    article.append(body);
  }

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

  /* ---------- live updates ---------- */

  function setLive(state) {
    live.dataset.state = state;
    live.title = state === "up"
      ? "Live: watching .desk. Changes made by you or an agent appear here on their own."
      : state === "stale"
        ? "Reconnecting to the local desk server."
        : "Offline: the local desk server is not reachable. Restart it with node page/serve.mjs.";
    const label = live.querySelector("span");
    if (label) label.textContent = state === "up" ? "Live" : state === "stale" ? "Reconnecting" : "Offline";
  }

  let flashTimer = null;
  function flashLive() {
    live.classList.remove("is-tick");
    void live.offsetWidth; // restart the animation
    live.classList.add("is-tick");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => live.classList.remove("is-tick"), 1400);
  }

  let toastTimer = null;
  function toast(text) {
    let node = document.querySelector(".toast");
    if (!node) {
      node = el("div", { class: "toast", role: "status", "aria-live": "polite" });
      document.body.append(node);
    }
    node.textContent = text;
    node.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("is-on"), 3200);
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const before = treeSignature(S.tree);
      if (!(await refreshTree())) return;
      const changed = before !== treeSignature(S.tree);

      if (!S.doc) {
        const entry = readHash()?.entry || defaultEntry();
        if (entry) await loadEntry(entry, { silent: true });
        else render();
        return;
      }
      const entry = entryForPath(S.doc.path);
      if (!entry) {
        await loadEntry(defaultEntry(), { silent: true });
        return;
      }
      await loadEntry(entry, { silent: true, keepScroll: true, force: changed || S.justDone.size > 0 });
      if (changed) renderRail();
    }, 120);
  }

  function connectEvents() {
    const es = new EventSource("/api/events");
    es.onopen = () => setLive("up");
    es.onerror = () => setLive("stale");
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "change") {
          flashLive();
          scheduleRefresh();
        }
      } catch { /* ignore malformed events */ }
    };
  }

  /* ---------- wiring ---------- */

  function entryForTab(tab, preferredFeature) {
    if (tab === "context") return entryForPath(S.tree?.context?.path);
    if (tab === "architecture") return entryForPath((S.tree?.architecture || [])[0]?.path);
    const f = featureBySlug(preferredFeature) || (S.tree?.features || []).find((x) => x.specPath);
    return f?.specPath ? entryForPath(f.specPath) : null;
  }

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

  boot();
})();
