// One full-page capture of the devnet transaction on the Solana explorer, for a smooth virtual scroll in the video.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const CHROME = "/Users/hazy/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const sig = readFileSync("/Users/hazy/gb-wallet/video/rec/demo/takes/solana.sig.txt", "utf8").trim();
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await p.goto(`https://explorer.solana.com/tx/${sig}?cluster=devnet`, { waitUntil: "networkidle2", timeout: 60000 });
await p.waitForFunction(() => /Success/.test(document.body.innerText) && /Transfer/.test(document.body.innerText), { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
const h = await p.evaluate(() => document.documentElement.scrollHeight);
await p.screenshot({ path: "/Users/hazy/gb-wallet/video/public/demo/explorer-page.png", fullPage: true });
const at = await p.evaluate(() => {
  const find = (re) => { const el = [...document.querySelectorAll("h3, h4, h5, .card-header, td, span, div")].find((e) => re.test(e.textContent.trim()) && e.children.length < 3); if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.top + scrollY); };
  return { summary: find(/^Summary$/), signature: find(/^Signature$/), accounts: find(/^Accounts & SOL balance$/), transfer: find(/System Program: Transfer/), amount: find(/^Transfer Amount/) };
});
console.log(JSON.stringify({ sig, height: h, at }));
await b.close();
