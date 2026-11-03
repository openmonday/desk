/* The article: empty states, ticket/spec headers, actions, and markdown body. */

import {
  S, featureIndex, key, num, plural, tally, KIND_LABEL,
} from "./state.js";
import { cmd, el, glyph } from "./dom.js";
import { actions } from "./actions.js";
import { article } from "./refs.js";
import { toast } from "./live.js";
import { mdToNodes } from "./markdown.js";
import { encodeDocPath } from "./docs-path.js";

function emptyArticle() {
  const page = (title, ...kids) => [el("h1", {}, [title]), el("p", { class: "empty" }, kids)];
  if (!S.tree || S.tree.ok === false) {
    return page("No workspace found", "There is no ", cmd(".desk/"), " directory here. Run ", cmd("/setup-desk"), " in this project; the page picks it up on its own.");
  }
  if (S.tree?.mode === "docs") {
    if (!(S.tree.sections || []).length) {
      return page("No Markdown documents found", "Put .md files in this folder, or point desk at another folder with ", cmd("desk docs <dir>"), ".");
    }
    return page("Nothing to read here", "This section has no Markdown documents.");
  }
  if (S.tab === "context") {
    return page("No glossary yet", "Run ", cmd("/setup-desk"), " to create ", cmd("CONTEXT.md"), " with the project's domain terms.");
  }
  if (S.tab === "architecture") {
    return page("No architecture records yet", "Run ", cmd("/setup-desk"), " to write records for the existing code, or ", cmd("/update-arch"), " after a change.");
  }
  if ((S.tree?.features || []).length) {
    return page("This feature has no spec", "Run ", cmd("/to-spec"), " to write one, then ", cmd("/to-tickets"), " to split it into tickets.");
  }
  return page("No features yet", "Run ", cmd("/to-spec"), " to write a spec, then ", cmd("/to-tickets"), " to split it into tickets.");
}

async function act(feature, n, body, button) {
  const group = button?.closest(".actions");
  const label = button?.textContent;
  group?.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  if (button) button.textContent = "Saving…";
  try {
    const res = await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature, n, ...body }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `request failed (${res.status})`);
    actions.scheduleRefresh();
  } catch (err) {
    group?.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    if (button) button.textContent = label;
    toast(`Could not save · ${String(err?.message || err)}`);
  }
}

const featureHref = (f) => S.tree?.mode === "docs"
  ? `#/docs/${encodeDocPath(f.specPath)}`
  : `#/features/${f.slug}`;

const ticketHref = (f, t) => S.tree?.mode === "docs"
  ? `#/docs/${encodeDocPath(t.path)}`
  : `#/features/${f.slug}/${t.n}`;

function ticketLink(t, f) {
  const st = t.missing ? { kind: "unknown" } : featureIndex(f).states.get(key(t.n));
  const label = [el("span", { class: "link-n" }, [num(t.n)]), " ", t.missing ? "does not exist" : t.title];
  return t.missing
    ? el("span", { class: "tlink is-missing" }, [glyph("unknown", 12), ...label])
    : el("a", {
      class: "tlink", href: ticketHref(f, t),
      title: `${KIND_LABEL[st.kind]} · Status: ${t.statusRaw}`,
    }, [glyph(st.kind, 12), ...label]);
}

const joinLinks = (list, f) => list.flatMap((t, i) => (i ? [el("span", { class: "sep" }, ["·"]), ticketLink(t, f)] : [ticketLink(t, f)]));

// One sentence that says what the state means for the reader.
function stateSentence(st, tk, f) {
  switch (st.kind) {
    case "done": return ["Completed."];
    case "active": return ["Someone is working on this now."];
    case "ready": return [tk.blockedBy.length ? "Unblocked — ready to start." : "No blockers — ready to start."];
    case "waiting": return [`Can start once ${st.open.length === 1 ? "its blocker is" : `${st.open.length} blockers are`} done.`];
    case "blocked": return ["The ticket file marks this as blocked."];
    default: return [`The status "${tk.statusRaw}" is not one the page knows. Use pending, in-progress, done, or blocked.`];
  }
}

