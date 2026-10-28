/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
})();

// base is "./" so the built site works from any path (GitHub Pages etc).
export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUILD_COMMIT__: JSON.stringify(commit),
  },
  server: { watch: { ignored: ["**/.claude/**"] } },
  build: {
    rolldownOptions: {
      output: {
        // React rarely changes between releases, so it gets a chunk of its own that browsers keep cached.
        // The path tracer (and its BVH library, not drei's older copy) loads only when a still is rendered.
        codeSplitting: {
          groups: [
            { name: "react", test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "pathtrace", test: /^(?!.*[\\/]drei[\\/]).*[\\/]node_modules[\\/](three-gpu-pathtracer|three-mesh-bvh)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.mjs"],
  },
});
