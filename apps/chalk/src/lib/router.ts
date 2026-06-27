import * as React from "react";
import { encodeSource } from "@/share";

/**
 * Tiny path-based router (no dependency). Real URLs so pages are bookmarkable
 * and back/forward works:
 *   /                      → landing page (default)
 *   /projects              → project dashboard (the playground home)
 *   /projects/:id          → that project's editor
 *   /gallery               → example gallery
 *   /docs[/:page]          → documentation
 *   <any> with #c=…        → an ephemeral shared deck (the share fragment wins)
 */
export type Route =
  | { kind: "landing" }
  | { kind: "gallery" }
  | { kind: "docs"; page: string }
  | { kind: "dashboard" }
  | { kind: "project"; id: string }
  | { kind: "shared" };

export function parseRoute(): Route {
  if (/[#&]c=/.test(location.hash)) return { kind: "shared" };
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { kind: "landing" };
  if (path === "/projects") return { kind: "dashboard" };
  const proj = /^\/projects\/([^/]+)$/.exec(path);
  if (proj) return { kind: "project", id: decodeURIComponent(proj[1]!) };
  if (path === "/gallery") return { kind: "gallery" };
  const docs = /^\/docs(?:\/([^/]+))?$/.exec(path);
  if (docs) return { kind: "docs", page: docs[1] ?? "intro" };
  return { kind: "landing" };
}

export const LANDING_PATH = "/";
export const DASHBOARD_PATH = "/projects";
export const GALLERY_PATH = "/gallery";
export const DOCS_PATH = "/docs";
export const projectPath = (id: string): string => `/projects/${encodeURIComponent(id)}`;
export const docsPath = (page: string): string => `/docs/${page}`;
/** Open a source as an ephemeral shared deck (reuses the share-URL encoding). */
export const projectShareHref = (source: string): string => `/#c=${encodeSource(source)}`;

const NAV_EVENT = "chalk:navigate";

/** Navigate to `path` (pushState) and notify subscribers. */
export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.scrollTo(0, 0);
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
