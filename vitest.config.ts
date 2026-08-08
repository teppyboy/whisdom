import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/components/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
})

