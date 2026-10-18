import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});

