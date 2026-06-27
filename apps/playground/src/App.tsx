import { compileChalk } from "@chalk/render-slides/core";
import type { EditorView } from "@codemirror/view";
import * as React from "react";
import { BoardIcon, WordmarkFlourish } from "@/components/chalk-art";
import { Editor } from "@/components/Editor";
import {
  DownloadIcon,
  ImageIcon,
  MoonIcon,
  PanelLeftIcon,
  PresentIcon,
  ShareIcon,
  SparkIcon,
  SunIcon,
} from "@/components/icons";
import { InsertPalette } from "@/components/InsertPalette";
import { Outline } from "@/components/Outline";
import { PreviewFrame } from "@/components/PreviewFrame";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint, TooltipProvider } from "@/components/ui/tooltip";
import { ASSETS } from "@/generated/assets";
import { EXAMPLES } from "@/generated/examples";
import { coordEdits } from "@/lib/drag";
import { applySnippet, chalkSlashPalette } from "@/lib/insert";
import type { SnippetDef } from "@/lib/snippets";
import { useMediaQuery } from "@/lib/use-media-query";
import { buildShareUrl, MEDIA_INLINE_BUDGET, readShareFromHash, SHARE_LIMIT } from "@/share";

function compile(source: string): { html: string; slides: number; error?: string } {
  return compileChalk(source, { assets: ASSETS });
}

const initialShared = readShareFromHash(location.hash);
const initialSource = initialShared ?? EXAMPLES[0]!.source;
const initialId = initialShared ? "shared" : EXAMPLES[0]!.id;
const initialCompiled = compile(initialSource);

