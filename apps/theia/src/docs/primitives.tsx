import { compileTheia } from "@theia/render-slides/core";
import * as React from "react";
import { ArrowRightIcon, CheckIcon, CopyIcon } from "@/components/icons";
import { ASSETS } from "@/generated/assets";
import { navigate, projectShareHref } from "@/lib/router";
import { DOC_EXAMPLES, type DocExampleId } from "@/docs/examples";

// --- prose ----------------------------------------------------------------
export const P = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <p className="text-muted-foreground my-3 leading-relaxed">{children}</p>
);
export const Lead = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <p className="text-foreground/80 mt-2 text-base leading-relaxed sm:text-lg">{children}</p>
);
export const Code = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
);
export const slug = (text: string): string =>
  text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
/** Flatten a heading's children (which may include inline <Code/>) to text. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}
export const H2 = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <h2 id={slug(textOf(children))} className="mt-10 scroll-mt-20 text-xl font-semibold tracking-tight">
    {children}
  </h2>
);
export const H3 = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <h3 id={slug(textOf(children))} className="mt-6 scroll-mt-20 text-base font-semibold">
    {children}
  </h3>
);
export const Ul = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <ul className="text-muted-foreground my-3 list-disc space-y-1 pl-6">{children}</ul>
);

export function Callout({ tone = "note", children }: { tone?: "note" | "warn" | "planned"; children: React.ReactNode }): React.ReactElement {
  const styles = {
    note: "border-live/40 bg-live/10",
    warn: "border-destructive/40 bg-destructive/10",
    planned: "border-muted-foreground/40 bg-muted",
  }[tone];
  const label = { note: "Note", warn: "Heads up", planned: "Planned" }[tone];
  return (
    <div className={`text-foreground/80 my-4 rounded-md border-l-2 px-3 py-2 text-sm ${styles}`}>
      <strong className={tone === "planned" ? "text-muted-foreground" : "text-live"}>{label} — </strong>
      {children}
    </div>
  );
}

// --- .theia code highlighting ---------------------------------------------
/** Lightweight, line-based highlighter mirroring the editor's token colours.
 * Display only — the parser is the source of truth. */
function highlightTheia(code: string): React.ReactNode {
  const inlineMath = (s: string): React.ReactNode =>
    s.split(/(\$[^$]*\$)/g).map((part, i) =>
      part.startsWith("$") && part.endsWith("$") && part.length > 1 ? (
        <span key={i} style={{ color: "hsl(var(--cm-string))" }}>{part}</span>
      ) : (
        part
      ),
    );
  return code.split("\n").map((line, i) => {
    let node: React.ReactNode = inlineMath(line);
    const t = line.trimStart();
    if (/^#{1,3}\s/.test(t)) node = <span className="text-foreground font-semibold">{line}</span>;
    else if (/^(:::|\+)/.test(t)) node = <span style={{ color: "hsl(var(--cm-keyword))", fontWeight: 600 }}>{line}</span>;
    else if (/^```/.test(t)) node = <span style={{ color: "hsl(var(--cm-string))" }}>{line}</span>;
    else if (/^@[A-Za-z]/.test(t)) {
      const m = /^(\s*@[\w]+)(.*)$/.exec(line)!;
      node = (
        <>
          <span style={{ color: "hsl(var(--live))", fontWeight: 600 }}>{m[1]}</span>
          {inlineMath(m[2]!)}
        </>
      );
    }
    return (
      <span key={i}>
        {node}
        {"\n"}
      </span>
    );
  });
}

export function DocCode({ code, lang = "theia" }: { code: string; lang?: "theia" | "bash" }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="bg-card relative my-4 overflow-hidden rounded-lg border shadow-1">
      <pre className="overflow-x-auto px-4 py-3 pr-12 font-mono text-[13px] leading-relaxed">
        <code>{lang === "theia" ? highlightTheia(code) : code}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        className="bg-background/80 text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2"
      >
        {copied ? <CheckIcon className="text-live size-4" /> : <CopyIcon className="size-4" />}
      </button>
    </div>
  );
}

// --- runnable example ------------------------------------------------------
/**
 * A doc example, cited by id from the verified manifest. Shows the highlighted
 * source + an "Open in Playground" link. When `live` (default true), a "Run"
 * button lazily mounts the real engine in an iframe — only on click, so heavy
 * runtimes (Pyodide / three.js) are never pulled until the reader asks.
 */
export function Example({ id, live = true }: { id: DocExampleId; live?: boolean }): React.ReactElement {
  const source = DOC_EXAMPLES[id];
  const [html, setHtml] = React.useState<string | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  React.useEffect(() => {
    if (html && iframeRef.current) iframeRef.current.srcdoc = html;
  }, [html]);

  return (
    <div className="my-4">
      <DocCode code={source} />
      <div className="-mt-2 mb-2 flex items-center gap-3">
        {live && (
          <button
            type="button"
            onClick={() => setHtml(compileTheia(source, { assets: ASSETS }).html)}
            className="text-live text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            ▶ Run here
          </button>
        )}
        <a
          href={projectShareHref(source)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            navigate(projectShareHref(source));
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
        >
          Open in Playground <ArrowRightIcon className="size-3.5" />
        </a>
      </div>
      {html && (
        <div className="bg-background ring-border aspect-[16/9] w-full overflow-hidden rounded-lg shadow-2 ring-1">
          <iframe ref={iframeRef} title={`Live example: ${id}`} className="h-full w-full border-0" />
        </div>
      )}
    </div>
  );
}
