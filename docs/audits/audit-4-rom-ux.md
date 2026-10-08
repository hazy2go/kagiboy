# kagiboy audit #4: ROM + website UI/UX (2026-10-08, read-only)

Scope: `rom/src/main.c` (both builds) driven headlessly against `web/src/chip/chip.ts`, plus `/`, `/about` and `/demo` (with KagiApp) on a local Vite server, using headless Chrome at 1440, 1024x1366, 768, 430x739, 390x844 and 360x780. The only repo file I wrote is this report.

Scratch: `/Users/hazy/.claude/jobs/d7a54b92/tmp/audit4-rom/`
- `drive.mts`, `mash.mts`: ROM drivers (GameBoy + CartChip). PNGs go to `out/` (`R/` below), checks to `out/results.txt`.
- `web/shots.mjs`, `overflow*.mjs`, `axe.mjs`: site screenshots go to `web/shots/` (`W/` below), layout data to `web/layout.json`.

Build: `make` and `make demo` are both up to date. Warnings are only the known `gfx.c:97/114 w110` and, in the demo build, `main.c:609-612 w126`. Code size is 18.5 KB for the main ROM and 21.1 KB for the demo, out of 32 KB, so no banking is needed. VRAM: `T_PICK` = 238, after `T_BIG_23` = 237 and before `T_QR` = 240, so tiles don't clash. Note: running `make` re-copies `wallet.gb` to `web/public` (byte-identical) and the demo ROM to `~/Desktop`.

---

## P0

None. Signing still needs a full one-second hold of A over a screen the chip decoded.

## P1

**P1-1 (ROM). A double-tap of A on "I WROTE THEM" sets the PIN to 0000 without showing the PIN screen.**
- **Where:** `main.c:770-794` (`pin_entry` never flushes the input queue), called from `main.c:1005`.
- **Repro:** `drive.mts`. On the words screen, press A twice about 6 frames apart. The second A is queued during the fade, and `pin_entry` returns it at once, so `SET_PIN 0000` is sent. Check: `SET_PIN` calls = 1 and state = unlocked. Shot `R/02-after-double-A-on-words.png` lands straight on "Pair your phone!".
- **Same path after restore:** an extra A pressed on the 12th word, during "Checking words" (`main.c:965-973`), does the same thing.
- **Impact:** the user never picks a PIN. Anyone who finds the cartridge can unlock it with 0000.
- **Fix:**
  - In `pin_entry`, after `screen_end()`, wait until `held_keys == 0`, then call `flush_input()`.
  - Also add the PIN confirmation step (see P2-9 below).

**P1-2 (ROM). Mashing A on the PIN screen wipes the cartridge in about 2 seconds.**
- **Where:**
  - `main.c:1012-1034`: `unlock()`.
  - `main.c:530-533`: `wait_a` flushes *before* it waits, but `pin_entry` doesn't flush.
- **Repro:** `mash.mts`, with PIN 1200 stored. From the locked PIN screen, tap A repeatedly:
  - 4-frame gap: 21 presses, 2.1 s.
  - 8-frame gap: 13 presses, 2.2 s.
  - 14-frame gap: 9 presses, 2.4 s.
  
  Each time: 5 UNLOCK calls with 0000, and `state=none`. Shot: `R/30-mash-A-gap14.png`.
- **Why:** each "Wrong PIN, TRY AGAIN" A is followed by an A that is queued during the PIN screen's fade. That queued A submits 0000 again.
- **Impact:** a child, or someone fidgeting, erases the keys. This is the "5 tries, then wipe" promise the site makes, triggered by accident.
- **Fix:**
  - Flush the queue and wait for release in `pin_entry` (the same fix as P1-1).
  - Ignore A until the screen has been up for about 300 ms.
  - Before the last try, show "LAST TRY: A WRONG PIN ERASES THE KEYS", and require B or a hold to go on.

**P1-3 (web). Phones scroll sideways, and the menu button sits off-screen.**
- **Where:** `web/src/site/ui/comparison.tsx:34`. The `sr-only` "Yes"/"No" spans are `position:absolute`, and their containing block is `section.compare` (`position:relative`). That isn't the `overflow-x-auto` wrapper, so they escape its clip.
- **Measured:** document `scrollWidth` is 614 at 390 and 360, and 615 at 430. Hiding `.compare` brings it back to the viewport width.
- **Effect in mobile emulation:** the layout viewport grows to 614, the fixed nav stretches with it, and `.menu-btn` ends up at x=560. It is invisible in `W/430x739-landing-top.png`, `W/390x844-landing-top.png` and `W/360x780-landing-top.png`.
- **Fix:** add `relative` to the comparison's `overflow-x-auto` div (or to each `td`). Optionally add `overflow-x: clip` on `.kb`.

**P1-4 (web). Still open from audit 3:**
- **A off-screen on /demo:** `.device-stage` is still sized from the height. Measured A tap zones:
  - 390x844: x 375-441;
  - 360x780: x 340-399.
  
  This is now on iPhone widths too, not only Android. Shots: `W/390x844-demo-top.png`, `W/360x780-demo-top.png`. Fix as in audit 3: size the stage from the width and cap it by the height.
