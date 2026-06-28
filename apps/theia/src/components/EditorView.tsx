import { compileTheia } from "@theia/render-slides/core";
import type { EditorView as CMView } from "@codemirror/view";
import * as React from "react";
import logoUrl from "../../assets/logo.png";
import { Editor } from "@/components/Editor";
import {
  DownloadIcon,
  HomeIcon,
  ImageIcon,
  MoonIcon,
  PanelLeftIcon,
  PresentIcon,
  ShareIcon,
  SparkIcon,
} from "@/components/icons";
import { BoardIcon } from "@/components/theia-art";
import { InsertPalette } from "@/components/InsertPalette";
import { Outline } from "@/components/Outline";
import { PreviewFrame } from "@/components/PreviewFrame";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Segmented } from "@/components/ui/segmented";
import { Hint } from "@/components/ui/tooltip";
import { ASSETS } from "@/generated/assets";
import { isQuotaError, subscribeSaves, updateFileSource } from "@/lib/db";
import { debounce } from "@/lib/debounce";
import { coordEdits } from "@/lib/drag";
import { applySnippet, theiaSlashPalette } from "@/lib/insert";
import type { SnippetDef } from "@/lib/snippets";
import { useMediaQuery } from "@/lib/use-media-query";
import { buildShareUrl, MEDIA_INLINE_BUDGET, SHARE_LIMIT } from "@/share";
import type { Theme } from "@/lib/theme";

