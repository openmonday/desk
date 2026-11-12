/* The article: empty states, task/spec/record headers, and markdown body. */

import {
  S, issueIndex, key, num, plural, tally, KIND_LABEL,
} from "./state.js";
import { cmd, el, glyph } from "./dom.js";
import { article } from "./refs.js";
import { mdToNodes } from "./markdown.js";
import { encodeDocPath } from "./docs-path.js";

function emptyArticle() {
  const page = (title, ...kids) => [el("h1", {}, [title]), el("p", { class: "empty" }, kids)];
  if (!S.tree || S.tree.ok === false) {
    return page("No workspace found", "There is no ", cmd(".context/"), " directory here. Run ", cmd("/setup-context"), " in this project; the page picks it up on its own.");
  }
  if (S.tree?.mode === "docs") {
    if (!(S.tree.sections || []).length) {
      return page("No Markdown documents found", "Put .md files in this folder, or point desk at another folder with ", cmd("desk <dir>"), ".");
    }
    return page("Nothing to read here", "This section has no Markdown documents.");
  }
  if (S.tab === "overview") {
    return page("No Markdown files yet", "Put Markdown files in ", cmd(".context/"), " or run ", cmd("/setup-context"), " to create the workspace records.");
  }
  if (S.tab === "glossary") {
    return page("No glossary yet", "Run ", cmd("/setup-context"), " to create ", cmd("GLOSSARY.md"), " with the project's domain terms.");
  }
  if (S.tab === "map") {
    return page("No map records yet", "Run ", cmd("/draw-map"), " to record the committed code under ", cmd("map/"), ".");
  }
  if ((S.tree?.issues || []).length) {
    return page("This issue has no spec", "Run ", cmd("/to-spec"), " to write one, then ", cmd("/to-tasks"), " to split it into tasks.");
  }
  return page("No issues yet", "Run ", cmd("/to-spec"), " to write a spec, then ", cmd("/to-tasks"), " to split it into tasks.");
}

const issueHref = (issue) => S.tree?.mode === "docs"
  ? `#/docs/${encodeDocPath(issue.specPath)}`
  : `#/issues/${encodeDocPath(issue.slug)}`;

const taskHref = (issue, t) => S.tree?.mode === "docs"
  ? `#/docs/${encodeDocPath(t.path)}`
  : `#/issues/${encodeDocPath(issue.slug)}/${t.n}`;

const researchHref = (issue) => `#/issues/${encodeDocPath(issue.slug)}/research`;

function taskLink(t, issue) {
  const st = t.missing ? { kind: "unknown" } : issueIndex(issue).states.get(key(t.n));
  const label = [el("span", { class: "link-n" }, [num(t.n)]), " ", t.missing ? "does not exist" : t.title];
  return t.missing
    ? el("span", { class: "tlink is-missing" }, [glyph("unknown", 12), ...label])
    : el("a", {
      class: "tlink", href: taskHref(issue, t),
      title: `${KIND_LABEL[st.kind]} · Status: ${t.statusRaw}`,
    }, [glyph(st.kind, 12), ...label]);
}

const joinLinks = (list, issue) => list.flatMap((t, i) => (i ? [el("span", { class: "sep" }, ["·"]), taskLink(t, issue)] : [taskLink(t, issue)]));

// One sentence that says what the state means for the reader.
function stateSentence(st, task) {
  switch (st.kind) {
    case "done": return ["Completed."];
    case "active": return [task.owner ? `Claimed by ${task.owner}.` : "Someone is working on this now."];
    case "ready": return [task.blockedBy.length ? "Unblocked — ready to start." : "No blockers — ready to start."];
    case "waiting": return [`Can start once ${st.open.length === 1 ? "its blocker is" : `${st.open.length} blockers are`} done.`];
    case "dropped": return ["Removed from the plan."];
    default: return [`The status "${task.statusRaw}" is not one the page knows. Use pending, in-progress, done, or dropped.`];
  }
}

