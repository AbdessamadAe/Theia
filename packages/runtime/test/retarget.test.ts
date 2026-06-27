import { describe, expect, it } from "vitest";
import { type AnimHandle, RetargetController } from "../src/retarget.js";

/** A test harness recording instant/animate calls and a controllable clock. */
function harness(opts: { reduced?: boolean; fastMs?: number } = {}) {
  let clock = 1000; // start past 0 so the constructor's seed is deterministic
  const log: string[] = [];
  let live = 0; // currently-active tweens (should never exceed 1)
  let maxLive = 0;
  const ctrl = new RetargetController<number>({
    fastMs: opts.fastMs ?? 90,
    reducedMotion: () => opts.reduced ?? false,
    now: () => clock,
    instant: (v) => log.push(`instant:${v}`),
    animate: (v): AnimHandle => {
      log.push(`animate:${v}`);
      live++;
      maxLive = Math.max(maxLive, live);
      return {
        cancel() {
          live--;
          log.push(`cancel:${v}`);
        },
      };
    },
  });
  return {
    set: (v: number, dt = 100) => {
      clock += dt;
      ctrl.set(v);
    },
    ctrl,
    log: () => log,
    maxLive: () => maxLive,
  };
}

describe("RetargetController — interrupt/retarget policy", () => {
  it("animates a deliberate (well-spaced) change", () => {
    const h = harness();
    h.set(2, 500); // 500ms after construction → deliberate
    expect(h.log()).toEqual(["animate:2"]);
  });

  it("tracks instantly during a fast drag (no tween, no backlog)", () => {
    const h = harness({ fastMs: 90 });
    // A burst of rapid updates (20ms apart) → all instant.
    h.set(1, 20);
    h.set(2, 20);
    h.set(3, 20);
    expect(h.log()).toEqual(["instant:1", "instant:2", "instant:3"]);
  });

  it("never stacks animations — a new target cancels the in-flight one", () => {
    const h = harness();
    h.set(1, 500); // animate:1
    h.set(2, 500); // deliberate again → cancel:1, animate:2
    h.set(3, 500); // cancel:2, animate:3
    expect(h.log()).toEqual([
      "animate:1",
      "cancel:1",
      "animate:2",
      "cancel:2",
      "animate:3",
    ]);
    expect(h.maxLive()).toBe(1); // at most one tween ever live
    expect(h.ctrl.animating).toBe(true);
  });

  it("cancels an in-flight tween when a drag begins (retarget → track)", () => {
    const h = harness({ fastMs: 90 });
    h.set(1, 500); // animate:1
    h.set(2, 20); // fast → cancel:1, instant:2
    expect(h.log()).toEqual(["animate:1", "cancel:1", "instant:2"]);
    expect(h.ctrl.animating).toBe(false);
  });

  it("never tweens under reduced motion", () => {
    const h = harness({ reduced: true });
    h.set(1, 500);
    h.set(2, 500);
    expect(h.log()).toEqual(["instant:1", "instant:2"]);
  });
});
