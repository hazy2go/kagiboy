// Renders og.html (1200x630) to web/public/og.png with headless Chrome.
//   node assets/og/make-og.cjs   (needs assets/og/device.png: a transparent render)
const { chromium } = require("/opt/homebrew/lib/node_modules/playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto("file://" + path.join(__dirname, "og.html"), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.locator(".card").screenshot({ path: path.join(__dirname, "../../web/public/og.png") });
  await b.close();
})();