function compile(source: string): { html: string; slides: number; error?: string } {
  return compileTheia(source, { assets: ASSETS });
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface EditorViewProps {
  /** The file being edited, or null for an ephemeral (shared/unsaved) session. */
  fileId: string | null;
  initialSource: string;
  projectName: string;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onHome: () => void;
  /** Persist an ephemeral session as a real project. */
  onSaveAsProject: (source: string) => void;
}

export function EditorView({
  fileId,
  initialSource,
  projectName,
  theme,
  setTheme,
  onHome,
  onSaveAsProject,
}: EditorViewProps): React.ReactElement {
  const firstCompile = React.useMemo(() => compile(initialSource), [initialSource]);
  const [source, setSource] = React.useState(initialSource);
  const [html, setHtml] = React.useState(firstCompile.html);
  const [slides, setSlides] = React.useState(firstCompile.slides);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>(fileId ? "saved" : "idle");
  const [staleTab, setStaleTab] = React.useState(false);

  const [freshKey, setFreshKey] = React.useState(0);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [showOutline, setShowOutline] = React.useState(true);
  const [currentSlide, setCurrentSlide] = React.useState(0);
  const [editorView, setEditorView] = React.useState<CMView | null>(null);
  const [mobileView, setMobileView] = React.useState<"editor" | "preview">("preview");
  const compact = useMediaQuery("(max-width: 1023px)");

  const timer = React.useRef<number | undefined>(undefined);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const mediaCounter = React.useRef(0);
  const lastSavedAt = React.useRef(0);
  const mounted = React.useRef(true);
  const slashExtension = React.useMemo(() => [theiaSlashPalette()], []);

  const showToast = React.useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }, []);

  // --- Autosave (debounced) → IndexedDB; never lose work on refresh/crash ----
  const saver = React.useMemo(
    () =>
      debounce((src: string) => {
        if (!fileId) return;
        setSaveStatus("saving");
        updateFileSource(fileId, src)
          .then((t) => {
            lastSavedAt.current = t;
            if (mounted.current) setSaveStatus("saved");
          })
          .catch((e) => {
            if (mounted.current) setSaveStatus("error");
            showToast(
              isQuotaError(e)
                ? "Storage is full — export a project to free space. Your text is safe in the editor."
                : "Couldn’t save to this device — your text is safe in the editor.",
              7000,
            );
          });
      }, 600),
    [fileId, showToast],
  );
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saver.flush(); // persist the last edit on unmount / project switch
    };
  }, [saver]);

  // Another tab saved this same file → warn, never silently clobber.
  React.useEffect(() => {
    if (!fileId) return;
    return subscribeSaves((e) => {
      if (e.fileId === fileId && e.updatedAt > lastSavedAt.current) setStaleTab(true);
    });
  }, [fileId]);

  // Theme → live deck (the chrome class is handled by the app router).
  React.useEffect(() => {
    const deckTheme = theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("theia-theme", deckTheme);
    } catch {
      /* storage unavailable */
    }
    try {
      iframeRef.current?.contentDocument?.documentElement.setAttribute("data-theme", deckTheme);
    } catch {
      /* opaque-origin guard */
    }
  }, [theme, html]);

  // Reflect the preview's active slide in the outline.
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

  // Read-only test hook.
  React.useEffect(() => {
    (window as unknown as { __theiaDoc?: () => string }).__theiaDoc = () =>
      editorView?.state.doc.toString() ?? "";
  }, [editorView]);

  // Drag-on-preview write-back.
  React.useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const d = e.data as { source?: string; type?: string; span?: [number, number]; x?: number; y?: number };
      if (d?.source !== "theia" || d.type !== "coords" || !editorView || !d.span) return;
      const edits = coordEdits(editorView.state.doc.toString(), d.span, d.x ?? 0, d.y ?? 0);
      if (edits) editorView.dispatch({ changes: edits });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editorView]);

  const recompile = React.useCallback((src: string, fresh: boolean) => {
    const { html: out, slides: n, error: err } = compile(src);
    if (err || !out) {
      setError(`Compile error: ${err ?? "no output"}`);
      return;
    }
    setError(null);
    if (fresh) setFreshKey((k) => k + 1);
    setHtml(out);
    setSlides(n);
  }, []);

  const onSourceChange = React.useCallback(
    (src: string) => {
      setSource(src);
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => recompile(src, false), 250);
      saver(src); // debounced autosave
    },
    [recompile, saver],
  );

  const onPresent = (): void => void iframeRef.current?.requestFullscreen?.();

  const onShare = async (): Promise<void> => {
    const { url, encoded, overLimit } = buildShareUrl(location.href, source);
    if (overLimit) {
      showToast(
        `This deck is large (${encoded.length} > ${SHARE_LIMIT} chars); a URL may be truncated. Use Download or Export instead.`,
        6000,
      );
      return;
    }
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied (ephemeral, one file) — opening a copy in a new tab…");
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
    a.download = `${projectName || "theia-deck"}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  const ingestFile = React.useCallback(
    (file: File): void => {
      if (file.type.startsWith("video/")) {
        showToast('Videos can’t be embedded. Reference a remote URL: @video clip of "https://…".', 6500);
        return;
      }
      if (!file.type.startsWith("image/")) {
        showToast("Only image files can be dropped into the editor.", 5000);
        return;
      }
      if (file.size > MEDIA_INLINE_BUDGET) {
        showToast(
          `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB — too large to embed. Use a remote https URL.`,
          7000,
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = (): void => {
        insertImage(String(reader.result), file.name.replace(/\.[^.]+$/, ""));
        showToast(`Embedded “${file.name}” (${(file.size / 1024).toFixed(0)} KB).`);
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
      <Editor value={source} onChange={onSourceChange} extensions={slashExtension} onReady={setEditorView} />
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
    <PreviewFrame html={html} freshKey={freshKey} iframeRef={iframeRef} slides={slides} currentSlide={currentSlide} />
  );

  const saveIndicator =
    fileId === null ? (
      <Button variant="live" size="sm" onClick={() => onSaveAsProject(source)}>
        Save to projects
      </Button>
    ) : (
      <span
        className="text-muted-foreground hidden text-xs tabular-nums sm:inline"
        aria-live="polite"
        title="Projects are saved on this device"
      >
        {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved"}
      </span>
    );

  return (
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

      {staleTab && (
        <div
          role="alert"
          className="bg-destructive/15 text-foreground flex items-center justify-center gap-3 border-b border-destructive/40 px-4 py-1.5 text-sm"
        >
          This project was edited in another tab.
          <button className="text-live font-medium underline" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}

      <header className="bg-card/60 flex items-center gap-2 border-b px-3 py-2 backdrop-blur sm:gap-3 sm:px-4">
        <Hint label="Back to projects">
          <button
            id="home"
            onClick={onHome}
            aria-label="Back to projects"
            className="focus-visible:ring-ring flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2"
          >
            <img src={logoUrl} alt="Theia" width={28} height={28} className="ring-border size-7 rounded-lg shadow-1 ring-1" />
            <HomeIcon className="text-muted-foreground size-4" />
          </button>
        </Hint>

        <div className="bg-border mx-0.5 h-5 w-px" />
        <span className="max-w-[22ch] truncate text-sm font-medium" title={projectName}>
          {projectName}
        </span>
        {saveIndicator}

        <div className="bg-border mx-1 hidden h-5 w-px lg:block" />

        <div className="hidden items-center gap-1 lg:flex">
          <Hint label="Insert a construct (⌘K)">
            <Button id="insert" variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
              <SparkIcon />
              Insert
            </Button>
          </Hint>
          <Hint label="Insert an image (or drop one in)">
            <Button id="insert-image" variant="ghost" size="icon" className="h-8 w-8" aria-label="Insert an image" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon />
            </Button>
          </Hint>
          <Hint label={showOutline ? "Hide outline" : "Show outline"}>
            <Button id="toggle-outline" variant={showOutline ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-pressed={showOutline} aria-label="Toggle outline" onClick={() => setShowOutline((v) => !v)}>
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
          <Hint label="Copy a shareable link (ephemeral, one file)">
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
            { value: "theiaboard", label: <BoardIcon className="size-4" />, ariaLabel: "Theia theme", title: "Theia" },
            { value: "dark", label: <MoonIcon className="size-4" />, ariaLabel: "Dark theme", title: "Dark" },
          ]}
        />
      </header>

      {compact ? (
        <div className="relative min-h-0 flex-1">
          <div className={mobileView === "editor" ? "h-full" : "hidden"}>{editorPane}</div>
          <div className={mobileView === "preview" ? "h-full" : "hidden"}>{previewPane}</div>
        </div>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1" key={showOutline ? "with-outline" : "no-outline"}>
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
        <div role="status" className="bg-foreground text-background fixed bottom-5 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-3">
          {toast}
        </div>
      )}
    </div>
  );
}
