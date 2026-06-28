/**
 * `:::scene` runtime (Phase 8, sub-phase A — graphing backbone).
 *
 * A scene owns ONE canvas plus a DOM overlay for labels. Coordinate systems
 * (axes / numberline) build a {@link CoordSystem}; objects declared `on` them
 * store data-space expressions and are mapped to pixels at draw time. Every
 * expression re-evaluates from the shared reactive graph each redraw, so a
 * curve/area/tangent bound to a slider updates live. `+animate` verbs join the
 * existing advance flow via the `theia:advance` event.
 *
 * Performance: one scene = one canvas + one graph dependent. The dependent
 * schedules a single rAF-coalesced redraw, so N reactive objects cost one
 * clear+draw per frame, not N. Animations share that same rAF loop.
 *
 * Canvas (not SVG) because graphing is sample-heavy and redrawn every frame on
 * a drag; labels are DOM so they can carry text/math.
 */
import { type CoordSystem, makeCoordSystem, niceStep, parseRange } from "./coord.js";
import { boundVars, isDraggablePosition } from "./drag.js";
import { type CompiledExpr, compileExpr } from "./expr.js";
import { type Edge, layoutGraph, type Layout, parseEdges, pathEdges } from "./graph-layout.js";
import { parseMediaSegment } from "./media.js";
import { directionVector, placementOrder } from "./placement.js";
import { initScene3D, type Scene3DOptions } from "./scene3d.js";

/** Parse a `"dx, dy"` tuple into a numeric pair (NaN-safe). */
function parsePair(s: string | undefined): [number, number] | undefined {
  if (!s) return undefined;
  const m = s.split(",").map((p) => parseFloat(p.trim()));
  return m.length === 2 && m.every((n) => Number.isFinite(n)) ? [m[0]!, m[1]!] : undefined;
}

interface GraphLike {
  get(name: string): number | undefined;
  scope(): Record<string, number>;
  addDependent(deps: string[], run: () => void): unknown;
}

interface ObjSpec {
  kind: string;
  name: string;
  on?: string;
  args: Record<string, string>;
  /** Source offsets [start, end] of this object's line — for drag write-back. */
  span?: [number, number];
}
interface AnimSpec {
  verb: string;
  target: string;
  args: string[];
  index: number;
}

const CREATE_VERBS = new Set([
  "create",
  "write",
  "grow",
  "fade-in",
  "draw-border-then-fill",
]);

type AppearStyle = "fade" | "draw" | "grow";

interface SceneObj {
  spec: ObjSpec;
  appear: number;
  appearTarget: number;
  creationIndex: number | null;
  style: AppearStyle;
  flash: number; // transient indicate pulse, 1→0
  expr?: CompiledExpr;
  xExpr?: CompiledExpr;
  yExpr?: CompiledExpr;
  fromExpr?: CompiledExpr;
  toExpr?: CompiledExpr;
  /** Live drag override in data coords; visual-only until committed to text. */
  override?: [number, number] | null;
  // Relative placement (Part A): resolve relative to another object's position.
  nextTo?: string;
  dirVec?: [number, number];
  buff?: number;
  shiftXY?: [number, number];
  // Imperative move/rotate animation (Part E).
  movePos?: [number, number] | null; // current tweened position when a move is active
  moveTarget?: [number, number] | null;
  angle: number; // current rotation (radians)
  angleTarget: number;
}

interface Colors {
  curve: string;
  grid: string;
  axis: string;
  text: string;
  accent: string;
  surface: string;
}

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, f: string): string => s.getPropertyValue(n).trim() || f;
  return {
    curve: v("--accent", "#2563eb"),
    grid: v("--border", "#e2e5ea"),
    axis: v("--muted", "#6b7280"),
    text: v("--muted", "#6b7280"),
    accent: v("--accent", "#2563eb"),
    surface: v("--surface", "#ffffff"),
  };
}

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function compileSafe(src: string | undefined): CompiledExpr | undefined {
  if (src === undefined) return undefined;
  try {
    return compileExpr(src);
  } catch {
    return undefined;
  }
}

export function initScenes(graph: GraphLike, options: Scene3DOptions = {}): void {
  document.querySelectorAll<HTMLElement>(".theia-scene").forEach((host) => {
    if (host.getAttribute("data-3d") === "true") initScene3D(host, graph, options);
    else setupScene(host, graph);
  });
}

