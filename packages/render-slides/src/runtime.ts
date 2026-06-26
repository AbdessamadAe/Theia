/**
 * The client-side navigation runtime, emitted inline into the deck. This is the
 * static-deck driver for Phase 2: slide navigation, step-reveal on advance,
 * fixed-canvas scaling, and theme toggling. (The reactive runtime — live
 * sliders, plots, GeoGebra — arrives in a later phase as its own package.)
 *
 * Authored as a plain string of browser JS so the deck has zero runtime deps.
 */
export const DECK_RUNTIME = String.raw`
(function () {
  var deck = document.getElementById("deck");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var counterEl = document.getElementById("chalk-counter");
  var titleEl = document.getElementById("chalk-bar-title");
  var progressEl = document.getElementById("chalk-progress");
  var themeBtn = document.getElementById("chalk-theme");
  if (!slides.length) return;

  var current = 0;
  // revealed[i] = how many +step items of slide i are currently shown.
  var revealed = slides.map(function () { return 0; });

  function stepCount(i) {
    return parseInt(slides[i].getAttribute("data-steps") || "0", 10);
  }

  function applySteps(i) {
    var steps = slides[i].querySelectorAll(".chalk-step");
    Array.prototype.forEach.call(steps, function (el) {
      var idx = parseInt(el.getAttribute("data-step") || "0", 10);
      el.classList.toggle("is-revealed", idx < revealed[i]);
    });
  }

  function show(i) {
    current = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, k) { s.classList.toggle("is-active", k === current); });
    applySteps(current);
    if (counterEl) counterEl.textContent = (current + 1) + " / " + slides.length;
    if (progressEl) progressEl.style.width = ((current + 1) / slides.length * 100) + "%";
    if (titleEl) {
      var h = slides[current].querySelector(".chalk-heading, .chalk-title");
      titleEl.textContent = h ? h.textContent : "";
    }
    if (("#" + (current + 1)) !== location.hash) {
      history.replaceState(null, "", "#" + (current + 1));
    }
  }

  function next() {
    if (revealed[current] < stepCount(current)) {
      revealed[current]++;
      applySteps(current);
    } else if (current < slides.length - 1) {
      revealed[current + 1] = 0;
      show(current + 1);
    }
  }

  function prev() {
    if (revealed[current] > 0) {
      revealed[current]--;
      applySteps(current);
    } else if (current > 0) {
      // Stepping back into a slide shows it fully revealed.
      revealed[current - 1] = stepCount(current - 1);
      show(current - 1);
    }
  }

  // --- Fixed-canvas scaling: fit the 1280x720 deck into the viewport. ---
  function fit() {
    var stage = deck.parentElement;
    var pad = 32;
    var availW = stage.clientWidth - pad;
    var availH = stage.clientHeight - pad;
    var scale = Math.min(availW / deck.offsetWidth, availH / deck.offsetHeight);
    deck.style.transform = "scale(" + scale + ")";
  }

  // --- Theme: persisted, defaulting to the OS preference. ---
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("chalk-theme", theme); } catch (e) {}
    if (themeBtn) themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
  }
  (function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem("chalk-theme"); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(stored || (prefersDark ? "dark" : "light"));
  })();
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault(); next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault(); prev();
    } else if (e.key === "Home") {
      e.preventDefault(); revealed[0] = 0; show(0);
    } else if (e.key === "End") {
      e.preventDefault();
      var last = slides.length - 1;
      revealed[last] = stepCount(last);
      show(last);
    } else if (e.key.toLowerCase() === "f") {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
  });

  // Click/tap the stage to advance (ignore clicks on the bar controls).
  deck.parentElement.addEventListener("click", function (e) {
    if (e.target.closest(".chalk-bar")) return;
    next();
  });

  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", function () {
    var n = parseInt(location.hash.slice(1), 10);
    if (!isNaN(n) && n - 1 !== current) show(n - 1);
  });

  // Initial slide from the URL hash, if present.
  var start = parseInt(location.hash.slice(1), 10);
  show(isNaN(start) ? 0 : start - 1);
  fit();
})();
`;