function taskHeader(doc) {
  const issue = doc.issue;
  const task = doc.task;
  const idx = issueIndex(issue);
  const st = idx.states.get(key(task.n));
  const deps = idx.dependents.get(key(task.n)) || [];
  const tasks = issue.tasks || [];
  const i = tasks.findIndex((x) => x.path === task.path);
  const prev = tasks[i - 1];
  const next = tasks[i + 1];

  const crumbs = el("nav", { class: "crumbs", "aria-label": "Task location" }, [
    issue.specPath
      ? el("a", { class: "crumb-back", href: issueHref(issue), title: "Back to the spec" }, [
        el("span", { "aria-hidden": "true" }, ["← "]), issue.title,
      ])
      : el("span", {}, [issue.title]),
    el("span", { class: "crumb-here" }, [`Task ${num(task.n)} of ${num(tasks.length)}`]),
    el("span", { class: "crumb-step" }, [
      prev ? el("a", { href: taskHref(issue, prev), title: `Previous: ${prev.title}`, "aria-label": `Previous task, ${num(prev.n)}` }, [`‹ ${num(prev.n)}`]) : null,
      next ? el("a", { href: taskHref(issue, next), title: `Next: ${next.title}`, "aria-label": `Next task, ${num(next.n)}` }, [`${num(next.n)} ›`]) : null,
    ]),
  ]);

  const relations = [];
  if (st.blockers.length) {
    relations.push(el("div", { class: "rel" }, [
      el("dt", {}, ["Blocked by"]),
      el("dd", {}, joinLinks(st.blockers, issue)),
    ]));
  }
  if (deps.length) {
    relations.push(el("div", { class: "rel" }, [
      el("dt", {}, ["Unblocks"]),
      el("dd", {}, joinLinks(deps, issue)),
    ]));
  }

  const fileName = task.path.split("/").pop();
  const status = el("section", { class: "status", "data-kind": st.kind, "aria-label": "Task status" }, [
    el("div", { class: "status-main" }, [
      el("p", { class: "status-line" }, [
        el("span", { class: `status-glyph${S.justDone.has(task.path) ? " node-check" : ""}` }, [glyph(st.kind, 18)]),
        el("strong", { class: "status-word" }, [KIND_LABEL[st.kind]]),
        el("span", { class: "status-raw", title: `As written in ${fileName}` }, [`Status: ${task.statusRaw}`]),
      ]),
      el("p", { class: "status-say" }, stateSentence(st, task)),
      relations.length ? el("dl", { class: "rels" }, relations) : null,
    ]),
  ]);

  return [crumbs, el("h1", {}, [task.title]), status];
}

function nextUp(issue) {
  const { states } = issueIndex(issue);
  const tasks = issue.tasks || [];
  const of = (kind) => tasks.filter((task) => states.get(key(task.n))?.kind === kind);
  const total = tasks.length;
  if (!total) return ["No tasks yet."];
  const c = tally(issue);
  const open = tasks.filter((task) => task.status !== "dropped").length;
  if (!open) return [`All ${plural(total, "task")} are dropped.`];
  if (c.done >= open) {
    return [`All ${plural(open, "task")} are done${c.dropped ? ` · ${c.dropped} dropped` : ""}.`];
  }
  const active = of("active");
  const ready = of("ready");
  const out = [];
  if (active.length) out.push(el("span", { class: "next-label" }, ["In progress"]), ...joinLinks(active, issue));
  if (ready.length) {
    if (out.length) out.push(el("span", { class: "next-gap" }));
    out.push(el("span", { class: "next-label" }, [active.length ? "Ready next" : "Start with"]), taskLink(ready[0], issue));
    if (ready.length > 1) out.push(el("span", { class: "next-more" }, [`and ${ready.length - 1} more ready`]));
  }
  if (!out.length) return ["Nothing can start: every open task is waiting."];
  return out;
}

