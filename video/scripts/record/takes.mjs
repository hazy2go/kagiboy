// The takes for the technical demo video. node takes.mjs <create|solana|refuse|evm>
import { open, sleep, WALLET } from "./rig.mjs";
const take = process.argv[2];
const RECIPIENT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const log = (p) => p.evaluate(() => window.__session.chip.log.map((e) => `${e.dir} ${e.cmd} ${e.hex ?? ""}`));
const has = (p, cmd, dir = "chip>gb") => p.evaluate((cmd, dir) => window.__session.chip.log.some((e) => e.cmd === cmd && e.dir === dir), cmd, dir);

async function pin(t, digits = ["UP", "RIGHT", "UP", "UP"]) {
  for (const k of digits) await t.press(k, 110, 300);
  await sleep(500);
  await t.press("A", 110, 600);
}
async function unlock(t, mark) {
  await t.click("Switch on");
  await t.waitFor(() => window.__session.powered, 8000);
  await sleep(3200);
  mark("boot");
  await t.press("START", 120, 900);
  mark("pin");
  await pin(t);
  await t.waitFor(() => window.__session.chip.state === "unlocked", 8000);
  await sleep(1500);
  mark("home");
}

if (take === "create") {
  const t = await open();
  await t.glide(1500, 600, 1);
  await t.rec("create", async (mark) => {
    await sleep(1500);
    mark("click-switch-on");
    await t.click("Switch on");
    await sleep(3500);
    mark("start");
    await t.press("START", 120, 700);
    await t.press("A", 120, 700);
    mark("mash");
    const keys = ["A", "B", "UP", "DOWN", "LEFT", "RIGHT"];
    for (let i = 0; i < 400; i++) {
      if (await t.page.evaluate(() => window.__session.chip.log.some((e) => e.dir === "gb>chip" && e.cmd === "ENTROPY" && e.hex === "02 00"))) break;
      await t.press(keys[Math.floor(Math.random() * 6)], 50 + Math.random() * 70, 40 + Math.random() * 110);
    }
    mark("mash-done");
    await sleep(1500);
    const b = await t.page.evaluate(() => {
      const b = [...document.querySelectorAll(".device-controls button")].find((b) => b.textContent.toLowerCase().includes("shake"));
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await t.glide(b.x, b.y);
    await sleep(300);
    mark("shake");
    await t.page.mouse.down();
    for (let i = 0; i < 40 && !(await has(t.page, "CREATE", "gb>chip")); i++) await sleep(250);
    await t.page.mouse.up();
    mark("words");
    await t.glide(1500, 420);
    await sleep(5500);
    await t.press("A", 120, 900);
    mark("pin-1");
    await pin(t);
    mark("pin-2");
    await sleep(400);
    await pin(t);
    await t.waitFor(() => window.__session.chip.pairWindowOpen, 8000);
    await sleep(1800);
    mark("pair-click");
    await t.click("Pair cartridge");
    await t.waitFor(() => window.__session.chip.log.some((e) => e.cmd === "PAIR" && e.dir === "chip>gb"), 8000);
    mark("pair-code");
    await sleep(2600);
    await t.press("A", 140, 600);
    await t.waitFor(() => window.__session.chip.paired, 5000);
    mark("paired");
    await sleep(4500);
  });
  console.log((await log(t.page)).slice(-12));
  await t.browser.close();
}

if (take === "solana") {
  const t = await open({ seed: WALLET.persisted });
  await t.glide(1500, 600, 1);
  await t.rec("solana", async (mark) => {
    await sleep(800);
    await unlock(t, mark);
    await t.waitFor(() => window.__session.phone.balances.sol !== null, 15000);
    await sleep(1200);
    mark("send-open");
    await t.click("Send", ".kapp", true);
    await sleep(900);
    await t.type("form input[placeholder='Solana address']", RECIPIENT);
    await sleep(300);
    await t.type("form input[placeholder='0.0']", "0.05");
    await sleep(500);
    mark("ask");
    await t.click("Ask cartridge to sign", ".kapp");
    await t.waitFor(() => window.__session.chip.hasPending, 8000);
    mark("pending");
    await sleep(1500);
    // the Game Boy's request screen: review, then A to see the sign screen if needed
    await t.press("A", 120, 1200);
    mark("review");
    await sleep(3500);
    mark("hold");
    await t.holdKey("A", 1500);
    mark("signed");
    await t.waitFor(() => window.__session.phone.activity.some((a) => a.state === "confirmed"), 30000);
    mark("confirmed");
    await sleep(5000);
  });
  const sig = await t.page.evaluate(() => window.__session.phone.activity.find((a) => a.state === "confirmed")?.hash);
  console.log("SIG", sig);
  const fs = await import("node:fs");
  fs.writeFileSync("/Users/hazy/gb-wallet/video/rec/demo/takes/solana.sig.txt", sig ?? "");
  console.log((await log(t.page)).slice(-14));
  await t.browser.close();
}


if (take === "evm") {
  const t = await open({ seed: WALLET.persisted });
  await t.glide(1500, 600, 1);
  await t.rec("evm", async (mark) => {
    await sleep(800);
    await unlock(t, mark);
    await sleep(800);
    mark("networks");
    for (let i = 0; i < 5; i++) { await t.press("RIGHT", 120, 1500); mark("net-" + (await t.page.evaluate(() => window.__session.phone.evmNet.name))); }
    await sleep(800);
    mark("swap-tab");
    await t.click("Swap", ".kapp", true);
    await t.waitFor(() => /≈/.test(document.querySelector(".kapp").innerText), 20000);
    await sleep(2500);
    mark("review");
    await t.click("Review on Game Boy", ".kapp");
    await t.waitFor(() => window.__session.chip.hasPending, 15000);
    mark("pending");
    await sleep(2500);
    await t.press("A", 120, 1200);
    mark("swap-screen");
    await sleep(4500);
    mark("hold");
    await t.holdKey("A", 1500);
    mark("signed");
    await sleep(6000);
  });
  console.log((await log(t.page)).slice(-8));
  await t.browser.close();
}

if (take === "explorer") {
  const fs = await import("node:fs");
  const sig = fs.readFileSync("/Users/hazy/gb-wallet/video/rec/demo/takes/solana.sig.txt", "utf8").trim();
  const t = await open({ h: 1080 });
  await t.page.goto(`https://explorer.solana.com/tx/${sig}?cluster=devnet`, { waitUntil: "networkidle2", timeout: 60000 });
  await t.waitFor(() => /SUCCESS|Success/.test(document.body.innerText), 30000);
  // decline any cookie/consent banner if one shows up
  await t.page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /reject|decline|necessary/i.test(b.textContent))?.click());
  await sleep(2500);
  await t.glide(700, 500, 1);
  await t.rec("explorer", async (mark) => {
    mark("top");
    await sleep(3500);
    mark("scroll");
    for (let i = 0; i < 60; i++) { await t.page.mouse.wheel({ deltaY: 14 }); await sleep(33); }
    await sleep(3000);
    mark("instructions");
    for (let i = 0; i < 60; i++) { await t.page.mouse.wheel({ deltaY: 14 }); await sleep(33); }
    await sleep(3500);
  });
  await t.page.screenshot({ path: "/Users/hazy/gb-wallet/video/rec/demo/takes/explorer-end.png" });
  await t.browser.close();
}
