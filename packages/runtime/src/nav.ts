/**
 * Slide navigation: active-slide tracking, step reveal on advance, fixed-canvas
 * scaling, theme toggle, keyboard + click + hash routing. Ported to TypeScript
 * from the Phase 2 inline runtime; behavior is unchanged except that it now
 * yields arrow keys to focused controls (sliders) and ignores clicks on
 * interactive elements so dragging a slider does not advance the slide.
 */

function isInteractiveTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return !!el.closest(
    ".chalk-bar, .chalk-interactive, input, button, a, canvas, .chalk-geo",
  );
}

export function initNav(): void {
  const deck = document.getElementById("deck");
  const slides = Array.from(
    document.querySelectorAll<HTMLElement>(".slide"),
  );
  const counterEl = document.getElementById("chalk-counter");
  const titleEl = document.getElementById("chalk-bar-title");
  const progressEl = document.getElementById("chalk-progress");
  const themeBtn = document.getElementById("chalk-theme");
  if (!deck || slides.length === 0) return;

  let current = 0;
  const revealed = slides.map(() => 0);

  const stepCount = (i: number): number =>
    parseInt(slides[i]!.getAttribute("data-steps") || "0", 10);

  /**
   * Apply the current reveal count to slide `i`. `+step` items toggle visible;
   * other advance-driven widgets (e.g. `:::derive` morphs) listen for the
   * `chalk:advance` event and update themselves. `animate` is false on jumps
   * (slide change, Home/End, hash) so those snap instantly.
   */
  function applySteps(i: number, animate: boolean): void {
    const steps = slides[i]!.querySelectorAll<HTMLElement>(".chalk-step");
    steps.forEach((el) => {
      const idx = parseInt(el.getAttribute("data-step") || "0", 10);
      el.classList.toggle("is-revealed", idx < revealed[i]!);
    });
    document.dispatchEvent(
      new CustomEvent("chalk:advance", {
        detail: { slide: slides[i], revealed: revealed[i], animate },
      }),
    );
  }

  function show(i: number): void {
    current = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle("is-active", k === current));
    applySteps(current, false);
    if (counterEl) counterEl.textContent = `${current + 1} / ${slides.length}`;
    if (progressEl) {
      progressEl.style.width = `${((current + 1) / slides.length) * 100}%`;
    }
    if (titleEl) {
      const h = slides[current]!.querySelector(".chalk-heading, .chalk-title");
      titleEl.textContent = h ? h.textContent : "";
    }
    if (`#${current + 1}` !== location.hash) {
      // Wrapped: replaceState throws in an opaque-origin (about:srcdoc) iframe,
      // e.g. when a deck is embedded in the playground preview. Hash sync is a
      // nicety; never let it break navigation.
      try {
        history.replaceState(null, "", `#${current + 1}`);
      } catch {
        /* embedded deck: skip URL hash sync */
      }
    }
  }

  function next(): void {
    if (revealed[current]! < stepCount(current)) {
      revealed[current]!++;
      applySteps(current, true);
    } else if (current < slides.length - 1) {
      revealed[current + 1] = 0;
      show(current + 1);
    }
  }

  function prev(): void {
    if (revealed[current]! > 0) {
      revealed[current]!--;
      applySteps(current, true);
    } else if (current > 0) {
      revealed[current - 1] = stepCount(current - 1);
      show(current - 1);
    }
  }

  function fit(): void {
    const stage = deck!.parentElement;
    if (!stage) return;
    const pad = 32;
    const availW = stage.clientWidth - pad;
    const availH = stage.clientHeight - pad;
    const w = deck!.offsetWidth;
    const h = deck!.offsetHeight;
    // Guard against a not-yet-laid-out stage/deck (0 size → Infinity scale).
    if (availW <= 0 || availH <= 0 || w <= 0 || h <= 0) return;
    const scale = Math.min(availW / w, availH / h);
    deck!.style.transform = `scale(${scale})`;
  }

  function setTheme(theme: string): void {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("chalk-theme", theme);
    } catch {
      /* ignore */
    }
    if (themeBtn) themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
    document.dispatchEvent(new CustomEvent("chalk:themechange"));
  }
  (function initTheme(): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("chalk-theme");
    } catch {
      /* ignore */
    }
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(stored || (prefersDark ? "dark" : "light"));
  })();
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }

  document.addEventListener("keydown", (e) => {
    // Let a focused control (e.g. a slider) handle arrow keys itself.
    if (
      (e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement) &&
      e.key.startsWith("Arrow")
    ) {
      return;
    }
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      prev();
    } else if (e.key === "Home") {
      e.preventDefault();
      revealed[0] = 0;
      show(0);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = slides.length - 1;
      revealed[last] = stepCount(last);
      show(last);
    } else if (e.key.toLowerCase() === "f") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    }
  });

  deck.parentElement?.addEventListener("click", (e) => {
    if (isInteractiveTarget(e.target)) return;
    next();
  });

  window.addEventListener("resize", fit);
  // Re-fit whenever the stage itself resizes — covers being embedded in an
  // iframe (the playground), responsive panes, and panel drags, where the
  // window 'resize' event never fires.
  if (typeof ResizeObserver === "function" && deck.parentElement) {
    new ResizeObserver(() => fit()).observe(deck.parentElement);
  }
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (!isNaN(n) && n - 1 !== current) show(n - 1);
  });

  const start = parseInt(location.hash.slice(1), 10);
  show(isNaN(start) ? 0 : start - 1);
  fit();
}
