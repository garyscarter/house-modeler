import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is "./" so the built site works from any path (GitHub Pages etc).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
