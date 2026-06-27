/**
 * `:::scene3d` runtime — the WebGL 3D layer (Phase 9).
 *
 * A new rendering path alongside the 2D canvas/SVG, additive and lazy: three.js
 * is loaded from the CDN only when a 3D scene becomes visible, one
 * WebGLRenderer per scene, reused across objects and re-runs and disposed when
 * the slide scrolls away (WebGL contexts are scarce). The render loop is paused
 * while the scene is off-screen.
 *
 * 3D objects join the SAME reactive graph (expressions re-evaluate from a
 * `displayedScope` that eases toward the live slider values via the shared
 * RetargetController — deliberate change morphs, drag snaps) and the SAME
 * advance flow (`chalk:advance`). Labels are pinned to 3D points by projecting
 * world→screen each frame (see proj3d) and positioning DOM nodes.
 *
 * three.js objects are typed via the module namespace but loaded at runtime, so
 * this file carries no bundled 3D dependency.
 */
import { type CompiledExpr, compileExpr } from "./expr.js";
import { makeCoordSystem3D, projectToScreen } from "./proj3d.js";
import { RetargetController } from "./retarget.js";
import { loadThree, type ThreeFactory, type ThreeModule } from "./threejs-host.js";

interface GraphLike {
  get(name: string): number | undefined;
  scope(): Record<string, number>;
  addDependent(deps: string[], run: () => void): unknown;
}

export interface Scene3DOptions {
  /** Inject a three.js factory (tests). Defaults to the CDN loader. */
  three?: ThreeFactory;
}

interface ObjSpec {
  kind: string;
  name: string;
  on?: string;
  args: Record<string, string>;
}
interface AnimSpec {
  verb: string;
  target: string;
  args: string[];
  index: number;
}

const CREATE_VERBS = new Set(["create", "grow", "fade-in", "draw"]);

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

/** Parse `(u,v) -> (ex, ey, ez)` into its parameter names + component exprs. */
function parseParametric(
  src: string | undefined,
): { params: string[]; comps: CompiledExpr[] } | null {
  if (!src) return null;
  const m = /\(([^)]*)\)\s*->\s*\((.*)\)\s*$/.exec(src);
  if (!m) return null;
  const params = m[1]!.split(",").map((s) => s.trim()).filter(Boolean);
  const split = splitTop(m[2]!);
  const comps = split.map((s) => compileSafe(s)).filter((c): c is CompiledExpr => !!c);
  if (comps.length < 3) return null;
  return { params, comps };
}

function splitTop(s: string): string[] {
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
  return out;
}

/** Height colorscale: blue (low) → green → red (high). */
function heightColor(THREE: ThreeModule, t: number): InstanceType<ThreeModule["Color"]> {
  const c = new THREE.Color();
  c.setHSL((1 - Math.max(0, Math.min(1, t))) * 0.66, 0.7, 0.5);
  return c;
}

