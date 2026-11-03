/* Ticket markdown layout: header fields and body replacement. */
import { badRequest, nn } from "./schema.mjs";

export function headerBlock(n, title, status, blockedBy) {
  return `# ${nn(n)}: ${title}\n\nStatus: ${status}\nBlocked by: ${blockedBy.length ? blockedBy.join(", ") : "None"}\n\n`;
}

function defaultBody() {
  return [
    "## What to build",
    "",
    "_Describe the change._",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] _Describe the observable result._",
    "",
  ].join("\n");
}

export function bodyBlock(body) {
  const text = String(body).replace(/\r\n/g, "\n").trim();
  if (!text) return defaultBody();
  return text.endsWith("\n") ? text : `${text}\n`;
}

function splitHead(md) {
  const eol = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  const h1i = lines.findIndex((l) => /^#\s+/.test(l));
  const nextSection = lines.findIndex((l, i) => i > h1i && /^##\s+/.test(l));
  return { eol, lines, h1i, secI: nextSection === -1 ? lines.length : nextSection };
}

function fieldIndex(lines, from, to, key) {
  for (let i = from; i < to; i++) {
    if (new RegExp(`^\\s*${key}\\s*:`, "i").test(lines[i])) return i;
  }
  return -1;
}

export function setTitle(md, title, n) {
  const { eol, lines, h1i } = splitHead(md);
  if (h1i === -1) throw badRequest('ticket has no "# NN: Title" heading');
  const clean = String(title).replace(/^\s*\d+\s*[:.\-–]\s*/, "").replace(/\s+/g, " ").trim();
  if (!clean) throw badRequest("title is required");
  lines[h1i] = `# ${nn(n)}: ${clean}`;
  return lines.join(eol);
}

function setField(md, key, value) {
  const { eol, lines, h1i, secI } = splitHead(md);
  if (h1i === -1) throw badRequest('ticket has no "# NN: Title" heading');
  const at = fieldIndex(lines, h1i + 1, secI, key);
  if (at !== -1) {
    lines[at] = `${key}: ${value}`;
  } else {
    let insertAt = h1i + 1;
    for (let i = h1i + 1; i < secI; i++) {
      if (/^\s*(Status|Blocked by)\s*:/i.test(lines[i])) insertAt = i + 1;
    }
    if (insertAt === h1i + 1 && lines[h1i + 1] === "") insertAt = h1i + 2;
    lines.splice(insertAt, 0, `${key}: ${value}`);
  }
  return lines.join(eol);
}

export const setStatus = (md, status) => setField(md, "Status", status);
export const setBlockedBy = (md, list) => setField(md, "Blocked by", list.length ? list.join(", ") : "None");

export function setBody(md, body) {
  const { eol, lines, secI } = splitHead(md);
  if (secI === lines.length) {
    const head = lines.join(eol).replace(/\s+$/, "");
    return `${head}${eol}${eol}${bodyBlock(body)}`;
  }
  const head = lines.slice(0, secI).join(eol).replace(/\s+$/, "");
  return `${head}${eol}${eol}${bodyBlock(body)}`;
}

export function tickBoxes(md) {
  return md.replace(/^(\s*[-*]\s*)\[ \](\s)/gm, "$1[x]$2");
}
