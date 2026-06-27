import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Static, client-side playground (no server). `base: "/"` so deep client routes
// (/projects/:id) resolve assets from the root on refresh. React + Tailwind +
// shadcn-style components.
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000, // inlined KaTeX/runtime assets are large
  },
  server: { port: 5173 },
  preview: { port: 5173 },
});