export function initScene3D(
  host: HTMLElement,
  graph: GraphLike,
  options: Scene3DOptions = {},
): void {
  const canvas = host.querySelector<HTMLCanvasElement>(".chalk-scene__canvas");
  const overlay = host.querySelector<HTMLElement>(".chalk-scene__overlay");
  const loadingEl = host.querySelector<HTMLElement>(".chalk-scene__loading");
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
  const factory = options.three ?? loadThree;
  const reduced = prefersReduced();

  // Reactive deps: slider vars referenced by any object expression.
  const deps = new Set<string>();
  for (const o of data.objects ?? []) {
    for (const raw of Object.values(o.args)) {
      const e = compileSafe(raw);
      if (e) for (const v of e.vars) if (graph.get(v) !== undefined) deps.add(v);
    }
  }

  let app: SceneApp | null = null;
  let loadStarted = false;
  let pendingRevealed = 0;

  const setStatus = (msg: string): void => {
    if (loadingEl) {
      loadingEl.textContent = msg;
      loadingEl.style.display = msg ? "" : "none";
    }
  };

  const ensureLoaded = (): void => {
    if (loadStarted) return;
    loadStarted = true;
    setStatus("Loading the 3D engine… (first load only)");
    factory(setStatus)
      .then((THREE) => {
        app = new SceneApp(THREE, canvas, overlay, data, graph, base, reduced);
        setStatus("");
        app.applyAdvance(pendingRevealed, false);
        app.start();
      })
      .catch((err: unknown) => {
        setStatus(
          `3D unavailable (needs network): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  };

  // Lazy gate on visibility; pause/dispose when off-screen.
  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible) {
        if (!app) ensureLoaded();
        else app.start();
      } else if (app) {
        app.stop();
      }
    });
    io.observe(host);
  } else {
    ensureLoaded();
  }

  document.addEventListener("chalk:advance", (event) => {
    const detail = (event as CustomEvent).detail as {
      slide: HTMLElement;
      revealed: number;
      animate: boolean;
    };
    if (!detail?.slide || !detail.slide.contains(host)) return;
    pendingRevealed = detail.revealed;
    app?.applyAdvance(detail.revealed, detail.animate);
  });

  graph.addDependent([...deps], () => app?.onScopeChange());
}

// ---------------------------------------------------------------------------
// The per-scene three.js application.
// ---------------------------------------------------------------------------

interface Obj3D {
  spec: ObjSpec;
  group: InstanceType<ThreeModule["Object3D"]>;
  creationIndex: number | null;
  appear: number;
  appearTarget: number;
  update?: (scope: Record<string, number>) => void; // reactive geometry
  labelEl?: HTMLElement;
  labelWorld?: (scope: Record<string, number>) => [number, number, number];
}

class SceneApp {
  private readonly renderer: InstanceType<ThreeModule["WebGLRenderer"]>;
  private readonly scene: InstanceType<ThreeModule["Scene"]>;
  private readonly camera: InstanceType<ThreeModule["PerspectiveCamera"]>;
  private readonly objects: Obj3D[] = [];
  private readonly byName = new Map<string, Obj3D>();
  private readonly coords = new Map<string, ReturnType<typeof makeCoordSystem3D>>();

  private rafId = 0;
  private running = false;
  private displayedScope: Record<string, number>;
  private targetScope: Record<string, number>;
  private easing = false;
  private readonly retarget: RetargetController<void>;

  // Camera spherical state (goal vs current, damped).
  private goal = { radius: 9, phi: 1.1, theta: 0.7 };
  private cur = { radius: 9, phi: 1.1, theta: 0.7 };
  private readonly defaultView = { radius: 9, phi: 1.1, theta: 0.7 };
  private autorotate = false;
  private dragging = false;
  private camPhiExpr?: CompiledExpr;
  private camThetaExpr?: CompiledExpr;
  private played = 0;

  constructor(
    private readonly THREE: ThreeModule,
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLElement | null,
    data: { objects: ObjSpec[]; anims: AnimSpec[] },
    private readonly graph: GraphLike,
    private readonly base: number,
    private readonly reduced: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 8, 6);
    this.scene.add(dir);

    this.displayedScope = { ...graph.scope() };
    this.targetScope = { ...graph.scope() };
    this.retarget = new RetargetController<void>({
      reducedMotion: () => false, // geometry "morph" easing is a state change
      instant: () => {
        this.displayedScope = { ...this.graph.scope() };
        this.easing = false;
        this.refreshGeometry();
      },
      animate: () => {
        this.targetScope = { ...this.graph.scope() };
        this.easing = true;
        return { cancel: () => { this.easing = false; } };
      },
    });

    this.animsList = data.anims ?? [];
    this.buildCoordSystems(data.objects);
    this.buildObjects(data.objects, data.anims);
    this.installOrbit();
    this.refreshGeometry();
  }

  // --- Build -------------------------------------------------------------

  private buildCoordSystems(specs: ObjSpec[]): void {
    for (const spec of specs) {
      if (spec.kind !== "axes3d") continue;
      const cs = makeCoordSystem3D(
        range(spec.args.x, [-3, 3]),
        range(spec.args.y, [-3, 3]),
        range(spec.args.z, [-3, 3]),
      );
      this.coords.set(spec.name, cs);
    }
    if (this.coords.size === 0) {
      this.coords.set("__default", makeCoordSystem3D([-3, 3], [-3, 3], [-3, 3]));
    }
  }

  private cs(name: string | undefined): ReturnType<typeof makeCoordSystem3D> {
    return (name && this.coords.get(name)) || [...this.coords.values()][0]!;
  }

  private buildObjects(specs: ObjSpec[], anims: AnimSpec[]): void {
    const THREE = this.THREE;
    for (const spec of specs) {
      const creation = anims.find(
        (a) => CREATE_VERBS.has(a.verb) && a.target === spec.name,
      );
      const group = new THREE.Group();
      const obj: Obj3D = {
        spec,
        group,
        creationIndex: creation ? creation.index : null,
        appear: creation ? 0 : 1,
        appearTarget: creation ? 0 : 1,
      };
      this.makeObject(obj);
      this.scene.add(group);
      this.objects.push(obj);
      this.byName.set(spec.name, obj);
      if (spec.kind === "camera") this.configureCamera(spec);
    }
  }

  private configureCamera(spec: ObjSpec): void {
    if (spec.args.distance) this.goal.radius = this.defaultView.radius = parseFloat(spec.args.distance);
    if (spec.args.phi) {
      this.camPhiExpr = compileSafe(spec.args.phi);
      const v = this.camPhiExpr?.eval(this.graph.scope());
      if (v !== undefined && Number.isFinite(v)) {
        this.goal.phi = this.defaultView.phi = (v * Math.PI) / 180;
      }
    }
    if (spec.args.theta) {
      this.camThetaExpr = compileSafe(spec.args.theta);
      const v = this.camThetaExpr?.eval(this.graph.scope());
      if (v !== undefined && Number.isFinite(v)) {
        this.goal.theta = this.defaultView.theta = (v * Math.PI) / 180;
      }
    }
    if (spec.args.autorotate === "true" && !this.reduced) this.autorotate = true;
    this.cur = { ...this.goal };
  }

  private makeObject(obj: Obj3D): void {
    const THREE = this.THREE;
    const { spec } = obj;
    const cs = this.cs(spec.on);
    const colorOf = (fallback: number): InstanceType<ThreeModule["Color"]> =>
      new THREE.Color(spec.args.color ?? fallback);

    switch (spec.kind) {
      case "axes3d":
        obj.group.add(this.makeAxesLines(cs));
        break;
      case "surface":
      case "psurface":
        obj.update = this.makeSurface(obj, cs);
        break;
      case "dot3d": {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 20, 20),
          new THREE.MeshStandardMaterial({ color: colorOf(0xe11d48), transparent: true }),
        );
        obj.group.add(mesh);
        obj.update = (scope) => {
          const w = this.evalPoint(spec, scope, cs);
          if (w) mesh.position.set(w[0], w[1], w[2]);
        };
        break;
      }
      case "sphere":
      case "cube":
      case "box":
      case "cone":
      case "cylinder":
      case "torus":
      case "tetrahedron":
      case "octahedron":
      case "dodecahedron":
      case "icosahedron": {
        const mesh = new THREE.Mesh(
          this.solidGeometry(spec),
          new THREE.MeshStandardMaterial({
            color: colorOf(0x2563eb),
            transparent: true,
            roughness: 0.5,
            metalness: 0.1,
          }),
        );
        obj.group.add(mesh);
        obj.update = (scope) => {
          const w = this.evalPoint(spec, scope, cs);
          if (w) mesh.position.set(w[0], w[1], w[2]);
        };
        break;
      }
      case "line3d":
      case "vector3d":
      case "arrow3d":
        obj.update = this.makeArrowOrLine(obj, cs, spec.kind !== "line3d");
        break;
      case "curve3d":
        obj.update = this.makeCurve(obj, cs);
        break;
      case "label": {
        const el = document.createElement("div");
        el.className = "chalk-scene__label";
        this.renderLabel(el, spec.args.text ?? spec.name);
        this.overlay?.appendChild(el);
        obj.labelEl = el;
        obj.labelWorld = (scope) => this.evalPoint(spec, scope, cs) ?? [0, 0, 0];
        break;
      }
      default:
        break;
    }
  }

  private renderLabel(el: HTMLElement, text: string): void {
    const k = (globalThis as unknown as { katex?: { render(t: string, e: HTMLElement, o: object): void } }).katex;
    if (k) {
      try {
        k.render(text, el, { throwOnError: false });
        return;
      } catch {
        /* fall through */
      }
    }
    el.textContent = text;
  }

  private makeAxesLines(cs: ReturnType<typeof makeCoordSystem3D>): InstanceType<ThreeModule["Object3D"]> {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const mk = (a: [number, number, number], b: [number, number, number], color: number): void => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...cs.toWorld(...a)),
        new THREE.Vector3(...cs.toWorld(...b)),
      ]);
      group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
    };
    mk([cs.xRange[0], 0, 0], [cs.xRange[1], 0, 0], 0xd14d4d);
    mk([0, cs.yRange[0], 0], [0, cs.yRange[1], 0], 0x4daa57);
    mk([0, 0, cs.zRange[0]], [0, 0, cs.zRange[1]], 0x4d6dd1);
    return group;
  }

  private solidGeometry(spec: ObjSpec) {
    const THREE = this.THREE;
    const r = spec.args.r ? parseFloat(spec.args.r) : 0.6;
    switch (spec.kind) {
      case "sphere":
        return new THREE.SphereGeometry(r, 32, 24);
      case "cube":
      case "box":
        return new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4);
      case "cone":
        return new THREE.ConeGeometry(r, r * 2, 32);
      case "cylinder":
        return new THREE.CylinderGeometry(r, r, r * 2, 32);
      case "torus":
        return new THREE.TorusGeometry(r, r * 0.4, 20, 40);
      case "tetrahedron":
        return new THREE.TetrahedronGeometry(r);
      case "octahedron":
        return new THREE.OctahedronGeometry(r);
      case "dodecahedron":
        return new THREE.DodecahedronGeometry(r);
      case "icosahedron":
        return new THREE.IcosahedronGeometry(r);
      default:
        return new THREE.SphereGeometry(r, 16, 12);
    }
  }

  private makeSurface(
    obj: Obj3D,
    cs: ReturnType<typeof makeCoordSystem3D>,
  ): (scope: Record<string, number>) => void {
    const THREE = this.THREE;
    const N = 48;
    const geo = new THREE.PlaneGeometry(1, 1, N, N);
    const colorscale = obj.spec.args.colorscale !== undefined;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      vertexColors: colorscale,
      side: THREE.DoubleSide,
      transparent: true,
      roughness: 0.6,
      metalness: 0.05,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    obj.group.add(mesh);

    const expr = compileSafe(obj.spec.args.expr);
    const parametric = parseParametric(obj.spec.args.expr);
    const colors = colorscale
      ? new Float32Array((N + 1) * (N + 1) * 3)
      : null;
    if (colors) geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return (scope) => {
      const pos = geo.attributes.position as InstanceType<ThreeModule["BufferAttribute"]>;
      let zMin = Infinity;
      let zMax = -Infinity;
      const zs: number[] = [];
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          let wx: number, wy: number, wz: number, hz: number;
          if (parametric) {
            const u = cs.xRange[0] + ((cs.xRange[1] - cs.xRange[0]) * i) / N;
            const v = cs.yRange[0] + ((cs.yRange[1] - cs.yRange[0]) * j) / N;
            const s = { ...scope, [parametric.params[0] ?? "u"]: u, [parametric.params[1] ?? "v"]: v };
            const x = parametric.comps[0]!.eval(s);
            const y = parametric.comps[1]!.eval(s);
            const z = parametric.comps[2]!.eval(s);
            [wx, wy, wz] = cs.toWorld(x, y, z);
            hz = z;
          } else {
            const x = cs.xRange[0] + ((cs.xRange[1] - cs.xRange[0]) * i) / N;
            const y = cs.yRange[0] + ((cs.yRange[1] - cs.yRange[0]) * j) / N;
            const z = expr ? expr.eval({ ...scope, x, y }) : 0;
            [wx, wy, wz] = cs.toWorld(x, y, z);
            hz = z;
          }
          const idx = j * (N + 1) + i;
          pos.setXYZ(idx, wx, wy, wz);
          zs[idx] = hz;
          if (Number.isFinite(hz)) {
            zMin = Math.min(zMin, hz);
            zMax = Math.max(zMax, hz);
          }
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      if (colors) {
        const span = zMax - zMin || 1;
        for (let idx = 0; idx < zs.length; idx++) {
          const c = heightColor(THREE, (zs[idx]! - zMin) / span);
          colors[idx * 3] = c.r;
          colors[idx * 3 + 1] = c.g;
          colors[idx * 3 + 2] = c.b;
        }
        (geo.attributes.color as InstanceType<ThreeModule["BufferAttribute"]>).needsUpdate = true;
      }
    };
  }

  private makeArrowOrLine(
    obj: Obj3D,
    cs: ReturnType<typeof makeCoordSystem3D>,
    arrow: boolean,
  ): (scope: Record<string, number>) => void {
    const THREE = this.THREE;
    const triple = (raw: string | undefined): [CompiledExpr, CompiledExpr, CompiledExpr] | null => {
      if (!raw) return null;
      const parts = splitTop(raw).map((s) => compileSafe(s));
      if (parts.length < 3 || parts.some((p) => !p)) return null;
      return parts as [CompiledExpr, CompiledExpr, CompiledExpr];
    };
    const from = triple(obj.spec.args.from) ?? null;
    const to = triple(obj.spec.args.to);
    const color = new THREE.Color(obj.spec.args.color ?? 0x111827);

    if (arrow) {
      const helper = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(),
        1,
        color.getHex(),
      );
      obj.group.add(helper);
      return (scope) => {
        const a: [number, number, number] = from ? this.tripleWorld(from, scope, cs) : [0, 0, 0];
        const b: [number, number, number] = to ? this.tripleWorld(to, scope, cs) : [1, 1, 1];
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const len = dir.length() || 1e-6;
        helper.position.set(a[0], a[1], a[2]);
        helper.setDirection(dir.normalize());
        helper.setLength(len, Math.min(0.3, len * 0.25), Math.min(0.2, len * 0.15));
      };
    }
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    obj.group.add(line);
    return (scope) => {
      const a = from ? this.tripleWorld(from, scope, cs) : [0, 0, 0];
      const b = to ? this.tripleWorld(to, scope, cs) : [1, 1, 1];
      geo.setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    };
  }

  private makeCurve(
    obj: Obj3D,
    cs: ReturnType<typeof makeCoordSystem3D>,
  ): (scope: Record<string, number>) => void {
    const THREE = this.THREE;
    const parametric = parseParametric(obj.spec.args.expr);
    const N = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array((N + 1) * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: obj.spec.args.color ?? 0x7c3aed }),
    );
    obj.group.add(line);
    const tMin = obj.spec.args.from ? parseFloat(obj.spec.args.from) : 0;
    const tMax = obj.spec.args.to ? parseFloat(obj.spec.args.to) : Math.PI * 2;
    return (scope) => {
      if (!parametric) return;
      const p = parametric.params[0] ?? "t";
      for (let i = 0; i <= N; i++) {
        const t = tMin + ((tMax - tMin) * i) / N;
        const s = { ...scope, [p]: t };
        const w = cs.toWorld(
          parametric.comps[0]!.eval(s),
          parametric.comps[1]!.eval(s),
          parametric.comps[2]!.eval(s),
        );
        positions[i * 3] = w[0];
        positions[i * 3 + 1] = w[1];
        positions[i * 3 + 2] = w[2];
      }
      (geo.attributes.position as InstanceType<ThreeModule["BufferAttribute"]>).needsUpdate = true;
    };
  }

  private evalPoint(
    spec: ObjSpec,
    scope: Record<string, number>,
    cs: ReturnType<typeof makeCoordSystem3D>,
  ): [number, number, number] | null {
    const x = compileSafe(spec.args.x)?.eval(scope) ?? 0;
    const y = compileSafe(spec.args.y)?.eval(scope) ?? 0;
    const z = compileSafe(spec.args.z)?.eval(scope) ?? 0;
    if (![x, y, z].every(Number.isFinite)) return null;
    return cs.toWorld(x, y, z);
  }

  private tripleWorld(
    t: [CompiledExpr, CompiledExpr, CompiledExpr],
    scope: Record<string, number>,
    cs: ReturnType<typeof makeCoordSystem3D>,
  ): [number, number, number] {
    return cs.toWorld(t[0].eval(scope), t[1].eval(scope), t[2].eval(scope));
  }

  // --- Reactivity --------------------------------------------------------

  onScopeChange(): void {
    this.retarget.set(undefined);
    this.requestFrame();
  }

  private refreshGeometry(): void {
    for (const o of this.objects) o.update?.(this.displayedScope);
    if (this.camPhiExpr) {
      const v = this.camPhiExpr.eval(this.displayedScope);
      if (Number.isFinite(v)) this.goal.phi = (v * Math.PI) / 180;
    }
    if (this.camThetaExpr) {
      const v = this.camThetaExpr.eval(this.displayedScope);
      if (Number.isFinite(v)) this.goal.theta = (v * Math.PI) / 180;
    }
  }

  // --- Advance flow ------------------------------------------------------

  applyAdvance(revealed: number, animate: boolean): void {
    const next = Math.max(0, Math.min(this.anims().length, revealed - this.base));
    const singleForward = animate && next === this.played + 1 && !this.reduced;
    for (const o of this.objects) {
      o.appearTarget = o.creationIndex === null || next > o.creationIndex ? 1 : 0;
      if (!singleForward) o.appear = o.appearTarget;
    }
    if (singleForward) {
      const verb = this.animsList[this.played];
      if (verb) this.playVerb(verb);
    }
    this.played = next;
    this.requestFrame();
    if (singleForward) this.start();
  }

  private animsList: AnimSpec[] = [];
  private anims(): AnimSpec[] {
    return this.animsList;
  }

  private playVerb(verb: AnimSpec): void {
    if (verb.verb === "rotate-camera") {
      this.goal.theta += Math.PI / 2;
    } else if (verb.verb === "rotate" || verb.verb === "spin") {
      const t = this.byName.get(verb.target);
      if (t) t.group.rotation.y += Math.PI / 2;
    }
  }

  // --- Orbit controls ----------------------------------------------------

  private installOrbit(): void {
    const el = this.canvas;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent): void => {
      this.dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture?.(e.pointerId);
      this.start();
    };
    const onMove = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.goal.theta -= (e.clientX - lastX) * 0.01;
      this.goal.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.goal.phi - (e.clientY - lastY) * 0.01));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent): void => {
      this.dragging = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.goal.radius = Math.max(3, Math.min(30, this.goal.radius * (1 + Math.sign(e.deltaY) * 0.1)));
      this.start();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", () => {
      this.goal = { ...this.defaultView };
      this.start();
    });
    el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "r") {
        this.goal = { ...this.defaultView };
        this.start();
      }
    });
  }

  // --- Render loop -------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.requestFrame();
  }
  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
  private requestFrame(): void {
    if (!this.rafId && typeof requestAnimationFrame === "function") {
      this.rafId = requestAnimationFrame(() => this.frame());
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 640;
    const h = this.canvas.clientHeight || 420;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  private frame(): void {
    this.rafId = 0;
    this.resize();

    // Ease the displayed scope toward the target (smooth surface morph).
    if (this.easing) {
      let done = true;
      for (const key of Object.keys(this.targetScope)) {
        const cur = this.displayedScope[key] ?? this.targetScope[key]!;
        const next = cur + (this.targetScope[key]! - cur) * 0.2;
        this.displayedScope[key] = next;
        if (Math.abs(this.targetScope[key]! - next) > 1e-4) done = false;
      }
      this.refreshGeometry();
      if (done) this.easing = false;
    }

    // Appear tweens.
    let animatingAppear = false;
    for (const o of this.objects) {
      if (o.appear !== o.appearTarget) {
        o.appear += (o.appearTarget - o.appear) * 0.2;
        if (Math.abs(o.appearTarget - o.appear) < 0.01) o.appear = o.appearTarget;
        else animatingAppear = true;
        this.applyAppear(o);
      }
    }

    // Auto-rotate.
    if (this.autorotate && !this.dragging && !this.reduced) {
      this.goal.theta += 0.005;
    }

    // Damp camera toward goal.
    const damp = this.reduced ? 1 : 0.15;
    this.cur.radius += (this.goal.radius - this.cur.radius) * damp;
    this.cur.phi += (this.goal.phi - this.cur.phi) * damp;
    this.cur.theta += (this.goal.theta - this.cur.theta) * damp;
    const sinPhi = Math.sin(this.cur.phi);
    this.camera.position.set(
      this.cur.radius * sinPhi * Math.sin(this.cur.theta),
      this.cur.radius * Math.cos(this.cur.phi),
      this.cur.radius * sinPhi * Math.cos(this.cur.theta),
    );
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
    this.projectLabels();

    const cameraMoving =
      Math.abs(this.goal.theta - this.cur.theta) > 1e-3 ||
      Math.abs(this.goal.phi - this.cur.phi) > 1e-3 ||
      Math.abs(this.goal.radius - this.cur.radius) > 1e-3;
    const keepGoing =
      this.running &&
      (this.autorotate || this.dragging || cameraMoving || this.easing || animatingAppear);
    if (keepGoing) this.requestFrame();
  }

  private applyAppear(o: Obj3D): void {
    o.group.traverse((child: InstanceType<ThreeModule["Object3D"]>) => {
      const mat = (child as { material?: { opacity: number; transparent: boolean } }).material;
      if (mat) {
        mat.transparent = true;
        mat.opacity = o.appear;
      }
    });
    if (o.spec.kind === "dot3d" || this.solidKind(o.spec.kind)) {
      const s = Math.max(0.001, o.appear);
      o.group.scale.set(s, s, s);
    }
    if (o.labelEl) o.labelEl.style.opacity = String(o.appear);
  }

  private solidKind(kind: string): boolean {
    return [
      "sphere", "cube", "box", "cone", "cylinder", "torus",
      "tetrahedron", "octahedron", "dodecahedron", "icosahedron",
    ].includes(kind);
  }

  // (anims are assigned in the constructor from the scene data.)

  private projectLabels(): void {
    if (!this.overlay) return;
    const m = this.camera.projectionMatrix.clone().multiply(this.camera.matrixWorldInverse);
    const w = this.canvas.clientWidth || 640;
    const h = this.canvas.clientHeight || 420;
    for (const o of this.objects) {
      if (!o.labelEl || !o.labelWorld) continue;
      if (o.appear <= 0.01) {
        o.labelEl.style.display = "none";
        continue;
      }
      const world = o.labelWorld(this.displayedScope);
      const p = projectToScreen(world, m.elements, w, h);
      if (!p.visible) {
        o.labelEl.style.display = "none";
      } else {
        o.labelEl.style.display = "";
        o.labelEl.style.left = `${p.x}px`;
        o.labelEl.style.top = `${p.y}px`;
      }
    }
  }
}

function range(raw: string | undefined, fallback: [number, number]): [number, number] {
  if (!raw) return fallback;
  const m = /\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/.exec(raw);
  return m ? [parseFloat(m[1]!), parseFloat(m[2]!)] : fallback;
}