function ticketHeader(doc) {
  const f = doc.feature;
  const tk = doc.ticket;
  const idx = featureIndex(f);
  const st = idx.states.get(key(tk.n));
  const deps = idx.dependents.get(key(tk.n)) || [];
  const tickets = f.tickets || [];
  const i = tickets.findIndex((x) => x.path === tk.path);
  const prev = tickets[i - 1];
  const next = tickets[i + 1];

  const crumbs = el("nav", { class: "crumbs", "aria-label": "Ticket location" }, [
    f.specPath
      ? el("a", { class: "crumb-back", href: featureHref(f), title: "Back to the overview" }, [
        el("span", { "aria-hidden": "true" }, ["← "]), f.title,
      ])
      : el("span", {}, [f.title]),
    el("span", { class: "crumb-here" }, [`Ticket ${num(tk.n)} of ${num(tickets.length)}`]),
    el("span", { class: "crumb-step" }, [
      prev ? el("a", { href: ticketHref(f, prev), title: `Previous: ${prev.title}`, "aria-label": `Previous ticket, ${num(prev.n)}` }, [`‹ ${num(prev.n)}`]) : null,
      next ? el("a", { href: ticketHref(f, next), title: `Next: ${next.title}`, "aria-label": `Next ticket, ${num(next.n)}` }, [`${num(next.n)} ›`]) : null,
    ]),
  ]);

  const feature = f.slug;
  const button = (label, cls, body) => el("button", {
    type: "button", class: `action ${cls}`,
    onclick: (ev) => act(feature, tk.n, body, ev.currentTarget),
  }, [label]);
  const buttons = [];
  if (st.kind === "done") buttons.push(button("Reopen", "action-secondary", { status: "pending" }));
  else if (st.kind === "active") buttons.push(button("Mark done", "action-primary", { action: "complete" }));
  else buttons.push(button("Start", "action-primary", { status: "in-progress" }), button("Mark done", "action-secondary", { action: "complete" }));

  const relations = [];
  if (st.blockers.length) {
    relations.push(el("div", { class: "rel" }, [
      el("dt", {}, ["Depends on"]),
      el("dd", {}, joinLinks(st.blockers, f)),
    ]));
  }
  if (deps.length) {
    relations.push(el("div", { class: "rel" }, [
      el("dt", {}, ["Unblocks"]),
      el("dd", {}, joinLinks(deps, f)),
    ]));
  }

  const fileName = tk.path.split("/").pop();
  const status = el("section", { class: "status", "data-kind": st.kind, "aria-label": "Ticket status" }, [
    el("div", { class: "status-main" }, [
      el("p", { class: "status-line" }, [
        el("span", { class: `status-glyph${S.justDone.has(tk.path) ? " node-check" : ""}` }, [glyph(st.kind, 18)]),
        el("strong", { class: "status-word" }, [KIND_LABEL[st.kind]]),
        el("span", { class: "status-raw", title: `As written in ${fileName}` }, [`Status: ${tk.statusRaw}`]),
      ]),
      el("p", { class: "status-say" }, stateSentence(st, tk, f)),
      relations.length ? el("dl", { class: "rels" }, relations) : null,
    ]),
    el("div", { class: "actions" }, buttons),
  ]);

  return [crumbs, el("h1", {}, [tk.title]), status];
}

function nextUp(f) {
  const { states } = featureIndex(f);
  const tickets = f.tickets || [];
  const of = (kind) => tickets.filter((t) => states.get(key(t.n)).kind === kind);
  const total = tickets.length;
  if (!total) return ["No tickets yet."];
  const c = tally(f);
  if (c.done === total) return [`All ${plural(total, "ticket")} are done.`];
  const active = of("active");
  const ready = of("ready");
  const out = [];
  if (active.length) out.push(el("span", { class: "next-label" }, ["In progress"]), ...joinLinks(active, f));
  if (ready.length) {
    if (out.length) out.push(el("span", { class: "next-gap" }));
    out.push(el("span", { class: "next-label" }, [active.length ? "Ready next" : "Start with"]), ticketLink(ready[0], f));
    if (ready.length > 1) out.push(el("span", { class: "next-more" }, [`and ${ready.length - 1} more ready`]));
  }
  if (!out.length) return ["Nothing can start: every open ticket is waiting or blocked."];
  return out;
}

function specHeader(f) {
  const total = (f.tickets || []).length;
  return [
    el("p", { class: "eyebrow eyebrow-doc", title: `features/${f.slug}/spec.md` }, [
      "Feature", el("span", { class: "eyebrow-quiet" }, [` · ${plural(total, "ticket")}`]),
    ]),
    el("h1", {}, [f.title]),
    el("p", { class: "next" }, nextUp(f)),
  ];
}

function docEyebrow() {
  if (S.doc.kind === "doc") {
    return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, [S.doc.section?.title || "Document"]);
  }
  if (S.doc.kind === "arch") return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, ["Architecture record"]);
  if (S.doc.kind === "context") return el("p", { class: "eyebrow eyebrow-doc", title: S.doc.path }, ["Glossary"]);
  return null;
}

function articleMarkdown() {
  let md = S.doc?.md || "";
  if (S.doc?.kind === "arch" || S.doc?.kind === "doc") {
    md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }
  if (S.doc?.kind !== "ticket") return md;
  // The ticket header carries these; do not repeat them in the body.
  return md.replace(/^[ \t]*(Status|Blocked by):.*$/gim, "").replace(/\n{3,}/g, "\n\n").trimStart();
}

function renderArticle() {
  article.textContent = "";
  S.mdError = null;
  article.dataset.kind = S.doc?.kind || "empty";

  if (!S.tree || S.tree.ok === false || !S.doc) {
    article.append(...emptyArticle());
    return;
  }

  let nodes;
  try {
    const basePath = S.tree?.mode === "docs" && ["doc", "spec", "ticket"].includes(S.doc.kind) ? S.doc.path : null;
    nodes = mdToNodes(articleMarkdown(), basePath ? { basePath } : null);
  } catch (err) {
    S.mdError = String(err?.message || err);
    nodes = document.createElement("div");
    nodes.append(
      el("p", { class: "parse-error" }, ["This document could not be rendered; showing its source instead."]),
      el("pre", {}, [el("code", {}, [S.doc.md])])
    );
  }

  const heading = nodes.querySelector("h1");
  if (heading) heading.remove();

  if (S.doc.kind === "ticket") article.append(...ticketHeader(S.doc));
  else if (S.doc.kind === "spec") {
    article.append(...specHeader(S.doc.feature));
  } else {
    const eb = docEyebrow();
    if (eb) article.append(eb);
    article.append(heading || el("h1", {}, [S.doc.title]));
  }

  const body = el("div", { class: "prose" });
  body.append(...nodes.childNodes);
  article.append(body);
}

export { renderArticle };
