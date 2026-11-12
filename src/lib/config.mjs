/* Global desk settings, shared by the CLI and the page server.
 *
 * Settings live once per user (not per project) and are changed through
 * `desk config`. The file is optional: without it the built-in order applies.
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SECTIONS = ["glossary", "map", "issues"];
export const DEFAULT_NAV = { order: [...SECTIONS], hidden: [], default: null };

/* Names used before `.context` replaced the `.desk` layout. An old config file
 * keeps working without a migration step. */
const ALIASES = {
  context: "glossary",
  architecture: "map",
  features: "issues",
};

/** Case-insensitive section id, or null when it is not one of the sections. */
export function sectionId(raw) {
  const id = String(raw ?? "").trim().toLowerCase();
  if (SECTIONS.includes(id)) return id;
  return ALIASES[id] || null;
}

export function assertSection(raw) {
  const id = sectionId(raw);
  if (!id) throw new Error(`unknown section "${raw}"; use ${SECTIONS.join(", ")}`);
  return id;
}

export function configPath(env = process.env) {
  if (env.DESK_CONFIG) return path.resolve(env.DESK_CONFIG);
  const base = env.XDG_CONFIG_HOME
    ? path.resolve(env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), ".config");
  return path.join(base, "desk", "config.json");
}

/** Fill missing sections, drop duplicates, and keep at least one visible. */
export function normalizeNav(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const requested = Array.isArray(source.order) ? source.order.map(sectionId).filter(Boolean) : [];
  const order = [...new Set(requested)];
  for (const id of SECTIONS) if (!order.includes(id)) order.push(id);

  let hidden = [...new Set((Array.isArray(source.hidden) ? source.hidden : []).map(sectionId).filter(Boolean))];
  if (hidden.length >= SECTIONS.length) hidden = hidden.slice(0, SECTIONS.length - 1);

  const wanted = sectionId(source.default);
  const def = wanted && !hidden.includes(wanted) ? wanted : null;
  return { order, hidden, default: def };
}

export async function readNav(env = process.env) {
  try {
    const raw = JSON.parse(await fsp.readFile(configPath(env), "utf8"));
    return normalizeNav(raw);
  } catch {
    return normalizeNav(DEFAULT_NAV);
  }
}

export async function writeNav(nav, env = process.env) {
  const file = configPath(env);
  const body = `${JSON.stringify(normalizeNav(nav), null, 2)}\n`;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, body);
  return file;
}

export async function resetNav(env = process.env) {
  const file = configPath(env);
  await fsp.rm(file, { force: true });
  return file;
}

/* Pure mutations used by `desk config`. */

export function setOrder(nav, ids) {
  const current = normalizeNav(nav);
  const picked = ids.map(assertSection);
  if (!picked.length) throw new Error(`order needs one or more sections: ${SECTIONS.join(", ")}`);
  const order = [...new Set(picked)];
  for (const id of current.order) if (!order.includes(id)) order.push(id);
  return normalizeNav({ ...current, order });
}

export function setDefault(nav, id) {
  const section = assertSection(id);
  const current = normalizeNav(nav);
  return normalizeNav({
    ...current,
    hidden: current.hidden.filter((x) => x !== section),
    default: section,
  });
}

export function hideSection(nav, id) {
  const section = assertSection(id);
  const current = normalizeNav(nav);
  const hidden = [...new Set([...current.hidden, section])];
  if (hidden.length >= SECTIONS.length) throw new Error("at least one section must stay visible");
  return normalizeNav({
    ...current,
    hidden,
    default: current.default === section ? null : current.default,
  });
}

export function unhideSection(nav, id) {
  const section = assertSection(id);
  const current = normalizeNav(nav);
  return normalizeNav({ ...current, hidden: current.hidden.filter((x) => x !== section) });
}
