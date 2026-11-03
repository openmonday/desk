/* Shared callbacks assembled in app.js.
 *
 * Views call through this registry so the module graph stays acyclic: a view
 * never imports the navigation or renderer that imports it. */

export const actions = {
  open() {},
  loadEntry() {},
  render() {},
  renderRail() {},
  renderGraph() {},
  refreshTree() {},
  scheduleRefresh() {},
  showArticle() {},
};