- **"Known limits" hidden under the receipt:** `landing.css:547-551` and `864-874`. Both elements are still on grid row 1, and the limits box sits inside the receipt's rectangle at 360, 390, 430, 768 and 1024p. Shots: `W/390x844-landing-limits.png`, `W/768-landing-limits.png`, `W/ipad1024p-landing-limits.png`. Fix: in the mobile/portrait query, set `.limits { grid-row: 2 }`.
- **No menu at 1024 portrait:** `kb.css:379` still shows `.menu-btn` only at `max-width:860px`. At 1024x1366 only "Live demo" is reachable (`W/ipad1024p-landing-top.png`). Fix: add `, (max-aspect-ratio: 799/1000)` to that query.
- **Hero H1 over the console at 430x739:** the H1 starts at y=455, inside the console's lower body (`W/430x739-landing-top.png`). The same happens slightly at 360x780.
- **Reduced motion:** `landing.css:891` comes before the phone block at `922`, which sets `height:470vh` again. Under reduced motion, phones still scroll through about 3,000 px of stage with no captions.
- **Copy:**
  - `Landing.tsx:27` says **SE050C**. ROADMAP's decision is **SE050E2**, the BOM says "NXP SE050", and `hardware.md:13,34` and `PRODUCT.md:39` say SE050C.
  - `Landing.tsx:597-598` says "signs real transactions on Solana, Ethereum, …". It still doesn't say testnets.
  - "5 TRIES, THEN WIPE" vs. the SE050 auth object, which locks rather than erases, is still unresolved.
- **Meta:** `index.html:9-12`: `og:url`, `og:image` and `twitter:image` still point at `kagiboy.vercel.app`. There's no canonical link and no per-route meta.

## P2

### ROM

| # | Where | Repro / shot | Issue | Fix |
|---|---|---|---|---|
| 1 | `main.c:1196-1229` `tx_result` | `R/17..19` | When the phone never reports, the screen can't be left for 60 s: A, B, START and SELECT are ignored. It then says "STILL CONFIRMING" although the state is only SIGNED. If TXSTATUS times out (10 s per call), the 120-tick limit stretches to about 20 minutes | Accept B or A after about 3 s ("DONE, CHECK YOUR PHONE"). Base the limit on `sys_time` |
| 2 | `main.c:1288-1295` | `R/13-evm-long-amount.png`, `R/14-evm-5-wei.png`, `R/15-swap-long.png` | Amounts still wrap every 18 columns. The swap case splits the unit too: `123456789.012345 U` / `SDC` | Have the chip cap amounts at 14 big columns plus the unit, or break at the space and mark the continuation |
| 3 | `main.c:1085-1088` | `R/11-home-big-balance.png` | The chip allows 18-character balances, but the ROM caps the unit position at width 11. `12345678.9000 SOL` draws the unit over the last digits | Make the chip's `balanceText` cut at 11 digit columns, or switch the ROM to the small font when `w > 11` |
| 4 | `main.c:1012-1034` | `R/25`, `R/26` | Status 3 ("no wallet") during unlock still shows "Wrong PIN, 0 TRIES LEFT" in an endless loop | `if (st == 3) return 0;` so the main loop pings again |
| 5 | `main.c:1006-1008` | code | `SET_PIN` status ≠ 0 is still ignored; only a timeout is fatal | Show an error and go back to `start_menu` |
| 6 | `main.c:1005` | code | There's still no PIN confirmation, which makes P1-1 worse | Ask "Repeat PIN" and compare before `SET_PIN` |
| 7 | `main.c:1606` | code | After `menu()`, `home_redraw(paired)` still uses the stale value | `paired = PHONE_PAIRED();` before the redraw |
| 8 | `main.c:1430-1432` | `R/12-phone-paired-longname.png` | Phone screen footer: `A NEW`, `SEL FORGET`, `B BACK` run together with no gaps ("FORGET" touches the B icon) | `hint(0,…,"NEW")`, `hint(5,…,"FORGET")` → move B to col 15, or shorten to "FORGET" / "BACK" on 2 rows |
| 9 | `main.c:694-732` | code | The shake screen has no way out. If the accelerometer reads constant values (failed part, or a real-hardware bring-up), setup is stuck forever | After about 20 s, offer "B: SKIP, USE CHIP RANDOMNESS" |
| 10 | demo build, `main.c:546`, `323-326`, `361` | code | Still open from audit 3 P2-11: after a refusal the pretend phone asks again every 4 s; `CMD_LOCK` doesn't clear `demo_pairing`; `REQ_KIND` puts pairing first. Fixed: the START-hold is now gated on `!demo_phone_gone` (`main.c:541`) | Clear `demo_pairing` in LOCK; after one refusal, stop asking until the window is reopened |
| 11 | `main.c:12`, `protocol.md:9-12` | info | The mailbox is hard-wired at `0xD800`, in work RAM. A real cartridge can't drive reads there. It needs `0xA000` and `ENABLE_RAM`, which also clashes with the demo build's SRAM save at `0xA000` | Plan a `MB` base switch and move the demo save to a separate SRAM offset |
| 12 | `main.c:941-944` | info | The real ROM's restore warning says "THIS DEMO". That's right for the web; it will need different text on shipped hardware | Gate it behind a build flag later |