function specHeader(issue) {
  const total = (issue.tasks || []).length;
  const links = [];
  if (issue.researchPath) {
    links.push(el("a", { class: "doc-jump", href: researchHref(issue) }, ["Research"]));
  }
  return [
    el("p", { class: "eyebrow eyebrow-doc", title: `issues/${issue.slug}/spec.md` }, [
      "Issue", el("span", { class: "eyebrow-quiet" }, [` · ${plural(total, "task")}`]),
    ]),
    el("h1", {}, [issue.title]),
    el("p", { class: "next" }, nextUp(issue)),
    links.length ? el("p", { class: "doc-jumps" }, links) : null,
  ].filter(Boolean);
}

function recordMeta(record) {
  const rows = [
    el("div", { class: "fact" }, [
      el("dt", {}, ["Type"]),
      el("dd", {}, [record.type || "missing"]),
    ]),
    el("div", { class: "fact" }, [
      el("dt", {}, ["Since"]),
      el("dd", {}, [el("code", {}, [record.since || "missing"])]),
    ]),
  ];
  const files = record.files?.length
    ? el("ul", { class: "record-files" }, record.files.map((file) => el("li", {}, [el("code", {}, [file])])))
    : el("p", { class: "empty" }, ["No files listed in the record front matter."]);
  return el("section", { class: "record-facts", "aria-label": "Record details" }, [
    el("dl", { class: "facts" }, rows),
    el("p", { class: "fact-label" }, ["Files this record covers"]),
    files,
  ]);
}

function recordHeader(doc) {
  return [
    el("p", { class: "eyebrow eyebrow-doc", title: doc.path }, ["Map record"]),
    el("h1", {}, [doc.title]),
    recordMeta(doc.record),
  ];
}

function docEyebrow() {
  if (S.doc.kind === "doc") {
    return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, [S.doc.section?.title || "Document"]);
  }
  if (S.doc.kind === "glossary") return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, ["Glossary"]);
  if (S.doc.kind === "research") return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, ["Research"]);
  return null;
}

function articleMarkdown() {
  let md = S.doc?.md || "";
  if (S.doc?.kind === "record" || S.doc?.kind === "doc") {
    md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }
  if (S.doc?.kind !== "task") return md;
  // The task header carries these; do not repeat them in the body.
  return md.replace(/^[ \t]*(Status|Blocked by):.*$/gim, "").replace(/\n{3,}/g, "\n\n").trimStart();
}

let articleSeq = 0;

async function renderArticle() {
  const seq = ++articleSeq;
  S.mdError = null;
  article.dataset.kind = S.doc?.kind || "empty";

  if (!S.tree || S.tree.ok === false || !S.doc) {
    article.textContent = "";
    article.append(...emptyArticle());
    return true;
  }

  let nodes;
  try {
    nodes = await mdToNodes(articleMarkdown(), { basePath: S.doc.path, mode: S.tree?.mode });
  } catch (err) {
    if (seq !== articleSeq) return false;
    S.mdError = String(err?.message || err);
    nodes = document.createElement("div");
    nodes.append(
      el("p", { class: "parse-error" }, ["This document could not be rendered; showing its source instead."]),
      el("pre", {}, [el("code", {}, [S.doc.md])])
    );
  }

  if (seq !== articleSeq) return false;

  article.textContent = "";
  const heading = nodes.querySelector("h1");
  if (heading) heading.remove();

  if (S.doc.kind === "task") article.append(...taskHeader(S.doc));
  else if (S.doc.kind === "spec") article.append(...specHeader(S.doc.issue));
  else if (S.doc.kind === "record") article.append(...recordHeader(S.doc));
  else {
    const eb = docEyebrow();
    if (eb) article.append(eb);
    article.append(heading || el("h1", {}, [S.doc.title]));
  }

  const body = el("div", { class: "prose" });
  body.append(...nodes.childNodes);
  article.append(body);
  return true;
}

export { renderArticle };
