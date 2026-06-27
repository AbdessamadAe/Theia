import * as React from "react";
import logoUrl from "../../../assets/logo.png";
import { BoardIcon, WordmarkFlourish } from "@/components/chalk-art";
import { GithubIcon, MoonIcon } from "@/components/icons";
import { Segmented } from "@/components/ui/segmented";
import { DASHBOARD_PATH, DOCS_PATH, GALLERY_PATH, LANDING_PATH, navigate } from "@/lib/router";
import { GITHUB_URL, LICENSE } from "@/lib/site";
import type { Theme } from "@/lib/theme";

/** An internal link that uses the client router (keeps the SPA shell). */
function NavLink({ to, children }: { to: string; children: React.ReactNode }): React.ReactElement {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return; // allow open-in-new-tab
        e.preventDefault();
        navigate(to);
      }}
      className="text-muted-foreground hover:text-foreground rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }): React.ReactElement {
  return (
    <Segmented
      aria-label="Theme"
      value={theme}
      onChange={setTheme}
      className="p-0.5"
      options={[
        { value: "chalkboard", label: <BoardIcon className="size-4" />, ariaLabel: "Chalk theme", title: "Chalk" },
        { value: "dark", label: <MoonIcon className="size-4" />, ariaLabel: "Dark theme", title: "Dark" },
      ]}
    />
  );
}

export function SiteHeader({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }): React.ReactElement {
  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a
          href={LANDING_PATH}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            navigate(LANDING_PATH);
          }}
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          aria-label="Chalk home"
        >
          <img src={logoUrl} alt="" width={30} height={30} className="ring-border size-7 rounded-lg shadow-1 ring-1" />
          <span className="chalk-wordmark relative font-serif text-xl font-semibold tracking-tight">
            Chalk
            <WordmarkFlourish className="chalk-flourish text-live absolute -bottom-1.5 left-0 hidden h-2 w-full" />
          </span>
        </a>

        <nav className="ml-2 hidden items-center gap-5 sm:flex" aria-label="Primary">
          <NavLink to={DASHBOARD_PATH}>Playground</NavLink>
          <NavLink to={GALLERY_PATH}>Gallery</NavLink>
          <NavLink to={DOCS_PATH}>Docs</NavLink>
        </nav>

        <div className="flex-1" />
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground hidden items-center gap-1.5 text-sm font-medium sm:flex"
        >
          <GithubIcon className="size-4" /> GitHub
        </a>
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
    </header>
  );
}

export function SiteFooter(): React.ReactElement {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="" width={24} height={24} className="size-6 rounded-md" />
            <span className="text-foreground font-serif text-lg font-semibold">Chalk</span>
          </div>
          <p className="max-w-xs text-sm">
            Built so educators can present mathematics that actually moves. Free and open source.
          </p>
        </div>
        <nav aria-label="Footer" className="space-y-2 text-sm">
          <div className="text-foreground font-medium">Product</div>
          <a className="hover:text-foreground block" href={DASHBOARD_PATH} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(DASHBOARD_PATH); } }}>Playground</a>
          <a className="hover:text-foreground block" href={GALLERY_PATH} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(GALLERY_PATH); } }}>Gallery</a>
          <a className="hover:text-foreground block" href={DOCS_PATH} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(DOCS_PATH); } }}>Docs</a>
        </nav>
        <nav aria-label="Open source" className="space-y-2 text-sm">
          <div className="text-foreground font-medium">Open source</div>
          <a className="hover:text-foreground block" href={GITHUB_URL} target="_blank" rel="noreferrer">Repository</a>
          <a className="hover:text-foreground block" href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">Issues</a>
          <a className="hover:text-foreground block" href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">Contributing</a>
        </nav>
      </div>
      <div className="text-muted-foreground mx-auto max-w-6xl px-4 pb-8 text-xs sm:px-6">
        {LICENSE}-licensed · runs entirely in your browser, no account needed.
      </div>
    </footer>
  );
}
