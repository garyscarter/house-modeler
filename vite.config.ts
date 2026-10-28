/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
})();

const HOUSES_DIR = path.resolve(import.meta.dirname, "src/houses");
/** The owner's house: its saves keep the original storage names. Shared with the server (server/houses.mjs). */
const DEFAULT_HOUSE_ID: string = JSON.parse(fs.readFileSync(path.join(HOUSES_DIR, "default.json"), "utf8")).id;

/**
 * `virtual:houses`: the house registry, one entry per folder under src/houses/ that has an index.ts. Folders starting
 * with "_" are left out unless VITE_HOUSES names them; when VITE_HOUSES (comma-separated ids) is set, only those
 * folders are listed, so no other house's code or photos enter the build. Each house loads lazily.
 */
function housesPlugin(): Plugin {
  const ID = "virtual:houses";
  const RESOLVED = "\0virtual:houses";
  return {
    name: "storey-houses",
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return;
      const wanted = (process.env.VITE_HOUSES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const folders = fs
        .readdirSync(HOUSES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(HOUSES_DIR, d.name, "index.ts")))
        .map((d) => d.name)
        .filter((name) => (wanted.length ? wanted.includes(name) : !name.startsWith("_")))
        .sort();
      const missing = wanted.filter((w) => !folders.includes(w));
      if (missing.length) this.warn(`VITE_HOUSES names houses with no folder: ${missing.join(", ")}`);
      const entries = folders.map((name) => {
        const dir = path.join(HOUSES_DIR, name);
        this.addWatchFile(path.join(dir, "meta.json"));
        let display = name;
        try {
          display = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")).name || name;
        } catch {
          /* no meta.json: the id stands in for the name */
        }
        const file = path.join(dir, "index.ts").split(path.sep).join("/");
        return `  ${JSON.stringify(name)}: { id: ${JSON.stringify(name)}, name: ${JSON.stringify(display)}, load: () => import(${JSON.stringify(file)}) },`;
      });
      return `export const DEFAULT_HOUSE_ID = ${JSON.stringify(DEFAULT_HOUSE_ID)};\nexport const HOUSES = {\n${entries.join("\n")}\n};\n`;
    },
  };
}

// base is "./" so the built site works from any path (GitHub Pages etc).
export default defineConfig({
  plugins: [react(), housesPlugin()],
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
    setupFiles: ["src/test-setup.ts"],
  },
});
