import { defineConfig } from "vite";

// The playground is a static, client-side app: it compiles `.chalk` in the
// browser via the engine packages, so there is no server. `base: "./"` keeps
// asset URLs relative so the built site can be hosted from any subpath.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000, // the inlined KaTeX/runtime assets are large
  },
  server: { port: 5173 },
  preview: { port: 5173 },
});
