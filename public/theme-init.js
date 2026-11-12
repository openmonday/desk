/* Apply the saved or system theme before the stylesheet paints.
 *
 * This is a classic script on purpose: it must run while the document head is
 * still parsing. Keep the storage key and mode names in sync with js/theme.js. */
(function () {
  "use strict";

  var KEY = "leaf.theme";
  var mode = "system";
  try {
    var saved = window.localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") mode = saved;
  } catch (_) { /* private mode or storage disabled */ }

  var systemDark = false;
  try { systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (_) { /* old browser */ }
  var theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  var root = document.documentElement;

  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  root.style.colorScheme = theme;

  /* Keep these two colours in sync with --paper in styles/base.css. */
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#1b1a17" : "#faf9f5";
})();
