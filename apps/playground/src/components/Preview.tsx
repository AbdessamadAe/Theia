import * as React from "react";

interface PreviewProps {
  /** Compiled deck HTML (full document) to show in the isolated iframe. */
  html: string;
  /** When this changes, the next html is a fresh load (start at slide 1). */
  freshKey: number;
  /** The slide currently shown (0-based), tracked from the live deck. */
  currentSlide: number;
  iframeRef: React.RefObject<HTMLIFrameElement>;
}

/**
 * The live deck, rendered in an isolated iframe (srcdoc) so its inline runtime
 * executes and its styles can't leak into the shell. Across a live recompile we
 * keep the viewer on the same slide: the deck can't persist its own #hash inside
 * an about:srcdoc iframe (history.replaceState throws there), so we restore the
 * slide the shell already tracks by driving the deck's hashchange handler once
 * the new document has loaded. A fresh load (example switch) starts at slide 1.
 */
export function Preview({ html, freshKey, currentSlide, iframeRef }: PreviewProps): React.ReactElement {
  const lastFresh = React.useRef(freshKey);
  // Mirror the latest slide so the load handler reads a current value.
  const slideRef = React.useRef(currentSlide);
  slideRef.current = currentSlide;

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const preserve = freshKey === lastFresh.current;
    lastFresh.current = freshKey;
    const target = preserve ? slideRef.current : 0;

    const restore = (): void => {
      if (target <= 0) return; // slide 1 is the default; nothing to do
      try {
        const w = iframe.contentWindow;
        if (!w) return;
        // Drive the deck's own navigation (its hashchange handler clamps and
        // jumps without animation). Setting the hash also fires hashchange, but
        // we dispatch one explicitly to cover the same-hash case.
        w.location.hash = `#${target + 1}`;
        w.dispatchEvent(new Event("hashchange"));
      } catch {
        /* opaque-origin guard */
      }
    };
    iframe.addEventListener("load", restore, { once: true });
    iframe.srcdoc = html;
  }, [html, freshKey, iframeRef]);

  return (
    <iframe
      id="preview"
      ref={iframeRef}
      title="Live deck preview"
      className="h-full w-full border-0 bg-background"
    />
  );
}
