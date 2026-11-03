/* Load the workspace tree and detect tickets that just completed. */

import { S, num } from "./state.js";
import { api } from "./api.js";
import { setLive, toast } from "./live.js";

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

export { refreshTree };
