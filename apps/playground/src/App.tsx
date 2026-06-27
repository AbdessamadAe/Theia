import * as React from "react";
import logoUrl from "../assets/logo.png";
import { Dashboard } from "@/components/Dashboard";
import { EditorView } from "@/components/EditorView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type ChalkFile, createProject, getPrimaryFile, getProject, type Project } from "@/lib/db";
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

  // Load the project named by /projects/:id.
  const [loaded, setLoaded] = React.useState<{ project: Project; file?: ChalkFile } | "loading">(
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
  if (route.kind === "dashboard") {
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
