import * as React from "react";
// TODO(theia-rebrand): assets/logo.png is the legacy mark — a stroke that reads
// as a "C" (from the old name). It no longer matches "Theia"; regenerate the
// icon (the text wordmark already says "Theia"). Tracked as a design follow-up.
import logoUrl from "../assets/logo.png";
import { Dashboard } from "@/components/Dashboard";
import { Docs } from "@/components/Docs";
import { EditorView } from "@/components/EditorView";
import { Gallery } from "@/components/Gallery";
import { Landing } from "@/components/Landing";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type TheiaFile, createProject, getPrimaryFile, getProject, type Project } from "@/lib/db";
import { DASHBOARD_PATH, navigate, projectPath, useRoute } from "@/lib/router";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { readShareFromHash } from "@/share";

/**
 * Top-level router (path-based — see lib/router). `/` and `/projects` show the
 * dashboard; `/projects/:id` opens that project's editor; any URL carrying a
 * `#c=` share fragment opens an ephemeral shared deck. The URL is the source of
 * truth, so a refresh reopens whatever you were on.
 */
export function App(): React.ReactElement {
  const [theme, setThemeState] = React.useState<Theme>(() => readTheme());
  const route = useRoute();

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  }, []);
  React.useEffect(() => applyTheme(theme), [theme]);

  // Per-route document title (basic SEO / tab clarity).
  React.useEffect(() => {
    const titles: Record<string, string> = {
      landing: "Theia — Live, interactive math slides from plain text",
      gallery: "Gallery — Theia",
      docs: "Docs — Theia",
      dashboard: "Your projects — Theia",
      project: "Editor — Theia",
      shared: "Shared deck — Theia",
    };
    document.title = titles[route.kind] ?? "Theia";
  }, [route.kind]);

  // Load the project named by /projects/:id.
  const [loaded, setLoaded] = React.useState<{ project: Project; file?: TheiaFile } | "loading">(
    "loading",
  );
  const projectId = route.kind === "project" ? route.id : null;
  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoaded("loading");
    void (async () => {
      const project = await getProject(projectId);
      if (!project) {
        if (!cancelled) navigate(DASHBOARD_PATH, true); // unknown id → dashboard
        return;
      }
      const file = await getPrimaryFile(projectId);
      if (!cancelled) setLoaded({ project, file });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const saveAsProject = React.useCallback(async (source: string) => {
    try {
      const { project } = await createProject("Shared deck", source);
      navigate(projectPath(project.id)); // also drops the #c= fragment
    } catch {
      /* storage error — stay ephemeral */
    }
  }, []);

  const splash = (
    <div className="bg-background flex h-full items-center justify-center">
      <img src={logoUrl} alt="" width={48} height={48} className="size-12 rounded-xl opacity-80" />
    </div>
  );

  let body: React.ReactElement;
  if (route.kind === "landing") {
    body = <Landing theme={theme} setTheme={setTheme} />;
  } else if (route.kind === "gallery") {
    body = <Gallery theme={theme} setTheme={setTheme} />;
  } else if (route.kind === "docs") {
    body = <Docs theme={theme} setTheme={setTheme} page={route.page} />;
  } else if (route.kind === "dashboard") {
    body = <Dashboard theme={theme} setTheme={setTheme} onOpen={(id) => navigate(projectPath(id))} />;
  } else if (route.kind === "shared") {
    body = (
      <EditorView
        key="shared"
        fileId={null}
        projectName="Shared deck"
        initialSource={readShareFromHash(location.hash) ?? ""}
        theme={theme}
        setTheme={setTheme}
        onHome={() => navigate(DASHBOARD_PATH)}
        onSaveAsProject={(s) => void saveAsProject(s)}
      />
    );
  } else if (loaded === "loading") {
    body = splash;
  } else {
    body = (
      <EditorView
        key={loaded.file?.id ?? loaded.project.id}
        fileId={loaded.file?.id ?? null}
        projectName={loaded.project.name}
        initialSource={loaded.file?.source ?? ""}
        theme={theme}
        setTheme={setTheme}
        onHome={() => navigate(DASHBOARD_PATH)}
        onSaveAsProject={(s) => void saveAsProject(s)}
      />
    );
  }

  return <TooltipProvider delayDuration={350} skipDelayDuration={200}>{body}</TooltipProvider>;
}
