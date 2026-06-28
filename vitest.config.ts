import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Run tests against TypeScript source directly, no pre-build needed.
      "@theia/ast": r("./packages/ast/src/index.ts"),
      "@theia/parser": r("./packages/parser/src/index.ts"),
      "@theia/runtime": r("./packages/runtime/src/index.ts"),
      "@theia/compute": r("./packages/compute/src/index.ts"),
      "@theia/render-slides/core": r("./packages/render-slides/src/render-core.ts"),
      "@theia/render-slides": r("./packages/render-slides/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
  },
});
