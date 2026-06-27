import { compileChalk } from "@chalk/render-slides/core";
import type { EditorView } from "@codemirror/view";
import * as React from "react";
import { Editor } from "@/components/Editor";
import { InsertPalette } from "@/components/InsertPalette";
import { Outline } from "@/components/Outline";
import { Preview } from "@/components/Preview";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSETS } from "@/generated/assets";
import { EXAMPLES } from "@/generated/examples";
import { coordEdits } from "@/lib/drag";
import { applySnippet, chalkSlashPalette } from "@/lib/insert";
import type { SnippetDef } from "@/lib/snippets";
import { buildShareUrl, readShareFromHash, SHARE_LIMIT } from "@/share";

function compile(source: string): { html: string; slides: number; error?: string } {
  return compileChalk(source, { assets: ASSETS });
}

const initialShared = readShareFromHash(location.hash);
const initialSource = initialShared ?? EXAMPLES[0]!.source;
const initialId = initialShared ? "shared" : EXAMPLES[0]!.id;

export function App(): React.ReactElement {
  const [source, setSource] = React.useState(initialSource);
  const [currentId, setCurrentId] = React.useState(initialId);
  const [html, setHtml] = React.useState(() => compile(initialSource).html);
  const [slides, setSlides] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const [freshKey, setFreshKey] = React.useState(0);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [showOutline, setShowOutline] = React.useState(true);
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const [editorView, setEditorView] = React.useState<EditorView | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const slashExtension = React.useMemo(() => [chalkSlashPalette()], []);

  // Reflect the preview's active slide in the outline (srcdoc iframes are
  // same-origin, so we can read the deck's active slide). Read-only.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        const active = doc?.querySelector(".slide.is-active");
        const idx = active ? Number(active.getAttribute("data-index")) : 0;
        setCurrentSlide((c) => (Number.isFinite(idx) && idx !== c ? idx : c));
      } catch {
        /* opaque-origin guard */
      }
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  const onInsert = (def: SnippetDef): void => {
    if (editorView) applySnippet(editorView, def);
  };

  // Read-only test hook: lets e2e tests assert the canonical document text.
  React.useEffect(() => {
    (window as unknown as { __chalkDoc?: () => string }).__chalkDoc = () =>
      editorView?.state.doc.toString() ?? "";
  }, [editorView]);

  // Drag-on-preview write-back: the deck posts new coords for a free-position
  // object; we rewrite ONLY its `at (…)` numbers as one transaction (one undo).
  React.useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const d = e.data as { source?: string; type?: string; span?: [number, number]; x?: number; y?: number };
      if (d?.source !== "chalk" || d.type !== "coords" || !editorView || !d.span) return;
      const edits = coordEdits(editorView.state.doc.toString(), d.span, d.x ?? 0, d.y ?? 0);
      if (edits) editorView.dispatch({ changes: edits });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editorView]);

  const showToast = React.useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }, []);

  const recompile = React.useCallback((src: string, fresh: boolean) => {
    const { html: out, slides: n, error: err } = compile(src);
    if (err || !out) {
      setError(`Compile error: ${err ?? "no output"}`); // keep last good deck
      return;
    }
    setError(null);
    if (fresh) setFreshKey((k) => k + 1);
    setHtml(out);
    setSlides(n);
  }, []);

  // Debounced live recompile on typing (keeps the current slide).
  const onSourceChange = React.useCallback(
    (src: string) => {
      setSource(src);
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => recompile(src, false), 250);
    },
    [recompile],
  );

  const loadExample = React.useCallback(
    (id: string) => {
      const ex = EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      setCurrentId(id);
      setSource(ex.source);
      recompile(ex.source, true); // fresh load → start at slide 1
    },
    [recompile],
  );

  const onPresent = (): void => {
    void iframeRef.current?.requestFullscreen?.();
  };

  const onShare = async (): Promise<void> => {
    const { url, encoded, overLimit } = buildShareUrl(location.href, source);
    if (overLimit) {
      showToast(
        `This deck is large (${encoded.length} > ${SHARE_LIMIT} chars); a URL may be truncated. Use Download instead.`,
        6000,
      );
      return;
    }
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied — opening a copy in a new tab…");
    } catch {
      showToast("Share link is in the address bar — opening a copy in a new tab…");
    }
    window.open(url, "_blank", "noopener");
  };

  const onDownload = (): void => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${currentId || "chalk-deck"}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <span className="font-semibold tracking-tight">
          Chalk <span className="text-muted-foreground font-normal">playground</span>
        </span>
        <span className="text-muted-foreground text-sm">Example</span>
        <Select value={EXAMPLES.some((e) => e.id === currentId) ? currentId : undefined} onValueChange={loadExample}>
          <SelectTrigger className="w-[260px]" data-testid="examples" aria-label="Load an example lecture">
            <SelectValue placeholder="Choose an example…" />
          </SelectTrigger>
          <SelectContent>
            {EXAMPLES.map((ex) => (
              <SelectItem key={ex.id} value={ex.id}>
                {ex.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button id="insert" variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
          + Insert
        </Button>
        <Button
          id="toggle-outline"
          variant="ghost"
          size="sm"
          aria-pressed={showOutline}
          onClick={() => setShowOutline((v) => !v)}
        >
          Outline
        </Button>
        <div className="flex-1" />
        <Button id="present" variant="outline" size="sm" onClick={onPresent}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" />
          </svg>
          Present
        </Button>
        <Button id="share" variant="outline" size="sm" onClick={() => void onShare()}>
          Share
        </Button>
        <Button id="download" variant="default" size="sm" onClick={onDownload}>
          Download
        </Button>
      </header>

      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
        key={showOutline ? "with-outline" : "no-outline"}
      >
        {showOutline && (
          <>
            <ResizablePanel defaultSize={20} minSize={12} className="bg-card/40">
              <Outline source={source} view={editorView} currentSlide={currentSlide} />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}
        <ResizablePanel defaultSize={showOutline ? 42 : 52} minSize={25} className="relative">
          <Editor
            value={source}
            onChange={onSourceChange}
            extensions={slashExtension}
            onReady={setEditorView}
          />
          {error && (
            <div
              role="alert"
              className="absolute inset-x-0 bottom-0 z-10 max-h-[40%] overflow-auto border-t-2 border-destructive bg-destructive/10 px-4 py-2 font-mono text-xs whitespace-pre-wrap"
            >
              {error}
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={showOutline ? 38 : 48} minSize={25} className="relative">
          <Preview html={html} freshKey={freshKey} iframeRef={iframeRef} />
          <div className="text-muted-foreground bg-background/70 pointer-events-none absolute bottom-2 right-2 rounded-md px-2 py-0.5 text-[11px]">
            {slides ? `${slides} slide${slides === 1 ? "" : "s"}` : ""}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <InsertPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={onInsert} />

      {toast && (
        <div className="bg-foreground text-background fixed bottom-5 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
