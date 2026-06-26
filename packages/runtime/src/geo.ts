/**
 * GeoGebra embedding via the official deployggb API.
 *
 * NOTE: this is the one part of a Chalk deck that is *not* offline — it loads
 * `deployggb.js` from geogebra.org, and only when a `:::geo` block exists on a
 * slide. Everything else in the bundle works with no network.
 */

const DEPLOY_URL = "https://www.geogebra.org/apps/deployggb.js";

interface GGBAppletApi {
  evalCommand(cmd: string): boolean;
}
interface GGBAppletCtor {
  new (
    params: Record<string, unknown>,
    skipMissing?: boolean,
  ): { inject(el: HTMLElement | string): void };
}
declare global {
  interface Window {
    GGBApplet?: GGBAppletCtor;
  }
}

let deployPromise: Promise<void> | null = null;

/** Load deployggb.js exactly once. Resolves immediately if already present. */
function loadDeploy(): Promise<void> {
  if (window.GGBApplet) return Promise.resolve();
  if (deployPromise) return deployPromise;
  deployPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = DEPLOY_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load GeoGebra"));
    document.head.appendChild(script);
  });
  return deployPromise;
}

export interface GeoSpec {
  /** The container element the applet is injected into. */
  container: HTMLElement;
  /** GeoGebra command lines from the `:::geo` block body. */
  commands: string[];
}

/** Initialize every geometry block on the page. Failures degrade to a notice
 * rather than breaking the deck. */
export function initGeo(specs: GeoSpec[]): void {
  if (specs.length === 0) return;
  loadDeploy()
    .then(() => {
      for (const spec of specs) {
        const Ctor = window.GGBApplet;
        if (!Ctor) return;
        const applet = new Ctor(
          {
            appName: "graphing",
            width: spec.container.clientWidth || 700,
            height: spec.container.clientHeight || 360,
            showToolBar: false,
            showMenuBar: false,
            showAlgebraInput: false,
            showResetIcon: true,
            enableLabelDrags: false,
            enableShiftDragZoom: true,
            appletOnLoad: (api: GGBAppletApi) => {
              for (const cmd of spec.commands) {
                const line = cmd.trim();
                if (line) api.evalCommand(line);
              }
            },
          },
          true,
        );
        applet.inject(spec.container);
      }
    })
    .catch(() => {
      for (const spec of specs) {
        spec.container.textContent =
          "GeoGebra could not be loaded (needs an internet connection).";
        spec.container.classList.add("chalk-geo__error");
      }
    });
}
