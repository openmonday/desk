/* Shareable hash routes: read the URL, write the current entry. */

import { S, entryForPath, featureBySlug, key } from "./state.js";

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

function entryForTab(tab, preferredFeature) {
  if (tab === "context") return entryForPath(S.tree?.context?.path);
  if (tab === "architecture") return entryForPath((S.tree?.architecture || [])[0]?.path);
  const f = featureBySlug(preferredFeature) || (S.tree?.features || []).find((x) => x.specPath);
  return f?.specPath ? entryForPath(f.specPath) : null;
}

export { readHash, writeHash, writeTabHash, defaultEntry, entryForTab };
