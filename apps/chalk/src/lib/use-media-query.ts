import * as React from "react";

/** Reactive `matchMedia` hook (SSR-safe-ish; the playground is client-only). */
export function useMediaQuery(query: string): boolean {
  const get = (): boolean =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = React.useState(get);
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
