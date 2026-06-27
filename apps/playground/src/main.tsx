import "@fontsource/caveat/400.css";
import "@fontsource/caveat/600.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

// Decide the initial theme once, before render. Two themes are offered: a dark
// "blackboard" and a "chalk" theme (light palette + chalk garnish), stored under
// "chalk-pg-theme". The deck inside the iframe reads "chalk-theme" (light | dark
// only), so the chalk theme maps the deck to a clean light card. A stored choice
// wins, else the OS preference (light → chalk).
type Theme = "dark" | "chalkboard";
const stored = (() => {
  try {
    return localStorage.getItem("chalk-pg-theme");
  } catch {
    return null;
  }
})();
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const theme: Theme = stored === "dark" || (stored !== "chalkboard" && prefersDark) ? "dark" : "chalkboard";
const root = document.documentElement;
root.classList.toggle("dark", theme === "dark");
root.classList.toggle("chalkboard", theme === "chalkboard");
const deckTheme = theme === "dark" ? "dark" : "light"; // chalk → clean light card
try {
  localStorage.setItem("chalk-pg-theme", theme);
  localStorage.setItem("chalk-theme", deckTheme);
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
