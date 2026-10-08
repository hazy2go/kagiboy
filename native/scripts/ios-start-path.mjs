// capacitor:copy:after hook.
// iOS refuses to boot unless `public/<appStartPath>` exists on disk
// (CAPBridgeViewController.loadWebView does a fileExists check), even though the
// scheme handler then serves index.html for any extension-less path. The web
// build has no /app file (it's a BrowserRouter route), so drop a marker folder
// into the copied iOS bundle. Android has no such check, so it's left alone.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CAPACITOR_PLATFORM_NAME === "ios") {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../ios/App/App/public/app");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".keep"), "");
  console.log("[kagiboy] ios: created public/app start-path marker");
}
