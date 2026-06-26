import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Run tests against TypeScript source directly, no pre-build needed.
      "@chalk/ast": r("./packages/ast/src/index.ts"),
      "@chalk/parser": r("./packages/parser/src/index.ts"),
      "@chalk/runtime": r("./packages/runtime/src/index.ts"),
      "@chalk/compute": r("./packages/compute/src/index.ts"),
      "@chalk/render-slides": r("./packages/render-slides/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
