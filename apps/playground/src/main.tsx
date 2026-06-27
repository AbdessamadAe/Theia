import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/index.css";

// Follow the OS colour scheme for the shadcn theme (the deck iframe themes
// itself independently).
if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
