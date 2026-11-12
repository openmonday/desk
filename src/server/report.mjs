/* Startup and --check summaries, plus the startup file list. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const natural = (a, b) => collator.compare(a, b);

export function report(tree) {
  const issues = tree.issues.length;
  const tasks = tree.issues.reduce((n, issue) => n + issue.tasks.length, 0);
  const done = tree.issues.reduce((n, issue) => n + issue.progress.done, 0);
  const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
  return { issues, tasks, done, records: tree.map.records.length, errors, diagnostics: tree.diagnostics.length };
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

function contextPaths(tree) {
  if (tree.files?.children) {
    const paths = [];
    walkDocs(tree.files.children, paths);
    return paths;
  }
  const paths = [];
  if (tree.glossary?.exists) paths.push(tree.glossary.path);
  for (const record of tree.map?.records || []) paths.push(record.path);
  for (const issue of tree.issues || []) {
    if (issue.specPath) paths.push(issue.specPath);
    if (issue.researchPath) paths.push(issue.researchPath);
    for (const task of issue.tasks || []) paths.push(task.path);
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
  if (route === "#/glossary") return "GLOSSARY.md";
  if (route === "#/map") return null;
  let match = route.match(/^#\/map\/(.+)$/);
  if (match) return `map/${match[1].split("/").map(decodeSegment).join("/")}.md`;

  if (route === "#/issues") return null;
  match = route.match(/^#\/issues\/([^/]+)(?:\/(research|spec|\d+))?$/);
  if (match) {
    const slug = decodeSegment(match[1]);
    const issue = tree.issues?.find((item) => item.slug === slug);
    if (!issue) return null;
    if (match[2] === "research") return issue.researchPath;
    if (!match[2] || match[2] === "spec") return issue.specPath;
    const n = Number(match[2]);
    return issue.tasks?.find((task) => Number(task.n) === n)?.path || null;
  }

  return null;
}

/** Every Markdown file the scanner found, with the currently opened one marked. */
export function detectedFiles(tree, hash = "") {
  const paths = tree.mode === "docs" ? docsPaths(tree) : contextPaths(tree);
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