function setupScene(host: HTMLElement, graph: GraphLike): void {
  const canvas = host.querySelector<HTMLCanvasElement>(".theia-scene__canvas");
  const overlay = host.querySelector<HTMLElement>(".theia-scene__overlay");
  const dataEl = host.querySelector(".theia-scene__data");
  if (!canvas || !dataEl) return;

  let data: { objects: ObjSpec[]; anims: AnimSpec[] };
  try {
    data = JSON.parse(dataEl.textContent ?? "{}");
  } catch {
    return;
  }
  const anims = data.anims ?? [];
  const base = parseInt(host.getAttribute("data-advance-base") || "0", 10);

  // Build object models, compile expressions, resolve creation verbs.
  const objects: SceneObj[] = (data.objects ?? []).map((spec) => {
    const creation = anims.find(
      (a) => CREATE_VERBS.has(a.verb) && a.target === spec.name,
    );
    const style: AppearStyle =
      creation?.verb === "write" ? "draw" : creation?.verb === "grow" ? "grow" : "fade";
    const obj: SceneObj = {
      spec,
      appear: creation ? 0 : 1,
      appearTarget: creation ? 0 : 1,
      creationIndex: creation ? creation.index : null,
      style,
      flash: 0,
      expr: compileSafe(spec.args.expr),
      xExpr: compileSafe(spec.args.x),
      yExpr: compileSafe(spec.args.y),
      fromExpr: compileSafe(spec.args.from),
      toExpr: compileSafe(spec.args.to),
      angle: 0,
      angleTarget: 0,
    };
    if (spec.args.next_to) {
      obj.nextTo = spec.args.next_to;
      obj.dirVec = directionVector(spec.args.dir);
      obj.buff = spec.args.buff !== undefined ? parseFloat(spec.args.buff) : 0.6;
    }
    obj.shiftXY = parsePair(spec.args.shift);
    return obj;
  });
  const byName = new Map(objects.map((o) => [o.spec.name, o]));

  // --- Relative placement order (Part A): resolve next_to targets first ----
  const { order: placeOrder, cycles } = placementOrder(
    objects.map((o) => ({ name: o.spec.name, nextTo: o.nextTo })),
  );
  const cyclic = new Set(cycles);
  if (cycles.length) {
    console.warn(`theia: placement cycle among [${cycles.join(", ")}] — falling back to absolute position`);
  }
  const resolveSequence = placeOrder.map((n) => byName.get(n)!).filter(Boolean);
  /** Resolved data-space position of every object, recomputed each draw. */
  const resolved = new Map<SceneObj, [number, number]>();

  const absolutePos = (o: SceneObj, scope: Record<string, number>): [number, number] => [
    o.xExpr ? o.xExpr.eval(scope) : 0,
    o.yExpr ? o.yExpr.eval(scope) : 0,
  ];

  /** Base position before move/rotate: drag override, else next_to, else `at`,
   * then `shift`. next_to reads the target's already-resolved position. */
  function basePos(o: SceneObj, scope: Record<string, number>): [number, number] {
    if (o.override) return o.override;
    let p: [number, number];
    if (o.nextTo && !cyclic.has(o.spec.name)) {
      const target = byName.get(o.nextTo);
      const base = (target && resolved.get(target)) ?? [0, 0];
      const d = o.dirVec ?? [1, 0];
      const b = o.buff ?? 0.6;
      p = [base[0] + d[0] * b, base[1] + d[1] * b];
    } else {
      p = absolutePos(o, scope);
    }
    if (o.shiftXY) p = [p[0] + o.shiftXY[0], p[1] + o.shiftXY[1]];
    return p;
  }

  /** Recompute every object's resolved position, in dependency order. A `move`
   * animation (Part E), when active, overrides with the tweened position. */
  function resolvePositions(scope: Record<string, number>): void {
    resolved.clear();
    for (const o of resolveSequence) {
      let p = o.movePos ?? basePos(o, scope);
      if (o.angle) p = orbit(p, activePivot.get(o) ?? { kind: "self" }, o.angle, scope);
      resolved.set(o, p);
    }
  }

  // --- Direct-manipulation handles (editor only) ---------------------------
  // Drag-to-edit is an AUTHORING affordance: enabled only when embedded in the
  // playground (an editor in the parent frame). Standalone/shared decks get no
  // handles, so their rendering and interaction are unchanged.
  const embedded = typeof window !== "undefined" && window.parent !== window;
  interface Interactive {
    o: SceneObj;
    free: boolean;
    vars: string[];
    node: HTMLElement;
  }
  const interactives: Interactive[] = [];
  const interactiveByObj = new Map<SceneObj, Interactive>();
  let lastArea: ReturnType<typeof areaRect> | null = null;

  // Resolved position (placement + move), falling back to a fresh base compute
  // for callers that run outside a draw (e.g. drag handlers reading current pos).
  const coordsOf = (o: SceneObj, scope: Record<string, number>): [number, number] =>
    o.override ?? o.movePos ?? resolved.get(o) ?? basePos(o, scope);

  function postEdit(span: [number, number] | undefined, x: number, y: number): void {
    if (!span || !embedded) return;
    window.parent.postMessage({ source: "theia", type: "coords", span, x, y }, "*");
  }

  function csForObject(o: SceneObj): CoordSystem | null {
    if (!lastArea) return null;
    return coordFor(o.spec.on, lastArea);
  }

  function setupHandle(it: Interactive): void {
    const { node, o } = it;
    node.tabIndex = 0;
    node.style.pointerEvents = "auto";
    if (!it.free) {
      node.style.cursor = "not-allowed";
      node.setAttribute("data-theia-derived", "true");
      node.title = it.vars.length
        ? `Bound to ${it.vars.join(", ")} — drag the slider to move this`
        : "Computed position — not draggable";
      return;
    }
    node.setAttribute("data-theia-free", "true");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `Move ${o.spec.name} (drag, or arrow keys to nudge)`);
    node.style.cursor = "grab";
    node.title = "Drag to move · arrow keys nudge · Shift snaps to grid";

    let dragging = false;
    const start = (e: PointerEvent): void => {
      const cs = csForObject(o);
      if (!cs) return;
      dragging = true;
      node.style.cursor = "grabbing";
      node.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent): void => {
      if (!dragging) return;
      const cs = csForObject(o);
      if (!cs) return;
      // The deck may be CSS-scaled to fit the stage; divide the scale out so the
      // pointer maps into the canvas's own (unscaled) pixel space.
      const rect = canvas!.getBoundingClientRect();
      const sx = rect.width / (canvas!.clientWidth || rect.width);
      const sy = rect.height / (canvas!.clientHeight || rect.height);
      let [x, y] = cs.fromPixel((e.clientX - rect.left) / sx, (e.clientY - rect.top) / sy);
      if (e.shiftKey) {
        x = Math.round(x * 2) / 2;
        y = Math.round(y * 2) / 2;
      }
      o.override = [x, y];
      requestDraw();
    };
    const end = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      node.style.cursor = "grab";
      try {
        node.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      const [x, y] = o.override ?? coordsOf(o, graph.scope());
      postEdit(o.spec.span, x, y); // commit as a single text edit
    };
    node.addEventListener("pointerdown", start);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.5 : 0.1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const d = delta[e.key];
      if (!d) return;
      e.preventDefault();
      const [cx, cy] = o.override ?? coordsOf(o, graph.scope());
      o.override = [cx + d[0], cy + d[1]];
      requestDraw();
      postEdit(o.spec.span, o.override[0], o.override[1]); // same text edit as a drag
    });
  }

  function positionInteractives(scope: Record<string, number>, area: ReturnType<typeof areaRect>): void {
    for (const it of interactives) {
      const cs = coordFor(it.o.spec.on, area);
      // Mirror the canvas gating: an object hidden by its creation verb (or with
      // no coordinate system) shows no handle either. Detach (not just hide) so
      // DOM presence tracks visibility.
      if (!cs || it.o.appear <= 0.001) {
        it.node.remove();
        continue;
      }
      const [x, y] = coordsOf(it.o, scope);
      const [px, py] = cs.toPixel(x, y);
      if (!it.node.isConnected) overlay!.appendChild(it.node);
      it.node.style.left = `${px}px`;
      it.node.style.top = `${py}px`;
    }
  }

  if (overlay) {
    for (const o of objects) {
      if (o.spec.kind !== "label" && o.spec.kind !== "point") continue;
      if (o.spec.args.x === undefined || o.spec.args.y === undefined) continue;
      const free = isDraggablePosition(o.spec.args.x, o.spec.args.y);
      const node = document.createElement("div");
      node.className =
        o.spec.kind === "label" ? "theia-scene__label theia-scene__handle" : "theia-scene__handle";
      if (o.spec.kind === "label") node.textContent = o.spec.args.text ?? o.spec.name;
      else node.setAttribute("data-theia-point", "true");
      // Only attach a node + behavior when there is something to do: free
      // objects are draggable; derived objects show the "drag the slider" hint;
      // a free *label* still needs its node to render text even when standalone.
      if (embedded || o.spec.kind === "label") {
        overlay.appendChild(node);
        const it: Interactive = { o, free, vars: boundVars(o.spec.args.x, o.spec.args.y), node };
        interactives.push(it);
        interactiveByObj.set(o, it);
        if (embedded) setupHandle(it);
      }
    }
  }

  // --- Media objects (image / video) as positioned overlay elements --------
  // Media is a named scene object like any other: positioned via the same
  // CoordSystem, sized in scene-x units (`width:`), faded by creation verbs,
  // and reactive (width/opacity expressions re-evaluate on the graph). Video
  // additionally responds to +animate play/pause verbs through advance.
  interface SceneMedia {
    o: SceneObj;
    el: HTMLImageElement | HTMLVideoElement;
    isVideo: boolean;
    wExpr?: CompiledExpr;
    opacityExpr?: CompiledExpr;
    endGuard?: () => void;
  }
  const media: SceneMedia[] = [];
  const mediaByName = new Map<string, SceneMedia>();
  if (overlay) {
    for (const o of objects) {
      const kind = o.spec.kind;
      if (kind !== "image" && kind !== "video") continue;
      const src = o.spec.args.src;
      if (!src) continue;
      const isVideo = kind === "video";
      const el = document.createElement(isVideo ? "video" : "img") as
        | HTMLImageElement
        | HTMLVideoElement;
      el.className = "theia-scene__media" + (isVideo ? " theia-scene__media--video" : "");
      if (isVideo) {
        const v = el as HTMLVideoElement;
        v.src = src;
        v.preload = "none";
        v.playsInline = true;
        if (o.spec.args.controls !== "false") v.controls = true;
        if (o.spec.args.loop === "true") v.loop = true;
        if (o.spec.args.muted === "true" || o.spec.args.autoplay === "true") v.muted = true;
        if (o.spec.args.poster) v.poster = o.spec.args.poster;
        v.setAttribute("aria-label", o.spec.args.alt ?? o.spec.name);
      } else {
        const im = el as HTMLImageElement;
        im.src = src;
        im.alt = o.spec.args.alt ?? o.spec.args.text ?? "";
        im.loading = "lazy";
        im.decoding = "async";
      }
      overlay.appendChild(el);
      const m: SceneMedia = {
        o,
        el,
        isVideo,
        wExpr: compileSafe(o.spec.args.width),
        opacityExpr: compileSafe(o.spec.args.opacity),
      };
      media.push(m);
      mediaByName.set(o.spec.name, m);
    }
  }

  // Bound media width/opacity join the reactive deps (declared just below).
  const mediaDepVars = (): string[] => {
    const out: string[] = [];
    for (const m of media) {
      for (const e of [m.wExpr, m.opacityExpr]) {
        if (e) for (const v of e.vars) out.push(v);
      }
    }
    return out;
  };

  function positionMedia(scope: Record<string, number>, area: ReturnType<typeof areaRect>): void {
    for (const m of media) {
      const cs = coordFor(m.o.spec.on, area);
      if (!cs) {
        m.el.style.display = "none";
        continue;
      }
      const [x, y] = coordsOf(m.o, scope);
      const [px, py] = cs.toPixel(x, y);
      const wUnits = m.wExpr ? m.wExpr.eval(scope) : 3;
      const [sx] = cs.scale();
      const bound = m.opacityExpr ? m.opacityExpr.eval(scope) : 1;
      const op = Math.max(0, Math.min(1, m.o.appear * (Number.isFinite(bound) ? bound : 1)));
      m.el.style.display = "";
      m.el.style.left = `${px}px`;
      m.el.style.top = `${py}px`;
      m.el.style.width = `${Math.max(0, wUnits * sx)}px`;
      m.el.style.opacity = String(op);
      // Orientation from a rotate verb (negate: data y is up, CSS y is down).
      m.el.style.transform = `translate(-50%, -50%) rotate(${-m.o.angle}rad)`;
      // An invisible (not-yet-created) element must not eat clicks/keys.
      m.el.style.pointerEvents = op > 0.05 ? "auto" : "none";
    }
  }

  // --- Advance-driven video playback ---------------------------------------
  function playMedia(target: string, args: string[]): void {
    const m = mediaByName.get(target);
    if (!m || !m.isVideo) return;
    const v = m.el as HTMLVideoElement;
    const seg = parseMediaSegment(args);
    m.endGuard?.(); // clear any prior segment guard
    if (seg.start !== undefined) {
      try {
        v.currentTime = seg.start;
      } catch {
        /* not seekable yet; plays from current position */
      }
    }
    if (seg.end !== undefined) {
      const onTime = (): void => {
        if (v.currentTime >= seg.end!) {
          v.pause();
          m.endGuard?.();
        }
      };
      v.addEventListener("timeupdate", onTime);
      m.endGuard = () => {
        v.removeEventListener("timeupdate", onTime);
        m.endGuard = undefined;
      };
    }
    void v.play?.().catch(() => {
      /* autoplay/gesture policy — leave on poster */
    });
  }
  function pauseAllMedia(): void {
    for (const m of media) {
      if (!m.isVideo) continue;
      m.endGuard?.();
      try {
        (m.el as HTMLVideoElement).pause();
      } catch {
        /* ignore */
      }
    }
  }

  // --- Data objects: @matrix & @table (DOM overlay), @barchart (canvas) ----
  const renderKatex = (el: HTMLElement, tex: string, display: boolean): void => {
    const k = (globalThis as unknown as { katex?: { render(t: string, e: HTMLElement, o: object): void } }).katex;
    if (k) {
      try {
        k.render(tex, el, { displayMode: display, throwOnError: false });
        return;
      } catch {
        /* fall through to text */
      }
    }
    el.textContent = tex;
  };
  const fmt = (v: number): string =>
    !Number.isFinite(v) ? "?" : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  const unq = (s: string): string => s.trim().replace(/^["']|["']$/g, "");
  const parseList = (s: string): string[] =>
    s.trim().replace(/^\[/, "").replace(/\]$/, "").split(",").map((x) => x.trim()).filter(Boolean);
  const parseMatrix = (s: string): string[][] => {
    const inner = s.trim().replace(/^\[/, "").replace(/\]$/, ""); // drop outer brackets
    return (inner.match(/\[[^\]]*\]/g) ?? []).map((r) => parseList(r));
  };
  const defaultCoord = (area: ReturnType<typeof areaRect>): CoordSystem =>
    makeCoordSystem([-6, 6], [-3.6, 3.6], area);
  const csOrDefault = (on: string | undefined, area: ReturnType<typeof areaRect>): CoordSystem =>
    coordFor(on, area) ?? defaultCoord(area);

  interface DataObj {
    o: SceneObj;
    el: HTMLElement;
    exprs: CompiledExpr[]; // reactive entries/cells
    lastKey: string;
    render: (scope: Record<string, number>) => void;
  }
  const dataObjects: DataObj[] = [];

  if (overlay) {
    for (const o of objects) {
      const kind = o.spec.kind;
      if (kind === "matrix") {
        const rows = parseMatrix(o.spec.args.value ?? "");
        const exprs = rows.flat().map((e) => compileExpr(e));
        const el = document.createElement("div");
        el.className = "theia-scene__matrix";
        overlay.appendChild(el);
        const render = (scope: Record<string, number>): void => {
          const body = rows
            .map((r) =>
              r
                .map((e) => {
                  const v = (() => {
                    try {
                      return compileExpr(e).eval(scope);
                    } catch {
                      return NaN;
                    }
                  })();
                  return Number.isFinite(v) ? fmt(v) : e; // number, else raw symbol
                })
                .join(" & "),
            )
            .join(" \\\\ ");
          renderKatex(el, `\\begin{bmatrix} ${body} \\end{bmatrix}`, true);
        };
        dataObjects.push({ o, el, exprs, lastKey: "", render });
      } else if (kind === "table") {
        const type = o.spec.args.type ?? "text";
        const cells = (o.spec.args.rows ?? "")
          .split("\n")
          .map((line) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        const exprs = type === "decimal" ? cells.flat().map((c) => compileExpr(c)) : [];
        const el = document.createElement("div");
        el.className = "theia-scene__table";
        overlay.appendChild(el);
        const render = (scope: Record<string, number>): void => {
          el.innerHTML = "";
          const table = document.createElement("table");
          cells.forEach((row, ri) => {
            const tr = document.createElement("tr");
            row.forEach((cell) => {
              const td = document.createElement(ri === 0 ? "th" : "td");
              if (type === "math") renderKatex(td, cell, false);
              else if (type === "decimal" && ri > 0) {
                let v = NaN;
                try {
                  v = compileExpr(cell).eval(scope);
                } catch {
                  /* non-numeric */
                }
                td.textContent = Number.isFinite(v) ? fmt(v) : cell;
              } else td.textContent = cell;
              tr.appendChild(td);
            });
            table.appendChild(tr);
          });
          el.appendChild(table);
        };
        dataObjects.push({ o, el, exprs, lastKey: "", render });
      }
    }
  }

  function positionDataObjects(scope: Record<string, number>, area: ReturnType<typeof areaRect>): void {
    for (const d of dataObjects) {
      const cs = csOrDefault(d.o.spec.on, area);
      const [x, y] = resolved.get(d.o) ?? basePos(d.o, scope);
      const [px, py] = cs.toPixel(x, y);
      const op = Math.max(0, Math.min(1, d.o.appear));
      const key = d.exprs.length === 0 ? "static" : d.exprs.map((e) => fmt(e.eval(scope))).join(",");
      if (key !== d.lastKey) {
        d.render(scope); // re-typeset only when the computed cells change
        d.lastKey = key;
      }
      d.el.style.left = `${px}px`;
      d.el.style.top = `${py}px`;
      d.el.style.opacity = String(op);
    }
  }

  // Barchart bar heights (eased toward their target values for a smooth change).
  const barValueExprs = new Map<SceneObj, CompiledExpr[]>();
  const barCur = new Map<SceneObj, number[]>();
  for (const o of objects) {
    if (o.spec.kind === "barchart" && o.spec.args.values) {
      const exprs = parseList(o.spec.args.values).map((v) => compileExpr(v));
      barValueExprs.set(o, exprs);
      barCur.set(o, exprs.map(() => 0));
    }
  }

  function drawBarchart(ctx: CanvasRenderingContext2D, cs: CoordSystem, o: SceneObj, scope: Record<string, number>, colors: Colors): void {
    const exprs = barValueExprs.get(o);
    const eased = barCur.get(o);
    if (!exprs || !eased) return;
    // Reduced motion: no tween — draw the target heights directly.
    const cur = reduced ? exprs.map((e) => e.eval(scope)) : eased;
    const labels = o.spec.args.labels ? parseList(o.spec.args.labels).map(unq) : [];
    const [ox, oy] = (resolved.get(o) ?? basePos(o, scope));
    const [bx, by] = cs.toPixel(ox, oy);
    const [sx, sy] = cs.scale();
    const wUnits = o.spec.args.width ? parseFloat(o.spec.args.width) : 4;
    const hUnits = o.spec.args.height ? parseFloat(o.spec.args.height) : 3;
    const n = cur.length || 1;
    const slot = (wUnits * sx) / n;
    const maxV = Math.max(1, ...cur, ...exprs.map((e) => Math.abs(e.eval(scope))));
    ctx.save();
    ctx.globalAlpha = o.appear;
    ctx.font = "12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i < n; i++) {
      const h = (cur[i]! / maxV) * hUnits * sy;
      const x0 = bx + i * slot + slot * 0.15;
      const w = slot * 0.7;
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x0, by - h, w, h);
      if (labels[i]) {
        ctx.fillStyle = colors.text;
        ctx.fillText(labels[i]!, x0 + w / 2, by + 14);
      }
    }
    ctx.strokeStyle = colors.axis;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + wUnits * sx, by);
    ctx.stroke();
    ctx.restore();
  }

  // --- Graphs / networks (Part C): @graph (undirected) / @digraph -----------
  interface GraphData {
    names: string[];
    edges: Edge[];
    directed: boolean;
    layout: Layout; // unit-normalized node positions, scaled by radius at draw
    radius: number;
    highlight: Set<string>; // "from~to" keys highlighted by an indicate path
  }
  const edgeKey = (e: Edge): string => `${e.from}~${e.to}`;
  const graphData = new Map<SceneObj, GraphData>();
  for (const o of objects) {
    if (o.spec.kind !== "graph" && o.spec.kind !== "digraph") continue;
    const names = o.spec.args.nodes ? parseList(o.spec.args.nodes) : [];
    const edges = o.spec.args.edges ? parseEdges(o.spec.args.edges) : [];
    graphData.set(o, {
      names,
      edges,
      directed: o.spec.kind === "digraph",
      layout: layoutGraph(names, edges, o.spec.args.layout ?? "spring"),
      radius: o.spec.args.radius ? parseFloat(o.spec.args.radius) : 2.4,
      highlight: new Set(),
    });
  }
  function drawGraph(ctx: CanvasRenderingContext2D, cs: CoordSystem, o: SceneObj, scope: Record<string, number>, colors: Colors): void {
    const g = graphData.get(o);
    if (!g) return;
    const [cx, cy] = resolved.get(o) ?? basePos(o, scope);
    const px = (name: string): [number, number] => {
      const p = g.layout.get(name) ?? [0, 0];
      return cs.toPixel(cx + p[0] * g.radius, cy + p[1] * g.radius);
    };
    ctx.save();
    ctx.globalAlpha = o.appear;
    // edges
    for (const e of g.edges) {
      const a = px(e.from);
      const b = px(e.to);
      const lit = (o.flash > 0 && g.highlight.has(edgeKey(e))) || g.highlight.has(`${e.from}~${e.to}`);
      ctx.strokeStyle = lit ? colors.accent : colors.axis;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = lit ? 3.5 : 1.5;
      // stop the line/arrow short of the node radius
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const r = 13;
      const bx = b[0] - r * Math.cos(ang);
      const by = b[1] - r * Math.sin(ang);
      const ax = a[0] + r * Math.cos(ang);
      const ay = a[1] + r * Math.sin(ang);
      drawArrow(ctx, ax, ay, bx, by, g.directed, 9);
    }
    // nodes
    ctx.font = "12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const name of g.names) {
      const [x, y] = px(name);
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = colors.surface;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.curve;
      ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  }

  // --- Vector fields (Part D): @vectorfield vf on ax : (u, v) --------------
  const splitTopComma = (s: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const fieldExprs = new Map<SceneObj, { u: CompiledExpr; v: CompiledExpr }>();
  for (const o of objects) {
    if (o.spec.kind !== "vectorfield" || !o.spec.args.expr) continue;
    const inner = o.spec.args.expr.trim().replace(/^\(/, "").replace(/\)$/, "");
    const parts = splitTopComma(inner);
    if (parts.length >= 2) {
      try {
        fieldExprs.set(o, { u: compileExpr(parts[0]!), v: compileExpr(parts[1]!) });
      } catch {
        /* leave undrawn on a bad expression */
      }
    }
  }
  function drawVectorField(ctx: CanvasRenderingContext2D, cs: CoordSystem, o: SceneObj, scope: Record<string, number>, colors: Colors): void {
    const f = fieldExprs.get(o);
    if (!f) return;
    const density = Math.max(3, Math.min(25, o.spec.args.density ? parseInt(o.spec.args.density, 10) : 11));
    const userScale = o.spec.args.scale ? parseFloat(o.spec.args.scale) : 1;
    const normalize = o.spec.args.normalize === "true";
    const cellX = (cs.xMax - cs.xMin) / density;
    const ny = Math.max(3, Math.round((cs.yMax - cs.yMin) / cellX));
    const cellY = (cs.yMax - cs.yMin) / ny;
    // First pass: sample u,v + the max magnitude for proportional scaling.
    const samples: { gx: number; gy: number; u: number; v: number; m: number }[] = [];
    let maxM = 1e-6;
    for (let i = 0; i < density; i++) {
      for (let j = 0; j < ny; j++) {
        const gx = cs.xMin + (i + 0.5) * cellX;
        const gy = cs.yMin + (j + 0.5) * cellY;
        const s2 = { ...scope, x: gx, y: gy };
        const u = f.u.eval(s2);
        const v = f.v.eval(s2);
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
        const m = Math.hypot(u, v);
        maxM = Math.max(maxM, m);
        samples.push({ gx, gy, u, v, m });
      }
    }
    ctx.save();
    ctx.globalAlpha = o.appear;
    for (const s of samples) {
      if (s.m < 1e-6) continue;
      const len = (normalize ? 0.45 : (0.2 + 0.45 * (s.m / maxM))) * cellX * userScale;
      const ex = s.gx + (s.u / s.m) * len;
      const ey = s.gy + (s.v / s.m) * len;
      const [x1, y1] = cs.toPixel(s.gx, s.gy);
      const [x2, y2] = cs.toPixel(ex, ey);
      ctx.globalAlpha = o.appear * (0.4 + 0.6 * (s.m / maxM));
      ctx.strokeStyle = colors.accent;
      ctx.fillStyle = colors.accent;
      ctx.lineWidth = 1.5;
      drawArrow(ctx, x1, y1, x2, y2, true, 5);
    }
    ctx.restore();
  }

  // --- move / rotate animation verbs (Part E) ------------------------------
  type MoveSpec =
    | { kind: "coord"; x: CompiledExpr; y: CompiledExpr }
    | { kind: "nextTo"; to: string; dir: [number, number]; buff: number };
  type Pivot = { kind: "self" } | { kind: "coord"; x: number; y: number } | { kind: "obj"; name: string };
  interface MoveAnim extends AnimSpec { spec: MoveSpec | null }
  interface RotateAnim extends AnimSpec { rad: number; pivot: Pivot }

  const parseMove = (args: string[]): MoveSpec | null => {
    const s = args.join(" ");
    const nt = /\bnext_to\s+(\w+)(?:\s+([\w-]+))?/.exec(s);
    if (nt) return { kind: "nextTo", to: nt[1]!, dir: directionVector(nt[2]), buff: 0.6 };
    const co = /\bto\s*\(([^)]*)\)/.exec(s);
    if (co) {
      const [xe, ye] = splitTopComma(co[1]!);
      try {
        return { kind: "coord", x: compileExpr(xe ?? "0"), y: compileExpr(ye ?? "0") };
      } catch {
        return null;
      }
    }
    return null;
  };
  const parseRotate = (args: string[]): { rad: number; pivot: Pivot } => {
    const s = args.join(" ");
    const by = /\bby\s+(-?[\d.]+)\s*(deg|rad)?/.exec(s);
    const deg = by ? parseFloat(by[1]!) * (by[2] === "rad" ? 180 / Math.PI : 1) : 0;
    const pc = /\babout\s+\(([^)]*)\)/.exec(s);
    let pivot: Pivot = { kind: "self" };
    if (pc) {
      const [px, py] = splitTopComma(pc[1]!).map((n) => parseFloat(n));
      pivot = { kind: "coord", x: px ?? 0, y: py ?? 0 };
    } else {
      const po = /\babout\s+(\w+)/.exec(s);
      if (po && po[1] !== "center" && po[1] !== "self") pivot = { kind: "obj", name: po[1]! };
    }
    return { rad: (deg * Math.PI) / 180, pivot };
  };
  const moveAnims: MoveAnim[] = anims.filter((a) => a.verb === "move").map((a) => ({ ...a, spec: parseMove(a.args) }));
  const rotateAnims: RotateAnim[] = anims.filter((a) => a.verb === "rotate").map((a) => ({ ...a, ...parseRotate(a.args) }));
  const activeMove = new Map<SceneObj, MoveSpec | null>();
  const activePivot = new Map<SceneObj, Pivot>();

  const resolveMoveTarget = (spec: MoveSpec, scope: Record<string, number>): [number, number] => {
    if (spec.kind === "coord") return [spec.x.eval(scope), spec.y.eval(scope)];
    const t = byName.get(spec.to);
    const base = (t && resolved.get(t)) ?? [0, 0];
    return [base[0] + spec.dir[0] * spec.buff, base[1] + spec.dir[1] * spec.buff];
  };
  /** Rotate a point about a pivot (data space). */
  const orbit = (p: [number, number], pivot: Pivot, ang: number, scope: Record<string, number>): [number, number] => {
    if (ang === 0 || pivot.kind === "self") return p;
    const c: [number, number] =
      pivot.kind === "coord" ? [pivot.x, pivot.y] : (byName.get(pivot.name) && resolved.get(byName.get(pivot.name)!)) ?? [0, 0];
    const dx = p[0] - c[0];
    const dy = p[1] - c[1];
    return [c[0] + dx * Math.cos(ang) - dy * Math.sin(ang), c[1] + dx * Math.sin(ang) + dy * Math.cos(ang)];
  };

  // Reactive dependencies: slider vars referenced by any expression.
  const deps = new Set<string>();
  for (const o of objects) {
    for (const e of [o.expr, o.xExpr, o.yExpr, o.fromExpr, o.toExpr]) {
      if (!e) continue;
      for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);
    }
  }
  // Reactive move targets (coordinate exprs) are dependents too.
  for (const a of moveAnims) if (a.spec?.kind === "coord") for (const e of [a.spec.x, a.spec.y]) for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);
  for (const v of mediaDepVars()) if (graph.get(v) !== undefined) deps.add(v);
  for (const d of dataObjects) for (const e of d.exprs) for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);
  for (const exprs of barValueExprs.values()) for (const e of exprs) for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);
  for (const f of fieldExprs.values()) for (const e of [f.u, f.v]) for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);

  // --- rAF scheduler shared by reactivity + animation ----------------------
  let rafId = 0;
  let last = 0;
  const reduced = prefersReduced();

  const stepAnimations = (now: number): boolean => {
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    let active = false;
    for (const o of objects) {
      if (o.appear !== o.appearTarget) {
        const k = 1 - Math.pow(0.001, dt / 1000); // ~exponential ease
        o.appear += (o.appearTarget - o.appear) * k;
        if (Math.abs(o.appearTarget - o.appear) < 0.005) o.appear = o.appearTarget;
        else active = true;
      }
      if (o.flash > 0) {
        o.flash = Math.max(0, o.flash - dt / 500);
        if (o.flash > 0) active = true;
      }
    }
    // Ease barchart heights toward their (possibly reactive) target values.
    const scope = graph.scope();
    const k = 1 - Math.pow(0.001, dt / 1000);
    for (const [o, exprs] of barValueExprs) {
      const cur = barCur.get(o)!;
      for (let i = 0; i < cur.length; i++) {
        const target = exprs[i]!.eval(scope);
        cur[i] = cur[i]! + (target - cur[i]!) * k;
        if (Math.abs(target - cur[i]!) > 0.005) active = true;
        else cur[i] = target;
      }
    }
    // Ease move (toward the live target) + rotate (toward the accumulated angle).
    for (const o of objects) {
      const spec = activeMove.get(o);
      if (spec) {
        const tgt = resolveMoveTarget(spec, scope);
        if (!o.movePos) o.movePos = resolved.get(o) ?? basePos(o, scope);
        o.movePos = [o.movePos[0] + (tgt[0] - o.movePos[0]) * k, o.movePos[1] + (tgt[1] - o.movePos[1]) * k];
        if (Math.hypot(tgt[0] - o.movePos[0], tgt[1] - o.movePos[1]) > 0.003) active = true;
        else o.movePos = tgt;
      } else if (o.movePos) {
        o.movePos = null; // move reversed away → back to base
      }
      if (o.angle !== o.angleTarget) {
        o.angle += (o.angleTarget - o.angle) * k;
        if (Math.abs(o.angleTarget - o.angle) > 0.002) active = true;
        else o.angle = o.angleTarget;
      }
    }
    return active;
  };

  const tick = (now: number): void => {
    rafId = 0;
    const active = reduced ? false : stepAnimations(now);
    draw();
    if (active && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(tick);
    }
  };
  const requestDraw = (): void => {
    if (rafId) return;
    if (typeof requestAnimationFrame === "function") rafId = requestAnimationFrame(tick);
    else draw();
  };

  // --- Drawing -------------------------------------------------------------
  function coordFor(name: string | undefined, area: ReturnType<typeof areaRect>): CoordSystem | null {
    const host = name ? byName.get(name) : undefined;
    if (!host) return null;
    if (host.spec.kind === "axes") {
      return makeCoordSystem(
        parseRange(host.spec.args.x, [-5, 5]),
        parseRange(host.spec.args.y, [-5, 5]),
        area,
      );
    }
    if (host.spec.kind === "numberline") {
      const r = parseRange(host.spec.args.range, [-5, 5]);
      return makeCoordSystem(r, [-1, 1], area);
    }
    return null;
  }

  function areaRect(cssW: number, cssH: number): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    return { x: 42, y: 14, width: cssW - 56, height: cssH - 40 };
  }

  function draw(): void {
    const ctx = canvas!.getContext("2d");
    if (!ctx) return;
    const dpr = (globalThis.devicePixelRatio as number) || 1;
    const cssW = canvas!.clientWidth || 640;
    const cssH = canvas!.clientHeight || 380;
    if (canvas!.width !== Math.round(cssW * dpr) || canvas!.height !== Math.round(cssH * dpr)) {
      canvas!.width = Math.round(cssW * dpr);
      canvas!.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const colors = readColors();
    const scope = graph.scope();
    const area = areaRect(cssW, cssH);
    const labels: Array<{ left: number; top: number; text: string }> = [];

    // Resolve placement (next_to/shift/move) in dependency order before drawing.
    resolvePositions(scope);

    // Coordinate systems first (background).
    for (const o of objects) {
      if (o.spec.kind !== "axes" && o.spec.kind !== "numberline") continue;
      if (o.appear <= 0.001) continue;
      const cs = coordFor(o.spec.name, area);
      if (cs) drawAxes(ctx, cs, o, colors, labels);
    }

    // Then objects placed on a coordinate system, in declaration order. Curve-
    // like objects require axes; free objects (barchart/graph/vectorfield) fall
    // back to a default frame so they can be placed with `at` alone.
    const FREE = new Set(["barchart", "graph", "digraph", "vectorfield"]);
    for (const o of objects) {
      if (o.spec.kind === "axes" || o.spec.kind === "numberline") continue;
      if (o.appear <= 0.001) continue;
      const realCs = coordFor(o.spec.on, area);
      const cs = realCs ?? (FREE.has(o.spec.kind) ? defaultCoord(area) : null);
      if (!cs) continue;
      switch (o.spec.kind) {
        case "plot":
          drawCurve(ctx, cs, o, scope, colors);
          break;
        case "area":
          drawArea(ctx, cs, o, scope, colors, byName);
          break;
        case "tangent":
          drawTangent(ctx, cs, o, scope, colors, byName);
          break;
        case "point":
          drawPoint(ctx, cs, resolved.get(o) ?? coordsOf(o, scope), o, colors);
          break;
        case "barchart":
          drawBarchart(ctx, cs, o, scope, colors);
          break;
        case "graph":
        case "digraph":
          drawGraph(ctx, cs, o, scope, colors);
          break;
        case "vectorfield":
          drawVectorField(ctx, cs, o, scope, colors);
          break;
        case "label": {
          // Interactive labels (with a handle node) render via the overlay so
          // they can be dragged; otherwise fall back to the pooled label.
          if (interactiveByObj.has(o)) break;
          const [x, y] = coordsOf(o, scope);
          const [px, py] = cs.toPixel(x, y);
          labels.push({ left: px, top: py, text: o.spec.args.text ?? o.spec.name });
          break;
        }
        default:
          break;
      }
    }

    if (overlay) positionLabels(overlay, labels);
    lastArea = area;
    positionInteractives(scope, area);
    positionMedia(scope, area);
    positionDataObjects(scope, area);
  }

  // --- Advance flow --------------------------------------------------------
  let played = 0;
  const applyAdvance = (revealed: number, animate: boolean): void => {
    const next = Math.max(0, Math.min(anims.length, revealed - base));
    const forward = next > played;
    const singleForward = animate && next === played + 1;

    const tween = singleForward && !reduced;

    const scope = graph.scope();
    // Object visibility from creation verbs. Jumps, reverses, and reduced
    // motion settle instantly; a forward single step tweens via the rAF loop.
    for (const o of objects) {
      o.appearTarget = o.creationIndex === null || next > o.creationIndex ? 1 : 0;
      if (!tween) o.appear = o.appearTarget;

      // move: the latest revealed move verb's target (null → back to base).
      const mv = moveAnims.filter((a) => a.target === o.spec.name && a.index < next).pop();
      activeMove.set(o, mv?.spec ?? null);
      // rotate: accumulate revealed angles; use the latest pivot.
      const rots = rotateAnims.filter((a) => a.target === o.spec.name && a.index < next);
      o.angleTarget = rots.reduce((s, a) => s + a.rad, 0);
      if (rots.length) activePivot.set(o, rots[rots.length - 1]!.pivot);
      if (!tween) {
        o.movePos = mv?.spec ? resolveMoveTarget(mv.spec, scope) : null;
        o.angle = o.angleTarget;
      }
    }

    // A single forward step may also be an `indicate` pulse or a media verb.
    if (singleForward) {
      const verb = anims[played];
      if (verb && verb.verb === "indicate" && !reduced) {
        const target = byName.get(verb.target);
        if (target) {
          target.flash = 1;
          // Indicate over a graph path: highlight the matching edges.
          const g = target && graphData.get(target);
          const pathArg = verb.args.find((a) => /-/.test(a) || /->/.test(a));
          if (g && pathArg) {
            g.highlight = new Set();
            for (const pe of pathEdges(pathArg)) {
              for (const e of g.edges) {
                const fwd = e.from === pe.from && e.to === pe.to;
                const rev = !g.directed && e.from === pe.to && e.to === pe.from;
                if (fwd || rev) g.highlight.add(`${e.from}~${e.to}`);
              }
            }
          }
        }
      } else if (verb && verb.verb === "play") {
        playMedia(verb.target, verb.args);
      } else if (verb && verb.verb === "pause") {
        const m = mediaByName.get(verb.target);
        if (m?.isVideo) {
          m.endGuard?.();
          try {
            (m.el as HTMLVideoElement).pause();
          } catch {
            /* ignore */
          }
        }
      }
    } else if (next !== played) {
      // A jump or reverse settles instantly — stop any playing clip.
      pauseAllMedia();
    }
    played = next;
    if (tween && typeof requestAnimationFrame === "function") {
      last = 0;
      if (!rafId) rafId = requestAnimationFrame(tick);
    } else {
      draw(); // jumps / reverses / reduced-motion settle synchronously
    }
    void forward;
  };

  document.addEventListener("theia:advance", (event) => {
    const detail = (event as CustomEvent).detail as {
      slide: HTMLElement;
      revealed: number;
      animate: boolean;
    };
    if (!detail?.slide) return;
    // Leaving this slide (another slide advanced): stop our clips so audio/motion
    // doesn't continue after you move on (covers present mode too).
    if (!detail.slide.contains(host)) {
      pauseAllMedia();
      return;
    }
    applyAdvance(detail.revealed, detail.animate);
  });

  // --- Reactivity ----------------------------------------------------------
  graph.addDependent([...deps], requestDraw);

  // Initial paint.
  requestDraw();
}

