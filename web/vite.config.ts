import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/**
 * The CSP lives in vercel.json. The native shell (Capacitor) serves the build itself and never sees
 * those headers, so the same policy also goes into the built page as a meta tag. Build only: the dev
 * server's React refresh needs an inline script. frame-ancestors is dropped; a meta tag can't carry it.
 */
function cspMeta(): Plugin {
  const headers = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")).headers as { headers: { key: string; value: string }[] }[];
  const csp = headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy")?.value;
  if (!csp) throw new Error("vercel.json has no Content-Security-Policy");
  const meta = csp
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !d.startsWith("frame-ancestors"))
    .join("; ");
  return {
    name: "kagiboy-csp-meta",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: meta }, injectTo: "head-prepend" }],
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()], // Tailwind is scoped to the app (src/app/tw.css)
  server: { fs: { allow: [".."] } }, // brand.json lives at the repo root
  optimizeDeps: {
    // pre-bundled together so gameboy.js and our code share one settings object
    include: ["serverboy/src/gameboy_core/gameboy.js", "serverboy/src/gameboy_core/settings.js", "buffer"],
  },
});
