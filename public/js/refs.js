/* The shell's stable DOM nodes, looked up once after the document is parsed. */
const $ = (sel) => document.querySelector(sel);

export const brand = $("#brand");
export const tabs = $("#tabs");
export const rail = $("#rail");
export const railBody = $("#rail-body");
export const railLabel = $("#rail-label");
export const railTools = $("#rail-tools");
export const article = $("#article");
export const articlePanel = $("#article-panel");
export const articleTools = $("#article-tools");
export const scroller = $("#scroll");
export const live = $("#live");
export const themeToggle = $("#theme-toggle");
export const work = $("#work");
export const viewport = $(".viewport");
export const railSplit = $("#rail-split");
export const graphPanel = $("#graph-panel");
export const graphBody = $("#graph-body");
export const graphTools = $("#graph-tools");
