/* Ticket file lookup and result shaping. */
import fsp from "node:fs/promises";
import path from "node:path";
import { parseTicket } from "./parse.mjs";
import { nn, notFound } from "./schema.mjs";

export async function readTicketFile(workspace, feature, n) {
  const ticketsDir = path.join(workspace, "features", feature, "tickets");
  const files = await fsp.readdir(ticketsDir).catch(() => []);
  const hit = files.find((f) => /^\d+.*\.md$/.test(f) && Number(f.match(/^\d+/)[0]) === n);
  if (!hit) throw notFound(`ticket ${nn(n)} not found in feature "${feature}"`);
  return { file: path.join(ticketsDir, hit), dir: ticketsDir };
}

export async function nextNumber(ticketsDir) {
  const files = await fsp.readdir(ticketsDir).catch(() => []);
  const nums = files.filter((f) => /^\d+.*\.md$/.test(f)).map((f) => Number(f.match(/^\d+/)[0]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export async function result(workspace, feature, n, action) {
  const { file } = await readTicketFile(workspace, feature, n);
  const md = await fsp.readFile(file, "utf8");
  const t = parseTicket(md);
  return {
    ok: true,
    action,
    feature,
    n,
    path: path.relative(workspace, file).split(path.sep).join("/"),
    title: t.title,
    status: t.status,
    blockedBy: t.blockedBy,
  };
}
