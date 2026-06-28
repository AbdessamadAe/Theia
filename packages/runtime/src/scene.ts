/**
 * `:::scene` runtime (Phase 8, sub-phase A — graphing backbone).
 *
 * A scene owns ONE canvas plus a DOM overlay for labels. Coordinate systems
 * (axes / numberline) build a {@link CoordSystem}; objects declared `on` them
 * store data-space expressions and are mapped to pixels at draw time. Every
 * expression re-evaluates from the shared reactive graph each redraw, so a
 * curve/area/tangent bound to a slider updates live. `+animate` verbs join the
 * existing advance flow via the `chalk:advance` event.
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
  document.querySelectorAll<HTMLElement>(".chalk-scene").forEach((host) => {
    if (host.getAttribute("data-3d") === "true") initScene3D(host, graph, options);
    else setupScene(host, graph);
  });
}

function setupScene(host: HTMLElement, graph: GraphLike): void {
  const canvas = host.querySelector<HTMLCanvasElement>(".chalk-scene__canvas");
  const overlay = host.querySelector<HTMLElement>(".chalk-scene__overlay");
  const dataEl = host.querySelector(".chalk-scene__data");
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
    console.warn(`chalk: placement cycle among [${cycles.join(", ")}] — falling back to absolute position`);
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
      resolved.set(o, o.movePos ?? basePos(o, scope));
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
    window.parent.postMessage({ source: "chalk", type: "coords", span, x, y }, "*");
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
      node.setAttribute("data-chalk-derived", "true");
      node.title = it.vars.length
        ? `Bound to ${it.vars.join(", ")} — drag the slider to move this`
        : "Computed position — not draggable";
      return;
    }
    node.setAttribute("data-chalk-free", "true");
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
        o.spec.kind === "label" ? "chalk-scene__label chalk-scene__handle" : "chalk-scene__handle";
      if (o.spec.kind === "label") node.textContent = o.spec.args.text ?? o.spec.name;
      else node.setAttribute("data-chalk-point", "true");
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
      el.className = "chalk-scene__media" + (isVideo ? " chalk-scene__media--video" : "");
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

  // Reactive dependencies: slider vars referenced by any expression.
  const deps = new Set<string>();
  for (const o of objects) {
    for (const e of [o.expr, o.xExpr, o.yExpr, o.fromExpr, o.toExpr]) {
      if (!e) continue;
      for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);
    }
  }
  for (const v of mediaDepVars()) if (graph.get(v) !== undefined) deps.add(v);

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

    // Then objects placed on a coordinate system, in declaration order.
    for (const o of objects) {
      if (o.spec.kind === "axes" || o.spec.kind === "numberline") continue;
      if (o.appear <= 0.001) continue;
      const cs = coordFor(o.spec.on, area);
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
          drawPoint(ctx, cs, o, scope, colors);
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
  }

  // --- Advance flow --------------------------------------------------------
  let played = 0;
  const applyAdvance = (revealed: number, animate: boolean): void => {
    const next = Math.max(0, Math.min(anims.length, revealed - base));
    const forward = next > played;
    const singleForward = animate && next === played + 1;

    const tween = singleForward && !reduced;

    // Object visibility from creation verbs. Jumps, reverses, and reduced
    // motion settle instantly; a forward single step tweens via the rAF loop.
    for (const o of objects) {
      o.appearTarget = o.creationIndex === null || next > o.creationIndex ? 1 : 0;
      if (!tween) o.appear = o.appearTarget;
    }

    // A single forward step may also be an `indicate` pulse or a media verb.
    if (singleForward) {
      const verb = anims[played];
      if (verb && verb.verb === "indicate" && !reduced) {
        const target = byName.get(verb.target);
        if (target) target.flash = 1;
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

  document.addEventListener("chalk:advance", (event) => {
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
  o: SceneObj,
  scope: Record<string, number>,
  colors: Colors,
): void {
  if (!o.xExpr || !o.yExpr) return;
  const [x, y] = o.override ?? [o.xExpr.eval(scope), o.yExpr.eval(scope)];
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

function positionLabels(
  overlay: HTMLElement,
  labels: Array<{ left: number; top: number; text: string }>,
): void {
  // Reconcile a small pool of label nodes (avoid per-frame churn). Interactive
  // handle labels are managed separately, so exclude them from the pool.
  const nodes = overlay.querySelectorAll<HTMLElement>(
    ".chalk-scene__label:not(.chalk-scene__handle)",
  );
  for (let i = 0; i < Math.max(nodes.length, labels.length); i++) {
    let node = nodes[i];
    if (i >= labels.length) {
      node?.remove();
      continue;
    }
    if (!node) {
      node = document.createElement("div");
      node.className = "chalk-scene__label";
      overlay.appendChild(node);
    }
    const l = labels[i]!;
    node.textContent = l.text;
    node.style.left = `${l.left}px`;
    node.style.top = `${l.top}px`;
  }
}
