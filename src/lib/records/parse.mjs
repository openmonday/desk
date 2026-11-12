/* Read a map record into plain data.
 *
 * Records live anywhere under `.context/map/` and start with the deliberately
 * limited front matter described in the draw-map skill: `type`, `files`, and
 * `since`. The body keeps the rules the code must hold. The page renders the
 * record as a document and shows the front matter as record facts; the strict
 * checks stay in the skill's Python scripts. */
import { firstH1, headings, proseOnly } from "../markdown.mjs";

const TYPES = new Set(["feat", "fix", "refactor"]);

/** Split `---` front matter from the body. Returns null when it is missing. */
export function splitFrontMatter(md) {
  const lines = md.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  const fields = { type: null, since: null, files: [], problems: [] };
  let inFiles = false;
  for (const line of lines.slice(1, end)) {
    const field = line.match(/^(type|files|since):(?:\s+(.*))?$/);
    const item = line.match(/^ {2}- (.+)$/);
    if (field) {
      inFiles = field[1] === "files";
      if (field[1] === "files") {
        if (field[2]) fields.problems.push("files must be a block list");
        else fields.files = [];
      } else if (fields[field[1]] != null) {
        fields.problems.push(`${field[1]} appears more than once`);
      } else {
        fields[field[1]] = (field[2] || "").trim() || null;
      }
    } else if (item && inFiles) {
      fields.files.push(item[1].trim());
    } else if (line.trim()) {
      fields.problems.push(`unsupported front matter line "${line}"`);
    }
  }
  if (!fields.type) fields.problems.push("type is missing");
  if (!fields.files.length) fields.problems.push("files is missing");
  if (!fields.since) fields.problems.push("since is missing");
  else if (!/^[0-9a-f]{7,}$/i.test(fields.since)) fields.problems.push("since is not a commit hash");
  if (fields.type && !TYPES.has(fields.type)) fields.problems.push(`type "${fields.type}" is not feat, fix, or refactor`);
  return { ...fields, body };
}

/** Lines of a `## Section` body, without the heading itself. */
function sectionLines(md, title) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${title}\\s*$`, "i").test(line));
  if (start === -1) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    out.push(line);
  }
  return out;
}

function bullets(lines) {
  return (lines || [])
    .filter((line) => /^\s*[-*]\s+\S/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim());
}

export function parseRecord(md) {
  const fm = splitFrontMatter(md);
  const body = fm ? fm.body : md;
  const prose = proseOnly(body);
  const has = (title) => sectionLines(prose, title) != null;
  return {
    type: fm?.type || null,
    since: fm?.since || null,
    files: fm?.files || [],
    problems: fm ? fm.problems : ["front matter is missing"],
    frontMatter: fm != null,
    title: firstH1(prose) || null,
    headings: headings(prose).filter((h) => h.level === 2).map((h) => h.text),
    constraints: bullets(sectionLines(prose, "Constraints")),
    violations: bullets(sectionLines(prose, "Violations")),
    hasFeature: has("Feature"),
    hasConstraints: has("Constraints"),
    hasArchitecture: has("Architecture"),
  };
}
