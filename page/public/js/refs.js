/* The shell's stable DOM nodes, looked up once after the document is parsed. */
const $ = (sel) => document.querySelector(sel);

export const rail = $("#rail");
export const article = $("#article");
export const scroller = $("#scroll");
export const live = $("#live");
export const work = $("#work");
export const viewport = $(".viewport");
export const railSplit = $("#rail-split");
export const graphPanel = $("#graph-panel");
export const graphBody = $("#graph-body");
export const graphTally = $("#graph-tally");
export const panelSplit = $("#splitter");
export const panelToggle = $("#panel-toggle");
