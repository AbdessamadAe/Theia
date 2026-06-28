import "@fontsource/caveat/400.css";
import "@fontsource/caveat/600.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

// Decide the initial theme once, before render. Two themes are offered: a dark
// "blackboard" and a "theia" theme (light palette + theia garnish), stored under
// "theia-pg-theme". The deck inside the iframe reads "theia-theme" (light | dark
// only), so the theia theme maps the deck to a clean light card. A stored choice
// wins, else the OS preference (light → theia).
type Theme = "dark" | "theiaboard";
const stored = (() => {
  try {
    return localStorage.getItem("theia-pg-theme");
  } catch {
    return null;
  }
})();
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const theme: Theme = stored === "dark" || (stored !== "theiaboard" && prefersDark) ? "dark" : "theiaboard";
const root = document.documentElement;
root.classList.toggle("dark", theme === "dark");
root.classList.toggle("theiaboard", theme === "theiaboard");
const deckTheme = theme === "dark" ? "dark" : "light"; // theia → clean light card
try {
  localStorage.setItem("theia-pg-theme", theme);
  localStorage.setItem("theia-theme", deckTheme);
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
