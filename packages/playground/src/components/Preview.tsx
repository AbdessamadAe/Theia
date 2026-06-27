import * as React from "react";

interface PreviewProps {
  /** Compiled deck HTML (full document) to show in the isolated iframe. */
  html: string;
  /** When this changes, the next html is a fresh load (don't restore slide). */
  freshKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement>;
}

/**
 * The live deck, rendered in an isolated iframe (srcdoc) so its inline runtime
 * executes and its styles can't leak into the shell. Across a live recompile we
 * keep the viewer on the same slide by capturing the deck's #hash and restoring
 * it after reload; a fresh load (example switch) starts at slide 1.
 */
export function Preview({ html, freshKey, iframeRef }: PreviewProps): React.ReactElement {
  const lastFresh = React.useRef(freshKey);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const preserve = freshKey === lastFresh.current;
    lastFresh.current = freshKey;

    let hash = "";
    if (preserve) {
      try {
        hash = iframe.contentWindow?.location.hash ?? "";
      } catch {
        hash = "";
      }
    }
    if (preserve && hash) {
      const restore = (): void => {
        try {
          const w = iframe.contentWindow;
          if (w && w.location.hash !== hash) {
            w.location.hash = hash;
            w.dispatchEvent(new Event("hashchange"));
          }
        } catch {
          /* opaque-origin guard */
        }
      };
      iframe.addEventListener("load", restore, { once: true });
    }
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
