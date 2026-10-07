import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [".."] } }, // brand.json lives at the repo root
  optimizeDeps: {
    // pre-bundled together so gameboy.js and our code share one settings object
    include: ["serverboy/src/gameboy_core/gameboy.js", "serverboy/src/gameboy_core/settings.js", "buffer"],
  },
});