// ---------------------------------------------------------------------------
// Draw helpers
// ---------------------------------------------------------------------------

function drawAxes(
  ctx: CanvasRenderingContext2D,
  cs: CoordSystem,
  o: SceneObj,
  colors: Colors,
  labels: Array<{ left: number; top: number; text: string }>,
): void {
  ctx.save();
  ctx.globalAlpha = o.appear;
  const grid = o.spec.args.grid === "true";
  const xStep = niceStep(cs.xMax - cs.xMin, 8);
  const yStep = niceStep(cs.yMax - cs.yMin, 6);

  if (grid) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(cs.xMin / xStep) * xStep; x <= cs.xMax; x += xStep) {
      const [px] = cs.toPixel(x, 0);
      ctx.moveTo(px, cs.rect.y);
      ctx.lineTo(px, cs.rect.y + cs.rect.height);
    }
    for (let y = Math.ceil(cs.yMin / yStep) * yStep; y <= cs.yMax; y += yStep) {
      const [, py] = cs.toPixel(0, y);
      ctx.moveTo(cs.rect.x, py);
      ctx.lineTo(cs.rect.x + cs.rect.width, py);
    }
    ctx.stroke();
  }

  // Axis lines (through origin, clamped into the rect).
  const clampY = Math.min(Math.max(0, cs.yMin), cs.yMax);
  const clampX = Math.min(Math.max(0, cs.xMin), cs.xMax);
  const [, axisY] = cs.toPixel(0, clampY);
  const [axisX] = cs.toPixel(clampX, 0);
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cs.rect.x, axisY);
  ctx.lineTo(cs.rect.x + cs.rect.width, axisY);
  ctx.moveTo(axisX, cs.rect.y);
  ctx.lineTo(axisX, cs.rect.y + cs.rect.height);
  ctx.stroke();

  // Ticks + numbers.
  ctx.fillStyle = colors.text;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = Math.ceil(cs.xMin / xStep) * xStep; x <= cs.xMax; x += xStep) {
    if (Math.abs(x) < 1e-9) continue;
    const [px] = cs.toPixel(x, clampY);
    ctx.fillText(`${+x.toFixed(2)}`, px, axisY + 4);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = Math.ceil(cs.yMin / yStep) * yStep; y <= cs.yMax; y += yStep) {
    if (Math.abs(y) < 1e-9) continue;
    const [, py] = cs.toPixel(clampX, y);
    ctx.fillText(`${+y.toFixed(2)}`, axisX - 6, py);
  }

  // Axis name labels go to the DOM overlay (could be math later).
  if (o.spec.args.xlabel) {
    labels.push({
      left: cs.rect.x + cs.rect.width - 6,
      top: axisY - 18,
      text: o.spec.args.xlabel,
    });
  }
  if (o.spec.args.ylabel) {
    labels.push({ left: axisX + 6, top: cs.rect.y, text: o.spec.args.ylabel });
  }
  ctx.restore();
}

