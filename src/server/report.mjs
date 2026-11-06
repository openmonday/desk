/* Startup and --check summaries, plus the startup file list. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const natural = (a, b) => collator.compare(a, b);

export function report(tree) {
  const features = tree.features.length;
  const tickets = tree.features.reduce((n, f) => n + f.tickets.length, 0);
  const done = tree.features.reduce((n, f) => n + f.progress.done, 0);
  const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
  return { features, tickets, done, architecture: tree.architecture.length, errors, diagnostics: tree.diagnostics.length };
}

/** The one-line startup and --check summary for docs mode. */
export function reportDocs(tree) {
  const sections = tree.sections.length;
  const docs = tree.sections.reduce((n, s) => n + s.count, 0);
  const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
  return { sections, docs, errors, diagnostics: tree.diagnostics.length };
}

function walkDocs(nodes, out) {
  for (const node of nodes || []) {
    if (node.type === "file") out.push(node.path);
    else walkDocs(node.children, out);
  }
}

function docsPaths(tree) {
  const paths = [];
  for (const section of tree.sections || []) walkDocs(section.tree, paths);
  return paths;
}

function deskPaths(tree) {
  if (tree.files?.children) {
    const paths = [];
    walkDocs(tree.files.children, paths);
    return paths;
  }
  const paths = [];
  if (tree.context?.exists) paths.push(tree.context.path);
  for (const record of tree.architecture || []) paths.push(record.path);
  for (const feature of tree.features || []) {
    if (feature.specPath) paths.push(feature.specPath);
    for (const ticket of feature.tickets || []) paths.push(ticket.path);
  }
  return paths;
}

function decodeSegment(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function activePath(tree, hash) {
  const route = String(hash || "").split("?")[0];
  if (!route) return null;

  if (tree.mode === "docs") {
    const match = route.match(/^#\/docs\/(.+)$/);
    return match ? match[1].split("/").map(decodeSegment).join("/") : null;
  }

  if (route.startsWith("#/overview/")) {
    return route.slice("#/overview/".length).split("/").map(decodeSegment).join("/");
  }
  if (route === "#/context") return "CONTEXT.md";
  let match = route.match(/^#\/architecture\/([^/]+)$/);
  if (match) return `architecture/${decodeSegment(match[1])}.md`;

  match = route.match(/^#\/features\/([^/]+)$/);
  if (match) {
    const slug = decodeSegment(match[1]);
    return tree.features?.find((feature) => feature.slug === slug)?.specPath || null;
  }

  match = route.match(/^#\/features\/([^/]+)\/(\d+)$/);
  if (match) {
    const slug = decodeSegment(match[1]);
    const n = Number(match[2]);
    const feature = tree.features?.find((item) => item.slug === slug);
    return feature?.tickets?.find((ticket) => Number(ticket.n) === n)?.path || null;
  }

  return null;
}

/** Every Markdown file the scanner found, with the currently opened one marked. */
export function detectedFiles(tree, hash = "") {
  const paths = tree.mode === "docs" ? docsPaths(tree) : deskPaths(tree);
  const opened = activePath(tree, hash);
  return [...new Set(paths)]
    .sort(natural)
    .map((path) => ({ path, opened: path === opened }));
}

function style(stream = process.stdout) {
  const enabled = process.env.FORCE_COLOR
    ? process.env.FORCE_COLOR !== "0"
    : !process.env.NO_COLOR && Boolean(stream.isTTY) && process.env.TERM !== "dumb";
  const wrap = (code, close) => (text) => (enabled ? `\u001b[${code}m${text}\u001b[${close}m` : String(text));
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    green: wrap(32, 39),
  };
}

/** The startup file list. Kept plain when stdout is not a terminal. */
export function formatFileList(tree, hash = "", stream = process.stdout) {
  const files = detectedFiles(tree, hash);
  const s = style(stream);
  const lines = [`${s.bold("Files")} ${s.dim(`(${files.length} detected)`)}`];

  if (!files.length) {
    lines.push(`  ${s.dim("(none)")}`);
    return lines.join("\n");
  }

  for (const file of files) {
    lines.push(file.opened
      ? `  ${s.green("●")} ${s.bold(file.path)}  ${s.green("opened")}`
      : `  ${s.dim("○")} ${file.path}`);
  }
  return lines.join("\n");
}
