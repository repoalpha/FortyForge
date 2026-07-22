import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["**/.worktrees/**", "**/node_modules/**", "**/dist/**"],
    globals: true
  }
});
