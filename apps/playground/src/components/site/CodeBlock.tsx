import * as React from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

/** A code block with a copy-to-clipboard button + copied-state feedback. */
export function CodeBlock({ code, label }: { code: string; label?: string }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="bg-card relative overflow-hidden rounded-lg border shadow-1">
      {label && (
        <div className="text-muted-foreground border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3 pr-12 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
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
