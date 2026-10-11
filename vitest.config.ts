import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    testTimeout: 20_000,
    setupFiles: ["tests/helpers/setup.ts"],
  },
});
