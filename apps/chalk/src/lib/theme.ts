/** App chrome themes (the deck inside the iframe maps chalk → light). */
export type Theme = "dark" | "chalkboard";

export const THEME_KEY = "chalk-pg-theme";

/** Apply the chrome theme: toggle the documentElement class + persist it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("chalkboard", theme === "chalkboard");
  try {
    localStorage.setItem(THEME_KEY, theme);
    // The deck (iframe) reads "chalk-theme" (light|dark); chalk → light card.
    localStorage.setItem("chalk-theme", theme === "dark" ? "dark" : "light");
  } catch {
    /* storage unavailable */
  }
}

export function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "chalkboard";
}
