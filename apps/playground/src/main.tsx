import "@fontsource/caveat/400.css";
import "@fontsource/caveat/600.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

// Decide the initial theme once, before render. The playground theme
// (light | dark | chalkboard) is stored under "chalk-pg-theme"; the deck inside
// the iframe reads "chalk-theme" (light | dark only), so chalkboard maps the
// deck to a clean light card. A stored choice wins, else the OS preference.
type Theme = "light" | "dark" | "chalkboard";
const stored = (() => {
  try {
    return localStorage.getItem("chalk-pg-theme");
  } catch {
    return null;
  }
})();
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const theme: Theme =
  stored === "light" || stored === "dark" || stored === "chalkboard"
    ? stored
    : prefersDark
      ? "dark"
      : "light";
const root = document.documentElement;
root.classList.toggle("dark", theme === "dark");
root.classList.toggle("chalkboard", theme === "chalkboard");
const deckTheme = theme === "dark" ? "dark" : "light"; // chalkboard → clean light card
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