export function App(): React.ReactElement {
  const [source, setSource] = React.useState(initialSource);
  const [currentId, setCurrentId] = React.useState(initialId);
  const [html, setHtml] = React.useState(initialCompiled.html);
  const [slides, setSlides] = React.useState(initialCompiled.slides);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const [freshKey, setFreshKey] = React.useState(0);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [showOutline, setShowOutline] = React.useState(true);
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const [editorView, setEditorView] = React.useState<EditorView | null>(null);
  const [theme, setTheme] = React.useState<"light" | "dark" | "chalkboard">(() => {
    const c = document.documentElement.classList;
    return c.contains("chalkboard") ? "chalkboard" : c.contains("dark") ? "dark" : "light";
  });
  const [mobileView, setMobileView] = React.useState<"editor" | "preview">("preview");
  const compact = useMediaQuery("(max-width: 1023px)");

  const timer = React.useRef<number | undefined>(undefined);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const mediaCounter = React.useRef(0);
  const slashExtension = React.useMemo(() => [chalkSlashPalette()], []);

  // Apply the theme to the chrome and sync the live deck via the engine's
  // existing data-theme attribute + the shared localStorage key it reads.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("chalkboard", theme === "chalkboard");
    // The deck inside the iframe stays a clean light/dark card; chalkboard maps
    // to the light deck so slides/math/plots stay crisp and readable.
    const deckTheme = theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("chalk-pg-theme", theme);
      localStorage.setItem("chalk-theme", deckTheme);
    } catch {
      /* storage unavailable */
    }
    try {
      iframeRef.current?.contentDocument?.documentElement.setAttribute("data-theme", deckTheme);
    } catch {
      /* opaque-origin guard */
    }
  }, [theme, html]);

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

  // Insert a standalone @image block (a data: URI) at the caret — canonical
  // source, so it round-trips through the share-URL within budget.
  const insertImage = (dataUrl: string, alt: string): void => {
    const view = editorView;
    if (!view) return;
    const name = `img${++mediaCounter.current}`;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const insert = `\n\n@image ${name} of "${dataUrl}" alt:"${alt.replace(/"/g, "")}"\n`;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + insert.length },
    });
    view.focus();
  };

  // Ingest a dropped/picked asset. The hard rule: never inline anything that
  // would silently break a shared link.
  const ingestFile = React.useCallback(
    (file: File): void => {
      if (file.type.startsWith("video/")) {
        showToast(
          'Videos can’t be embedded in the playground. Reference a remote URL: @video clip of "https://…".',
          6500,
        );
        return;
      }
      if (!file.type.startsWith("image/")) {
        showToast("Only image files can be dropped in (videos need a remote https URL).", 5000);
        return;
      }
      if (file.size > MEDIA_INLINE_BUDGET) {
        showToast(
          `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB — too large to embed in a shareable link. ` +
            "Use a remote https URL, or Download a self-contained file.",
          7000,
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = (): void => {
        insertImage(String(reader.result), file.name.replace(/\.[^.]+$/, ""));
        showToast(`Embedded “${file.name}” (${(file.size / 1024).toFixed(0)} KB) — shareable via link.`);
      };
      reader.readAsDataURL(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorView, showToast],
  );

  const onDrop = (e: React.DragEvent): void => {
    const file = Array.from(e.dataTransfer.files)[0];
    if (!file) return;
    e.preventDefault();
    ingestFile(file);
  };

  const editorPane = (
    <div className="relative h-full">
      <Editor
        value={source}
        onChange={onSourceChange}
        extensions={slashExtension}
        onReady={setEditorView}
      />
      {error && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive-foreground absolute inset-x-3 bottom-3 z-10 max-h-[40%] overflow-auto rounded-lg border border-destructive/40 shadow-2"
        >
          <div className="text-destructive flex items-center gap-2 border-b border-destructive/20 px-3 py-1.5 text-xs font-semibold">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
            </svg>
            Compile error
          </div>
          <pre className="text-foreground/80 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
            {error.replace(/^Compile error:\s*/, "")}
          </pre>
        </div>
      )}
    </div>
  );

  const previewPane = (
    <PreviewFrame
      html={html}
      freshKey={freshKey}
      iframeRef={iframeRef}
      slides={slides}
      currentSlide={currentSlide}
    />
  );

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={200}>
      <div
        data-app-root
        className="bg-background flex h-full flex-col"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) ingestFile(f);
            e.target.value = "";
          }}
        />
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="bg-card/60 flex items-center gap-2 border-b px-3 py-2 backdrop-blur sm:gap-3 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="chalk-wordmark relative font-serif text-xl font-semibold tracking-tight">
              Chalk
              <WordmarkFlourish className="chalk-flourish text-live absolute -bottom-1.5 left-0 hidden h-2 w-full" />
            </span>
            <span className="text-muted-foreground hidden text-sm sm:inline">playground</span>
          </div>

          <div className="bg-border mx-1 hidden h-5 w-px sm:block" />

          <Select
            value={EXAMPLES.some((e) => e.id === currentId) ? currentId : undefined}
            onValueChange={loadExample}
          >
            <SelectTrigger
              className="h-8 w-[150px] sm:w-[230px]"
              data-testid="examples"
              aria-label="Load an example lecture"
            >
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

          <div className="hidden items-center gap-1 lg:flex">
            <Hint label="Insert a construct (⌘K)">
              <Button id="insert" variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
                <SparkIcon />
                Insert
              </Button>
            </Hint>
            <Hint label="Insert an image (or drop one in)">
              <Button
                id="insert-image"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Insert an image"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon />
              </Button>
            </Hint>
            <Hint label={showOutline ? "Hide outline" : "Show outline"}>
              <Button
                id="toggle-outline"
                variant={showOutline ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                aria-pressed={showOutline}
                aria-label="Toggle outline"
                onClick={() => setShowOutline((v) => !v)}
              >
                <PanelLeftIcon />
              </Button>
            </Hint>
          </div>

          <div className="flex-1" />

          {compact && (
            <Segmented
              aria-label="Editor or preview"
              value={mobileView}
              onChange={setMobileView}
              options={[
                { value: "editor", label: "Edit" },
                { value: "preview", label: "Preview" },
              ]}
            />
          )}

          <div className="hidden items-center gap-1.5 sm:flex">
            <Hint label="Present fullscreen">
              <Button id="present" variant="outline" size="sm" onClick={onPresent}>
                <PresentIcon />
                <span className="hidden md:inline">Present</span>
              </Button>
            </Hint>
            <Hint label="Copy a shareable link">
              <Button id="share" variant="outline" size="sm" onClick={() => void onShare()}>
                <ShareIcon />
                <span className="hidden md:inline">Share</span>
              </Button>
            </Hint>
            <Hint label="Download a standalone .html deck">
              <Button id="download" variant="live" size="sm" onClick={onDownload}>
                <DownloadIcon />
                <span className="hidden md:inline">Download</span>
              </Button>
            </Hint>
          </div>

          <div className="bg-border mx-0.5 h-5 w-px" />

          <Segmented
            aria-label="Theme"
            value={theme}
            onChange={setTheme}
            className="p-0.5"
            options={[
              { value: "light", label: <SunIcon className="size-4" />, ariaLabel: "Light theme", title: "Light" },
              { value: "dark", label: <MoonIcon className="size-4" />, ariaLabel: "Dark theme", title: "Dark" },
              {
                value: "chalkboard",
                label: <BoardIcon className="size-4" />,
                ariaLabel: "Chalkboard theme",
                title: "Chalkboard",
              },
            ]}
          />
        </header>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        {compact ? (
          <div className="relative min-h-0 flex-1">
            <div className={mobileView === "editor" ? "h-full" : "hidden"}>{editorPane}</div>
            <div className={mobileView === "preview" ? "h-full" : "hidden"}>{previewPane}</div>
          </div>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            className="min-h-0 flex-1"
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
            <ResizablePanel defaultSize={showOutline ? 42 : 52} minSize={25}>
              {editorPane}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={showOutline ? 38 : 48} minSize={25}>
              {previewPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        <InsertPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={onInsert} />

        {toast && (
          <div
            role="status"
            className="bg-foreground text-background fixed bottom-5 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-3"
          >
            {toast}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
