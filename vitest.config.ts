import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@inpage/cfb": resolve(root, "packages/cfb/src/index.ts"),
      "@inpage/diagnostics": resolve(root, "packages/diagnostics/src/index.ts"),
      "@inpage/document-model": resolve(root, "packages/document-model/src/index.ts"),
      "@inpage/inp-parser": resolve(root, "packages/inp-parser/src/index.ts"),
      "@inpage/layout-engine": resolve(root, "packages/layout-engine/src/index.ts"),
      "@inpage/text-shaper": resolve(root, "packages/text-shaper/src/index.ts"),
      "@inpage/pdf-renderer": resolve(root, "packages/pdf-renderer/src/index.ts"),
      "@inpage/converter": resolve(root, "packages/converter/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
