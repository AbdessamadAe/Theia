/** A trailing debounce with `cancel` + `flush`, used for autosave. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): { (...args: A): void; cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const run = (...args: A): void => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const a = pending;
      pending = undefined;
      if (a) fn(...a);
    }, delay);
  };
  run.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  run.flush = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pending) {
      const a = pending;
      pending = undefined;
      fn(...a);
    }
  };
  return run;
}
