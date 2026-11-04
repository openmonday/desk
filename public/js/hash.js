/* Shareable hash routes: read the URL, write the current entry. */

import {
  S, entryForPath, featureBySlug, key, defaultDocsEntry, docsEntryByTab,
  docsSection,
} from "./state.js";
import { decodeDocPath, encodeDocPath } from "./docs-path.js";

/* ---------- hash ---------- */

function readDocsHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (raw === "docs") {
    const entry = defaultDocsEntry();
    return { tab: entry?.tab || "", entry };
  }
  if (!raw.startsWith("docs/")) return null;
  const encoded = raw.slice("docs/".length);
  if (!encoded) {
    const entry = defaultDocsEntry();
    return { tab: entry?.tab || "", entry };
  }

  const path = decodeDocPath(encoded);
  const entry = entryForPath(path);
  if (entry) return { tab: entry.tab, entry };

  // A section URL is valid too; opening it lands on that section's first file.
  const section = docsSection(path);
  if (section) return { tab: section.key, entry: docsEntryByTab(section.key) };
  return null;
}

function readHash() {
  if (S.tree?.mode === "docs") return readDocsHash();
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
  if (S.tree?.mode === "docs") {
    history.replaceState(null, "", `#/docs/${encodeDocPath(entry.path)}`);
    return;
  }
  let h = `#/${entry.tab}`;
  if (entry.kind === "arch") h += `/${entry.record.slug}`;
  if (entry.kind === "spec") h += `/${entry.feature.slug}`;
  if (entry.kind === "ticket") h += `/${entry.feature.slug}/${entry.ticket.n}`;
  history.replaceState(null, "", h);
}

function writeTabHash(tab) {
  if (S.tree?.mode === "docs") {
    const section = docsSection(tab);
    const path = section && section.kind !== "overview" ? encodeDocPath(tab) : "";
    history.replaceState(null, "", path ? `#/docs/${path}` : "#/docs");
    return;
  }
  history.replaceState(null, "", `#/${tab}`);
}

function defaultEntry() {
  const t = S.tree;
  if (!t) return null;
  if (t.mode === "docs") return defaultDocsEntry();
  // Follow the selected tab, so a hidden section never wins by accident.
  return entryForTab(S.tab);
}

function entryForTab(tab, preferredFeature) {
  if (S.tree?.mode === "docs") return docsEntryByTab(tab);
  if (tab === "context") return entryForPath(S.tree?.context?.path);
  if (tab === "architecture") return entryForPath((S.tree?.architecture || [])[0]?.path);
  const f = featureBySlug(preferredFeature) || (S.tree?.features || []).find((x) => x.specPath);
  return f?.specPath ? entryForPath(f.specPath) : null;
}

export { readHash, writeHash, writeTabHash, defaultEntry, entryForTab };
