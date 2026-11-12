/* Load the workspace tree and detect tasks that just completed. */

import { S, num } from "./state.js";
import { api } from "./api.js";
import { setLive, toast } from "./live.js";

function allIssues(tree) {
  return tree?.issues || [];
}

async function refreshTree() {
  const prev = S.tree;
  try {
    S.tree = await api("/api/tree");
    setLive("up");
  } catch {
    setLive("down");
    if (!S.tree) {
      S.tree = {
        ok: false, mode: "context", glossary: { exists: false }, map: { records: [] }, issues: [], diagnostics: [],
      };
    }
    return false;
  }

  if (prev) {
    const prevIssues = allIssues(prev);
    const finished = [];
    for (const issue of allIssues(S.tree)) {
      const old = prevIssues.find((x) => x.slug === issue.slug);
      for (const t of issue.tasks || []) {
        const before = old?.tasks?.find((x) => x.path === t.path);
        if (before && before.status !== "done" && t.status === "done") {
          S.justDone.add(t.path);
          finished.push(t);
        }
      }
    }
    if (finished.length === 1) toast(`Done · ${num(finished[0].n)} ${finished[0].title}`);
    else if (finished.length > 1) toast(`${finished.length} tasks done · ${finished.map((t) => num(t.n)).join(", ")}`);
    if (S.justDone.size) {
      setTimeout(() => { S.justDone.clear(); }, 2400);
    }
  }
  return true;
}

export { refreshTree };
