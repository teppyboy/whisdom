import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  build: {
    // Keep the companion executable in dist/bin; Windows may lock it while the app is running.
    emptyOutDir: false,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  lint: {
    ignorePatterns: [
      "dist",
      "companion/src-tauri/target",
      "server/target",
      ".pi",
      // Generated browser WASM output; do not lint.
      "src/wasm",
    ],
    plugins: ["react", "typescript", "oxc"],
    env: { browser: true },
    categories: {
      correctness: "error",
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
})
