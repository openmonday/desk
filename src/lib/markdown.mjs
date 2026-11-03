/* Markdown helpers shared by the scanner and ticket parser. */

/** Strip fenced code blocks so headings inside code are ignored. */
export function proseOnly(md) {
  return md.replace(/^```[\s\S]*?^```/gm, "").replace(/^~~~[\s\S]*?^~~~/gm, "");
}

export function headings(md) {
  return [...proseOnly(md).matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].replace(/[*`_]/g, "").trim(),
  }));
}

export function firstH1(md) {
  return headings(md).find((h) => h.level === 1)?.text || null;
}

export function titleCase(slug) {
  return slug.split(/[-_]/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
