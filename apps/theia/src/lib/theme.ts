/** App chrome themes (the deck inside the iframe maps theia → light). */
export type Theme = "dark" | "theiaboard";

export const THEME_KEY = "theia-pg-theme";

/** Apply the chrome theme: toggle the documentElement class + persist it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("theiaboard", theme === "theiaboard");
  try {
    localStorage.setItem(THEME_KEY, theme);
    // The deck (iframe) reads "theia-theme" (light|dark); theia → light card.
    localStorage.setItem("theia-theme", theme === "dark" ? "dark" : "light");
  } catch {
    /* storage unavailable */
  }
}

export function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "theiaboard";
}
