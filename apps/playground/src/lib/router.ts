import * as React from "react";

/**
 * Tiny path-based router (no dependency). Real URLs so projects are bookmarkable
 * and back/forward works:
 *   /                      → dashboard (default landing)
 *   /projects              → dashboard
 *   /projects/:id          → that project's editor
 *   <any> with #c=…        → an ephemeral shared deck (the share fragment wins)
 */
export type Route =
  | { kind: "dashboard" }
  | { kind: "project"; id: string }
  | { kind: "shared" };

export function parseRoute(): Route {
  if (/[#&]c=/.test(location.hash)) return { kind: "shared" };
  const m = /^\/projects\/([^/]+)\/?$/.exec(location.pathname);
  if (m) return { kind: "project", id: decodeURIComponent(m[1]!) };
  return { kind: "dashboard" };
}

export const projectPath = (id: string): string => `/projects/${encodeURIComponent(id)}`;
export const DASHBOARD_PATH = "/projects";

const NAV_EVENT = "chalk:navigate";

/** Navigate to `path` (pushState) and notify subscribers. Clears the hash. */
export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Subscribe a component to route changes (back/forward + navigate()). */
export function useRoute(): Route {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const onChange = (): void => force();
    window.addEventListener("popstate", onChange);
    window.addEventListener(NAV_EVENT, onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(NAV_EVENT, onChange);
    };
  }, []);
  return parseRoute();
}
