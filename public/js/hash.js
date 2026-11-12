/* Shareable hash routes: read the URL, write the current entry. */

import {
  S, entryForPath, hashForEntry, issueBySlug, recordBySlug, key, defaultDocsEntry,
  docsEntryByTab, docsSection, firstOverviewEntry,
} from "./state.js";
import { decodeDocPath } from "./docs-path.js";

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
  if (tab === "overview") {
    const encoded = raw.slice("overview".length).replace(/^\//, "");
    const entry = encoded ? entryForPath(decodeDocPath(encoded)) : firstOverviewEntry();
    return { tab, entry: entry ? { ...entry, tab: "overview" } : firstOverviewEntry() };
  }
  if (tab === "glossary") return { tab, entry: S.tree?.glossary?.exists ? entryForPath("GLOSSARY.md") : null };
  if (tab === "map") {
    // The slug is the record path below map/, so module folders survive.
    const record = parts[1] ? recordBySlug(parts.slice(1).map(decodePart).join("/")) : null;
    if (record) return { tab, entry: entryForPath(record.path) };
    const first = (S.tree?.map?.records || [])[0];
    return { tab, entry: first ? entryForPath(first.path) : null };
  }
  if (tab === "issues") {
    // The Issues tab opens on the task graph, so the section route carries no
    // document; the caller loads the first spec behind the graph.
    if (!parts[1]) return { tab, entry: null };
    const issue = issueBySlug(decodePart(parts[1]));
    if (!issue) return { tab, entry: null };
    if (parts[2] === "research") return { tab, entry: issue.researchPath ? entryForPath(issue.researchPath) : null };
    if (parts[2] && /^\d+$/.test(parts[2])) {
      const task = (issue.tasks || []).find((item) => key(item.n) === key(parts[2]));
      return { tab, entry: task ? entryForPath(task.path) : null };
    }
    return { tab, entry: issue.specPath ? entryForPath(issue.specPath) : null };
  }
  return null;
}

function decodePart(part) {
  try { return decodeURIComponent(part); } catch { return part; }
}

function writeHash(entry) {
  if (!entry) return writeTabHash(S.tab);
  history.replaceState(null, "", hashForEntry(entry));
}

function writeTabHash(tab) {
  if (S.tree?.mode === "docs") {
    const section = docsSection(tab);
    const path = section && section.kind !== "overview" ? encodeURIComponent(tab) : "";
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

function entryForTab(tab) {
  if (S.tree?.mode === "docs") return docsEntryByTab(tab);
  if (tab === "overview") return firstOverviewEntry();
  if (tab === "glossary") return S.tree?.glossary?.exists ? entryForPath("GLOSSARY.md") : null;
  if (tab === "map") {
    const first = (S.tree?.map?.records || [])[0];
    return first ? entryForPath(first.path) : null;
  }
  const issue = (S.tree?.issues || []).find((item) => item.specPath) || (S.tree?.issues || [])[0];
  return issue?.specPath ? entryForPath(issue.specPath) : null;
}

export { readHash, writeHash, writeTabHash, defaultEntry, entryForTab };
