/* The one-line startup and --check summary. */
export function report(tree) {
  const features = tree.features.length;
  const tickets = tree.features.reduce((n, f) => n + f.tickets.length, 0);
  const done = tree.features.reduce((n, f) => n + f.progress.done, 0);
  const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
  return { features, tickets, done, arch: tree.architecture.length, errors, diagnostics: tree.diagnostics.length };
}
