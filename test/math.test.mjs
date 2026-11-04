import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { hasMath, mathExtension } from "../public/js/math.js";

const markedSource = fs.readFileSync(new URL("../public/marked.min.js", import.meta.url), "utf8");
const fakeKatex = {
  renderToString(tex, options) {
    return `<katex data-display="${Boolean(options.displayMode)}">${tex}</katex>`;
  },
};

function parse(markdown) {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(markedSource, context);
  context.marked.use(mathExtension(fakeKatex));
  return context.marked.parse(markdown);
}

test("hasMath detects supported delimiters", () => {
  assert.equal(hasMath("plain markdown"), false);
  assert.equal(hasMath("inline $x + y$"), true);
  assert.equal(hasMath("display \\[x + y\\]"), true);
  assert.equal(hasMath("paren \\(x + y\\)"), true);
});

test("inline math is parsed before markdown emphasis", () => {
  const html = parse("before $a*b*c$ after");
  assert.match(html, /<katex data-display="false">a\*b\*c<\/katex>/);
  assert.doesNotMatch(html, /<em>/);
});

test("display math supports dollar, bracket, and multiline forms", () => {
  assert.match(parse("$$a*b$$"), /<katex data-display="true">a\*b<\/katex>/);
  assert.match(parse("\\[a*b\\]"), /<katex data-display="true">a\*b<\/katex>/);

  const oneLine = parse("Correctness is one line: $$ c_2 \\cdot (c_1^x)^{-1} = m \\cdot g^{xk} \\cdot (g^{kx})^{-1} = m . $$");
  assert.match(oneLine, /data-display="true"/);
  assert.match(oneLine, /Correctness is one line/);

  // Display dollars do not need whitespace after the closing delimiter.
  assert.match(parse("$$a$$next"), /<katex data-display="true">a<\/katex>next/);

  const html = parse("$$\n\\begin{aligned}\na&=b\\\\\nc&=d\n\\end{aligned}\n$$");
  assert.match(html, /data-display="true"/);
  assert.match(html, /\\begin\{aligned\}/);
});

test("code spans and fenced blocks keep their dollar signs", () => {
  const inline = parse("code `$x$` and math $y$");
  assert.match(inline, /<code>\$x\$<\/code>/);
  assert.match(inline, /<katex data-display="false">y<\/katex>/);

  const fenced = parse("```md\n$x$\n```\n");
  assert.match(fenced, /<pre><code class="language-md">\$x\$/);
  assert.doesNotMatch(fenced, /<katex/);
});

test("currency and escaped dollars are not treated as math", () => {
  assert.doesNotMatch(parse("It costs $5 and $10."), /<katex/);
  assert.doesNotMatch(parse("Escaped \\$x$ stays text."), /<katex/);
  assert.match(parse("Price $5, then $x$."), /<katex data-display="false">x<\/katex>/);
});

test("markdown links are not parsed as math", () => {
  const html = parse("[link](https://example.com/$value$)");
  assert.match(html, /href="https:\/\/example\.com\/\$value\$"/);
  assert.doesNotMatch(html, /<katex/);
});