function sampleY(
  expr: CompiledExpr | undefined,
  scope: Record<string, number>,
  x: number,
): number {
  if (!expr) return NaN;
  return expr.eval({ ...scope, x });
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  cs: CoordSystem,
  o: SceneObj,
  scope: Record<string, number>,
  colors: Colors,
): void {
  if (!o.expr) return;
  ctx.save();
  // `write` reveals the curve left→right; otherwise fade.
  const frac = o.style === "draw" ? o.appear : 1;
  ctx.globalAlpha = o.style === "draw" ? 1 : o.appear;
  ctx.strokeStyle = colors.curve;
  ctx.lineWidth = 2.5 + o.flash * 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  const xEnd = cs.xMin + (cs.xMax - cs.xMin) * frac;
  const samples = Math.max(80, Math.floor(cs.rect.width));
  let pen = false;
  for (let i = 0; i <= samples; i++) {
    const x = cs.xMin + ((xEnd - cs.xMin) * i) / samples;
    const y = sampleY(o.expr, scope, x);
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    const [px, py] = cs.toPixel(x, y);
    if (py < cs.rect.y - cs.rect.height * 3 || py > cs.rect.y + cs.rect.height * 4) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(px, py);
    else {
      ctx.moveTo(px, py);
      pen = true;
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawArea(
  ctx: CanvasRenderingContext2D,
  cs: CoordSystem,
  o: SceneObj,
  scope: Record<string, number>,
  colors: Colors,
  byName: Map<string, SceneObj>,
): void {
  const plot = byName.get(o.spec.args.under ?? "");
  if (!plot?.expr) return;
  const from = o.fromExpr ? o.fromExpr.eval(scope) : cs.xMin;
  const to = o.toExpr ? o.toExpr.eval(scope) : cs.xMax;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
  const rects = o.spec.args.rects ? parseInt(o.spec.args.rects, 10) : 0;

  ctx.save();
  ctx.globalAlpha = 0.28 * o.appear;
  ctx.fillStyle = colors.accent;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1;

  if (rects > 0) {
    const w = (to - from) / rects;
    for (let i = 0; i < rects; i++) {
      const xMid = from + (i + 0.5) * w;
      const h = sampleY(plot.expr, scope, xMid);
      if (!Number.isFinite(h)) continue;
      const [x0, y0] = cs.toPixel(from + i * w, 0);
      const [x1, y1] = cs.toPixel(from + (i + 1) * w, h);
      ctx.beginPath();
      ctx.rect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0));
      ctx.fill();
      ctx.globalAlpha = Math.min(1, 0.6 * o.appear);
      ctx.stroke();
      ctx.globalAlpha = 0.28 * o.appear;
    }
  } else {
    const samples = 120;
    ctx.beginPath();
    const [sx0, sy0] = cs.toPixel(from, 0);
    ctx.moveTo(sx0, sy0);
    for (let i = 0; i <= samples; i++) {
      const x = from + ((to - from) * i) / samples;
      const y = sampleY(plot.expr, scope, x);
      const [px, py] = cs.toPixel(x, Number.isFinite(y) ? y : 0);
      ctx.lineTo(px, py);
    }
    const [ex] = cs.toPixel(to, 0);
    ctx.lineTo(ex, sy0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTangent(
  ctx: CanvasRenderingContext2D,
  cs: CoordSystem,
  o: SceneObj,
  scope: Record<string, number>,
  colors: Colors,
  byName: Map<string, SceneObj>,
): void {
  const plot = byName.get(o.spec.args.to ?? "");
  const point = byName.get(o.spec.args.at ?? "");
  if (!plot?.expr || !point?.xExpr) return;
  const t = point.xExpr.eval(scope);
  const y = sampleY(plot.expr, scope, t);
  if (!Number.isFinite(t) || !Number.isFinite(y)) return;
  const h = (cs.xMax - cs.xMin) * 1e-3 || 1e-3;
  const slope =
    (sampleY(plot.expr, scope, t + h) - sampleY(plot.expr, scope, t - h)) / (2 * h);
  const dx = (cs.xMax - cs.xMin) * 0.3;
  ctx.save();
  ctx.globalAlpha = o.appear;
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 2 + o.flash * 2;
  ctx.beginPath();
  const [x1, y1] = cs.toPixel(t - dx, y - slope * dx);
  const [x2, y2] = cs.toPixel(t + dx, y + slope * dx);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  cs: CoordSystem,
  pos: [number, number],
  o: SceneObj,
  colors: Colors,
): void {
  const [x, y] = pos; // already resolved (override / placement / move)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const [px, py] = cs.toPixel(x, y);
  const r = (o.style === "grow" ? 5 * o.appear : 5) + o.flash * 4;
  ctx.save();
  ctx.globalAlpha = o.style === "grow" ? 1 : o.appear;
  ctx.fillStyle = colors.curve;
  ctx.beginPath();
  ctx.arc(px, py, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.surface;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Draw a line from (x1,y1)→(x2,y2) in pixels, with an optional arrowhead. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  head: boolean,
  headSize = 8,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (!head) return;
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headSize * Math.cos(a - 0.4), y2 - headSize * Math.sin(a - 0.4));
  ctx.lineTo(x2 - headSize * Math.cos(a + 0.4), y2 - headSize * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

function positionLabels(
  overlay: HTMLElement,
  labels: Array<{ left: number; top: number; text: string }>,
): void {
  // Reconcile a small pool of label nodes (avoid per-frame churn). Interactive
  // handle labels are managed separately, so exclude them from the pool.
  const nodes = overlay.querySelectorAll<HTMLElement>(
    ".theia-scene__label:not(.theia-scene__handle)",
  );
  for (let i = 0; i < Math.max(nodes.length, labels.length); i++) {
    let node = nodes[i];
    if (i >= labels.length) {
      node?.remove();
      continue;
    }
    if (!node) {
      node = document.createElement("div");
      node.className = "theia-scene__label";
      overlay.appendChild(node);
    }
    const l = labels[i]!;
    node.textContent = l.text;
    node.style.left = `${l.left}px`;
    node.style.top = `${l.top}px`;
  }
}