### Web

| # | Page / viewport | Shot | Issue | Fix |
|---|---|---|---|---|
| 13 | all | axe | The focus ring is still `#8fb2ff` (about 2.1:1 on white). Confirmed on every tab stop of /, /about and /demo | Use a darker ring (#3b6fe0) |
| 14 | /, /about, /demo | axe | No `<main>` landmark on any page. /demo also has a duplicate or ambiguous banner (`.demo-intro`) | Wrap the content in `<main>`; make `.demo-intro` a plain `div` |
| 15 | / | axe | Contrast: `.ghost-slip` second line 3.77:1; BOM `.faint` 3.11:1; /demo `li` 3.83:1 (#808289) | Darken to about #5d6070 |
| 16 | / | axe | `.strip` uses `role="listitem"` on a `figure` (aria-allowed-role) | Use a `ul`/`li` with the `figure` inside |
| 17 | /demo 1024p | `W/ipad1024p-demo-top.png` | The "Switch on" button inside the NEXT pill still wraps onto 2 lines | `white-space: nowrap` |
| 18 | /demo 768 | `W/768-demo-top.png` | The Game Boy renders at about 70 px wide above a full-size phone. The ROM, which is the whole point, is the smallest thing on screen | At 768-1100 portrait, size the console from the width (about 60vw) |
| 19 | /demo copy | `BusMonitor.tsx:11` | "through the mailbox at 0xD800" is true for the demo, but the landing and docs say the cartridge maps it at 0xA000 | Add "(0xA000 on the real cartridge)" |

---

## Previous findings status

| Item | Status |
|---|---|
| audit-3 ROM P2-9a: unlock status 3 loops | **Open** (P2-4, shots `R/25-26`) |
| audit-3 ROM P2-9b: `SET_PIN` status ignored | **Open** (P2-5) |
| audit-3 ROM P2-9c: no PIN confirmation | **Open** (P2-6), and now worse because of P1-1 |
| audit-3 P2-5: mnemonic left in the mailbox | **Open, all 12 words**. After setup, `0xD844..` still holds `guard,defense,oval,…,snake` (`results.txt`). `chip.ts:394-398` `writeReply` still writes only `n` bytes. Fix: zero `RESP[n..170]` on every reply |
| audit-3 P2-8: amounts wrap mid-number | **Open** (P2-2). Swaps also split the unit |
| audit-3 P2-10: stale `paired` after menu | **Open** (P2-7) |
| audit-3 P2-11: demo ROM differences | **Partly fixed** (START gate). The rest is open (P2-10) |
| audit-3 P1-1: pairing takeover | **Fixed** (`chip.ts:208` refuses a second pairing; `PAIR 1` checks the code) |
| audit-3 P1-2: forget keeps the pending request | **Fixed** (`chip.ts:514`; `SIGN` refuses when `!paired`) |
| audit-3 P2-1, P2-2: DEMO/CONFIRMED relabel, status wipe | **Fixed**: P2-1 by `chip.ts:284-285`; P2-2 by `chip.ts:312`, since status now keys on the request id |
| audit-3 P2-3: window stays open | **Fixed** (`pairWindowUntil = 0` on PAIR, LOCK, reset and forget) |
| audit-3 P2-6: EVM zero fee / no chainId | **Fixed** (`chip.ts:713-714`) |
| UI P0-1: /demo A off-screen | **Open** (P1-4); now also at 390 and 360 |
| UI P0-2: Known limits hidden on phones | **Open** (P1-4) |
| UI P1-1: no menu at iPad 1024 portrait | **Open** (P1-4) |
| UI P1-3: hero overlaps console at 430x739 | **Open** (P1-4) |
| UI P1-6: reduced motion on phones | **Open** (P1-4) |
| UI P1-7: SE050C vs SE050E2, "real transactions", "wipe" | **Open** (P1-4) |
| UI P1-8: og:url/og:image not kagiboy.xyz | **Open** (`index.html:9-12`) |
| UI P2-1: "Switch on" wraps | **Open** at 1024p (P2-17) |
| UI P2-10: focus ring contrast | **Open** (P2-13) |
| UI P2-11: no `<main>` | **Open** (P2-14) |

## Looks good
- The swap box "GET AT LEAST / amount / ON chain" fits in 3×16, and the demo result shows "DEMO / SWAPS GO LIVE WITH THE CARTRIDGE" (`R/15`, `R/16`).
- The pairing flow is clean: window, countdown, code and accept (`R/06-08`). Phone names are cleaned to 14 characters.
- The menu, wipe confirm (SELECT+A) and receive QR screens all fit 20×18.
- The testnet honesty lines are present on /demo, in KagiApp ("Live mainnet quotes… doesn't send the swap", "never restore a real recovery phrase here") and in the footers.
- No console errors on any route or viewport.
