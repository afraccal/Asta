import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" e' una guardia del bundler di Next: fuori dal suo
      // contesto va neutralizzata, altrimenti impedisce l'import nei test.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["src/test/setup-env.ts"],
    testTimeout: 30000,
    include: ["src/**/*.test.ts"],
  },
});
