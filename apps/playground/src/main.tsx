import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

// Decide the initial theme once, before render: a stored choice wins, else the
// OS preference. We persist it under the SAME key the deck runtime already reads
// ("chalk-theme"), so the deck inside the iframe boots in the matching theme.
const stored = (() => {
  try {
    return localStorage.getItem("chalk-theme");
  } catch {
    return null;
  }
})();
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const theme = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
document.documentElement.classList.toggle("dark", theme === "dark");
try {
  localStorage.setItem("chalk-theme", theme);
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
