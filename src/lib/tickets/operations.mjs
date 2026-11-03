/* The ticket mutation operations shared by the CLI and HTTP API. */
import fsp from "node:fs/promises";
import path from "node:path";
import { parseTicket } from "./parse.mjs";
import {
  badRequest, canonicalStatus, checkFeature, conflict, exists, nn, normalizeBlockedBy, normalizeN,
  notFound, slugify,
} from "./schema.mjs";
import {
  bodyBlock, headerBlock, setBlockedBy, setBody, setStatus, setTitle, tickBoxes,
} from "./format.mjs";
import { nextNumber, readTicketFile, result } from "./store.mjs";

export async function createTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const title = String(input.title ?? "").replace(/^\s*\d+\s*[:.\-–]\s*/, "").replace(/\s+/g, " ").trim();
  if (!title) throw badRequest("title is required");
  const status = input.status ? canonicalStatus(input.status) : "pending";
  const blockedBy = normalizeBlockedBy(input.blockedBy);

  const featureDir = path.join(workspace, "features", feature);
  if (!(await exists(featureDir))) throw notFound(`feature "${feature}" not found under features/`);
  const ticketsDir = path.join(featureDir, "tickets");
  await fsp.mkdir(ticketsDir, { recursive: true });

  const n = await nextNumber(ticketsDir);
  const file = path.join(ticketsDir, `${nn(n)}-${slugify(title)}.md`);
  const md = headerBlock(n, title, status, blockedBy) + bodyBlock(input.body ?? "");
  await fsp.writeFile(file, md, { flag: "wx" });
  return result(workspace, feature, n, "created");
}

export async function updateTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const n = normalizeN(input.n);
  const { file } = await readTicketFile(workspace, feature, n);

  let md = await fsp.readFile(file, "utf8");
  let changed = false;
  if (input.title != null) { md = setTitle(md, input.title, n); changed = true; }
  if (input.status != null) { md = setStatus(md, canonicalStatus(input.status)); changed = true; }
  if (input.blockedBy != null) { md = setBlockedBy(md, normalizeBlockedBy(input.blockedBy)); changed = true; }
  if (input.body != null) { md = setBody(md, input.body); changed = true; }
  if (!changed) throw badRequest("nothing to update; pass title, status, blockedBy, or body");

  await fsp.writeFile(file, md);
  return result(workspace, feature, n, "updated");
}

export async function completeTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const n = normalizeN(input.n);
  const { file } = await readTicketFile(workspace, feature, n);

  let md = await fsp.readFile(file, "utf8");
  md = setStatus(md, "done");
  md = tickBoxes(md);
  await fsp.writeFile(file, md);
  return result(workspace, feature, n, "completed");
}

export async function removeTicket(workspace, input = {}) {
  const feature = checkFeature(input.feature);
  const n = normalizeN(input.n);
  const { file, dir } = await readTicketFile(workspace, feature, n);

  const dependents = [];
  for (const name of await fsp.readdir(dir)) {
    if (!/^\d+.*\.md$/.test(name)) continue;
    const p = path.join(dir, name);
    const t = parseTicket(await fsp.readFile(p, "utf8"));
    if (t.blockedBy.some((b) => Number(b) === n)) dependents.push(nn(t.n));
  }

  if (dependents.length && !input.force) {
    throw conflict(`ticket ${nn(n)} is blocked-by for ${dependents.join(", ")}; pass force to delete anyway`);
  }
  await fsp.unlink(file);
  return { ok: true, action: "removed", feature, n, path: path.relative(workspace, file).split(path.sep).join("/"), dependents };
}

/** Compact list for agents: one row per ticket, blockers and readiness included. */
export function listTickets(tree, feature) {
  const features = feature ? tree.features.filter((f) => f.slug === feature) : tree.features;
  return features.flatMap((f) => {
    const byN = new Map(f.tickets.map((t) => [String(t.n), t]));
    return f.tickets.map((t) => {
      const open = t.blockedBy.map((b) => byN.get(String(Number(b)))).filter((b) => b && b.status !== "done");
      return {
        feature: f.slug,
        n: t.n,
        title: t.title,
        status: t.status,
        blockedBy: t.blockedBy,
        open,
        ready: t.status === "pending" && open.length === 0,
        path: t.path,
      };
    });
  });
}
