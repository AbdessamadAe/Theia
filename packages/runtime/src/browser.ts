/**
 * Browser entry point. This is the module render-slides bundles (via esbuild)
 * into a single IIFE and inlines into every deck. It boots navigation and the
 * reactive layer once the DOM is ready.
 */
import { initNav } from "./nav.js";
import { initReactive } from "./reactive.js";

function boot(): void {
  initNav();
  initReactive();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
