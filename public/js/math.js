/* LaTeX math with KaTeX.
 *
 * KaTeX is vendored under /katex and loaded only when a document contains a
 * math delimiter. The marked extension runs before inline markdown so `*` and
 * `_` inside a formula are not parsed as emphasis, while code spans and fenced
 * blocks stay untouched. */

const KATEX_SCRIPT = "/katex/katex.min.js";
const KATEX_STYLE = "/katex/katex.min.css";

const DOUBLE_DOLLAR_MATH = /^\$\$((?:\\.|[^\\])*?)\$\$/;
const DOLLAR_MATH = /^\$(?!\$)((?:\\.|[^\\\n$])*?(?:\\.|[^\\\n$]))\$(?=[\s?!.,:;，。：；]|$)/;
const PAREN_MATH = /^\\\(((?:\\.|[^\\])*?)\\\)/;
const BRACKET_MATH = /^\\\[((?:\\.|[^\\])*?)\\\]/;
const BLOCK_DOLLAR_MATH = /^(\${1,2})[ \t]*\n((?:\\[^]|[^\\])+?)\n\1[ \t]*(?:\n|$)/;
const BLOCK_BRACKET_MATH = /^\\\[[ \t]*\n([\s\S]+?)\n\\\][ \t]*(?:\n|$)/;

let loadPromise = null;
let registered = false;

/** A cheap check used to decide whether the KaTeX bundle needs to load. */
export function hasMath(markdown) {
  return /\\\(|\\\[|\$/.test(markdown || "");
}

function isEscaped(src, index) {
  let count = 0;
  for (let i = index - 1; i >= 0 && src[i] === "\\"; i--) count++;
  return count % 2 === 1;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Marked extension that turns math delimiters into KaTeX output. */
export function mathExtension(katex) {
  const render = (token) => {
    try {
      return katex.renderToString(token.text.trim(), {
        displayMode: token.display,
        throwOnError: false,
        strict: "ignore",
        trust: false,
      });
    } catch {
      // A malformed formula should leave readable source, not break the page.
      return escapeHtml(token.raw);
    }
  };

  const inline = {
    name: "inlineKatex",
    level: "inline",
    start(src) {
      const re = /\\\(|\\\[|\$/g;
      let match;
      while ((match = re.exec(src))) {
        const index = match.index;
        if (isEscaped(src, index)) continue;
        const rest = src.slice(index);
        if (rest.startsWith("\\(")) {
          if (PAREN_MATH.test(rest)) return index;
          continue;
        }
        if (rest.startsWith("\\[")) {
          if (BRACKET_MATH.test(rest)) return index;
          continue;
        }
        if (rest.startsWith("$$") && DOUBLE_DOLLAR_MATH.test(rest)) return index;
        if (DOLLAR_MATH.test(rest)) return index;
      }
    },
    tokenizer(src) {
      let match = src.match(PAREN_MATH);
      if (match) {
        return { type: "inlineKatex", raw: match[0], text: match[1], display: false };
      }
      match = src.match(BRACKET_MATH);
      if (match) {
        return { type: "inlineKatex", raw: match[0], text: match[1], display: true };
      }
      match = src.match(DOUBLE_DOLLAR_MATH);
      if (match) {
        return { type: "inlineKatex", raw: match[0], text: match[1], display: true };
      }
      match = src.match(DOLLAR_MATH);
      if (match) {
        return { type: "inlineKatex", raw: match[0], text: match[1], display: false };
      }
    },
    renderer: render,
  };

  const block = {
    name: "blockKatex",
    level: "block",
    tokenizer(src) {
      let match = src.match(BLOCK_DOLLAR_MATH);
      if (match) {
        return {
          type: "blockKatex",
          raw: match[0],
          text: match[2],
          display: match[1].length === 2,
        };
      }
      match = src.match(BLOCK_BRACKET_MATH);
      if (match) {
        return { type: "blockKatex", raw: match[0], text: match[1], display: true };
      }
    },
    renderer(token) {
      return `${render(token)}\n`;
    },
  };

  return { extensions: [inline, block] };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.leafKatex = "";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

function loadStyle(href) {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.leafKatex = "";
    link.onload = () => resolve();
    // Missing styling should not take the formulas or the page down.
    link.onerror = () => resolve();
    document.head.append(link);
  });
}

/** Load KaTeX and register its marked extension once. */
export function ensureMath() {
  if (registered) return Promise.resolve(window.katex);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const style = loadStyle(KATEX_STYLE);
    await loadScript(KATEX_SCRIPT);
    await style;
    const katex = window.katex;
    if (!katex || typeof katex.renderToString !== "function") {
      throw new Error("KaTeX did not expose renderToString");
    }
    window.marked.use(mathExtension(katex));
    registered = true;
    return katex;
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}
