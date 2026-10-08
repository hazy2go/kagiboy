// Usage: pnpm dlx puppeteer-core is not needed; run from a folder with puppeteer-core installed, the web dev server on 5310
// (cd web && pnpm exec vite --port 5310), a funded devnet wallet in video/rec/demo/wallet.json, then: node takes.mjs <create|solana|evm|explorer>

// Recording rig for the technical demo video: headful Chrome, 1920×1080, real time.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
export const BASE = "http://127.0.0.1:5310";
export const OUT = "/Users/hazy/gb-wallet/video/rec/demo/takes";
const CHROME = "/Users/hazy/.cache/puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const WALLET = JSON.parse(readFileSync("/Users/hazy/gb-wallet/video/rec/demo/wallet.json", "utf8"));

export async function open({ seed = null, w = 1920, h = 1640, dsf = 1.5 } = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: null,
    args: [`--window-size=1600,1000`, "--window-position=0,0", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--hide-scrollbars", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"],
  });
  const page = (await browser.pages())[0];
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  // a soft visible pointer, since a screencast has no system cursor
  await page.evaluateOnNewDocument(() => {
    addEventListener("DOMContentLoaded", () => {
      const c = document.createElement("div");
      c.id = "rec-cursor";
      c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18.5 L13 27 L17 25.2 L13 17 L21 17 Z" fill="#1F2330" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
      Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))", transition: "scale .12s" });
      document.body.appendChild(c);
      addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`), true);
      addEventListener("mousedown", () => (c.style.scale = "0.86"), true);
      addEventListener("mouseup", () => (c.style.scale = "1"), true);
    });
  });
  await page.goto(BASE + "/demo", { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate((seed) => {
    localStorage.clear();
    localStorage.setItem("kagiboy.muted", "0");
    if (seed) localStorage.setItem("kagiboy.secure-element", JSON.stringify(seed));
  }, seed);
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.querySelector(".device-stage.is-ready"), { timeout: 30000 });
  await sleep(800);
  return { browser, page, ...helpers(page) };
}

function helpers(page) {
  const KEY = { A: "x", B: "z", START: "Enter", SELECT: "Shift", UP: "ArrowUp", DOWN: "ArrowDown", LEFT: "ArrowLeft", RIGHT: "ArrowRight" };
  const press = async (k, hold = 110, gap = 380) => {
    await page.keyboard.down(KEY[k]);
    await sleep(hold);
    await page.keyboard.up(KEY[k]);
    await sleep(gap);
  };
  const holdKey = async (k, ms) => {
    await page.keyboard.down(KEY[k]);
    await sleep(ms);
    await page.keyboard.up(KEY[k]);
  };
  const waitFor = async (fn, ms = 15000, arg) => {
    try { await page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg); return true; } catch { return false; }
  };
  // a visible mouse: glide to an element, then click it
  let mouse = { x: 960, y: 540 };
  const glide = async (x, y, steps = 28) => {
    await page.mouse.move(x, y, { steps });
    mouse = { x, y };
  };
  const find = (text, scope = ".kapp", exact = false) =>
    page.evaluate((text, scope, exact) => {
      const root = document.querySelector(scope) ?? document;
      const el = [...root.querySelectorAll("button, a, [role=button]")].find((e) => {
        const t = e.textContent.trim();
        return (exact ? t === text : t.includes(text)) && e.getClientRects().length;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, text, scope, exact);
  const click = async (text, scope = ".kapp", exact = false) => {
    const p = await find(text, scope, exact);
    if (!p) { console.log("NOT FOUND", text); return false; }
    await glide(p.x, p.y);
    await sleep(180);
    await page.mouse.click(p.x, p.y);
    await sleep(250);
    return true;
  };
  const type = async (sel, text) => {
    const r = await page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await glide(r.x, r.y);
    await page.mouse.click(r.x, r.y);
    await page.keyboard.type(text, { delay: 55 });
  };
  // frame-accurate capture: CDP screencast frames keep their own timestamps, then become a 30 fps video
  const rec = async (name, fn) => {
    const fs = await import("node:fs");
    const dir = `${OUT}/${name}-frames`;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const cdp = await page.createCDPSession();
    const frames = [];
    let t0 = null;
    cdp.on("Page.screencastFrame", async (f) => {
      const ts = f.metadata.timestamp;
      if (t0 === null) t0 = ts;
      const file = `${dir}/${String(frames.length).padStart(6, "0")}.jpg`;
      frames.push({ file, t: ts - t0 });
      fs.writeFile(file, Buffer.from(f.data, "base64"), () => {});
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    // the raw 160×144 LCD alongside, on the same wall clock, for pixel-perfect close-ups
    await page.evaluate(() => {
      const w = window;
      w.__lcd = [];
      let last = "";
      w.__lcdTimer = setInterval(() => {
        const c = w.__session?.canvas;
        if (!c) return;
        const d = c.toDataURL("image/png");
        if (d !== last) { w.__lcd.push([Date.now(), d]); last = d; }
      }, 16);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
    await sleep(500);
    const wall0 = Date.now();
    const marks = [];
    const mark = (label) => { marks.push({ t: +((Date.now() - wall0) / 1000 + 0.5).toFixed(2), label }); console.log("MARK", marks.at(-1)); };
    try { await fn(mark); } finally { await sleep(800); await cdp.send("Page.stopScreencast"); await sleep(500); }
    // the LCD frames on the screencast's clock (its timestamps are wall-clock seconds)
    const lcd = await page.evaluate(() => { clearInterval(window.__lcdTimer); return window.__lcd; });
    if (lcd.length) {
      const ldir = `${OUT}/${name}-lcd`;
      fs.rmSync(ldir, { recursive: true, force: true });
      fs.mkdirSync(ldir, { recursive: true });
      const base = (t0 ?? 0) * 1000;
      const ll = ["ffconcat version 1.0"];
      // hold a blank-ish first frame until the first LCD frame arrives
      const first = Math.max(0, (lcd[0][0] - base) / 1000);
      lcd.forEach(([ms, d], i) => {
        const f = `${ldir}/${String(i).padStart(6, "0")}.png`;
        fs.writeFileSync(f, Buffer.from(d.split(",")[1], "base64"));
        const t = (ms - base) / 1000;
        const next = i + 1 < lcd.length ? (lcd[i + 1][0] - base) / 1000 : frames.at(-1).t;
        ll.push(`file '${f}'`, `duration ${Math.max(0.001, i === 0 ? next : next - t).toFixed(4)}`);
      });
      ll.push(`file '${ldir}/${String(lcd.length - 1).padStart(6, "0")}.png'`);
      fs.writeFileSync(`${ldir}/list.txt`, ll.join("\n"));
      const { execFileSync } = await import("node:child_process");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${ldir}/list.txt`, "-vf", "scale=960:864:flags=neighbor,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "10", "-tune", "animation", `${OUT}/${name}-lcd.mp4`]);
      console.log("lcd frames", lcd.length, "first at", first.toFixed(2));
    }
    // concat list with each frame held until the next one arrived
    const lines = ["ffconcat version 1.0"];
    frames.forEach((fr, i) => { const d = (frames[i + 1]?.t ?? fr.t + 1 / 30) - fr.t; lines.push(`file '${fr.file}'`, `duration ${d.toFixed(4)}`); });
    lines.push(`file '${frames.at(-1).file}'`);
    fs.writeFileSync(`${dir}/list.txt`, lines.join("\n"));
    fs.writeFileSync(`${OUT}/${name}.marks.json`, JSON.stringify({ marks, frames: frames.length, seconds: frames.at(-1).t }, null, 1));
    console.log("frames", frames.length, "over", frames.at(-1).t.toFixed(1), "s =", (frames.length / frames.at(-1).t).toFixed(1), "fps");
    const { execFileSync } = await import("node:child_process");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "14", `${OUT}/${name}.mp4`]);
  };
  return { press, holdKey, waitFor, glide, find, click, type, rec, chip: (f) => page.evaluate(f) };
}
