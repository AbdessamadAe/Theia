/**
 * Browser entry point. This is the module render-slides bundles (via esbuild)
 * into a single IIFE and inlines into every deck. It boots navigation and the
 * reactive layer once the DOM is ready.
 */
import { initDerive } from "./derive.js";
import { initMedia } from "./media.js";
import { initNav } from "./nav.js";
import { initReactive } from "./reactive.js";

function boot(): void {
  // Derive controllers must subscribe to chalk:advance before nav's first
  // show() fires it, so they pick up the initial reveal state.
  initDerive();
  initMedia();
  initNav();
  initReactive();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
