# kagiboy functionality audit (2026-10-07)

**What was run:** `tsc -b`, `pnpm build`, `pnpm lint` (8 warnings) and `pnpm smoke` (all checks pass). On top of that, three extra headless ROM scripts covered menu, lock, menu wipe, restore back-out, bad checksum, a request arriving while the Game Boy is on another screen, and partial holds. Chrome ran the desktop demo and landing at 1440x900 and 800px. WebKit iPhone 15 Pro Max ran the touch-only flow: setup, PIN entry by taps, wrong PIN, unlock, auto-switch to the Game Boy tab, hold A by touch and the "not enough funds" failure. Scripts and screenshots are in `scratchpad/audit-fn/`. No airdrop was requested.

**Works well:** every main ROM flow, the QR codes for both chains (they scan back), the 5-wrong-PIN wipe, restore from a BIP-39 vector, data surviving a power cycle, and power-off mid-request (resolves as rejected). Most phone validation works: bad or wrong-chain addresses, 0, -1, 1e3, too many decimals, comma decimals, more than the balance, and double-submit (only one request goes out). The mobile tabs, the GB-tab dot, a PIN entered purely by taps, and copy and QR also work. There is no horizontal overflow on any tab or on the landing at 390px. The floating CTA, the anchor links (Lenis) and every waitlist state work: empty, bad email, the 404 locally, a 503 that shows "The waitlist isn't open yet.", and success. No console errors. Heap stays flat over 6 round trips between `/` and `/demo`.

---

## P0: blocks the judging demo

**P0-1. Opening `/demo` directly will probably 404 on Vercel.** There is no `vercel.json` anywhere, and Vite's preset doesn't add a fallback for client-side routes. A judge clicking a shared `/demo` link, or anyone refreshing the page, would get a 404. (Unverified: confirm on the first preview deploy.)
- Fix: add `web/vercel.json` with `{"rewrites":[{"source":"/((?!api/).*)","destination":"/index.html"}]}`. Deploy with root directory `web/`.

## P1: visible bugs

**P1-1. A sign request is invisible while the Game Boy is on the Receive/QR screen or the menu.** `receive()` (`rom/src/main.c:680`) and `menu()` (`:830`) never check `MB_PENDING`; only `home()` does (`:880`). The NEXT hint tells people to "press A on the Game Boy to show your QR code", and the phone then says "Hold A to sign". Holding A on the QR screen does nothing. The QR view has no on-screen "B back" hint, so people get stuck.
- Repro: unlock, press A (QR), send from the phone. The phone says "Check your Game Boy" while the Game Boy stays on the QR code. Holding A has no effect; you have to press B.
- Fix: in the `wait_press` loops of `receive()` and `menu()`, return when `MB[MB_PENDING]` is set (for example, `wait_press_or_pending()`). Add a small "B" mark on the QR screen outside the quiet zone, or a phone hint saying "press B to go back".

**P1-2. Wiping from the menu skips the Welcome screen and lands in "Make your keys".** The SELECT and A presses used to confirm the wipe are read from `held_keys` (`main.c:861`) but also stay in the press queue. The next `start_menu()` takes that A as "New wallet". The user never sees "Restore" and gets no "wiped" message.
- Repro: Menu → Wipe cartridge → SELECT+A. You land on "Make your keys STEP 1 OF 3".
- Fix: call `flush_input()` before returning 2 (and at the top of `start_menu()`), and show a "Cartridge wiped" message with `wait_a()`.

**P1-3. After visiting `/demo`, the emulator and balance polling keep running on the landing page.** `session` is a module-level singleton, and nothing pauses it when `GameBoyShell` unmounts (`demo/session.ts:180`, `:111`). Measured: 180 frames in 3 s, plus Solana and Sepolia RPC requests every 15 s, while sitting on `/`. The landing's own attract emulator runs at the same time, so two Game Boys run at once.
- Fix: add `session.suspend()`/`resume()`, which cancels the animation frame and clears the balance timer, and call it from the `GameBoyShell` effect cleanup and mount. The alternative is powering off on unmount.

## P2: polish

**ROM**
- **Restore letter picker:** the pending letter is drawn after the prefix with no marker whenever there are suggestions (`main.c:513-514`). Typing "z" shows "za" above "zebra/zero"; the smoke screenshot reads "legaa". Fix: draw the pending letter with the marker always, or in grey.
- **Restore hint:** with letters typed and no match, the hint shows the B icon with "L DELETE" (`main.c:500`), but B does nothing there. Fix: use a LEFT glyph.
- **Restore back-out:** pressing B on an empty word throws away every word entered so far (`main.c:537`, `:545`). Fix: make B go back one word when `n > 0`.
- **Wipe cancel:** B on "Wipe cartridge?" also leaves the menu, because the queued B is read again (`main.c:866`). Fix: `flush_input()` after the break.
- **Wrong-PIN text:** reads "1 TRIES LEFT" (`main.c:594`).
- **Step numbering:** after a restore, the PIN screen says "STEP 3 OF 3" (`main.c:573`), but no steps 1 and 2 were shown.
- **Word subtitle:** "WORD 1  OF 12" has a double space (`main.c:473`).
- **Failure screen:** a failed transaction still shows the check icon and "Signed / SENT TO YOUR PHONE" above FAILED (`main.c:713`). Fix: redraw the title and icon on FAILED/UNKNOWN.
- **No backup check:** the new-wallet flow never asks the user to confirm any of the 12 words. A judge may ask about this. Fix: add a one-word quiz, or state on the landing that it's out of scope for the demo.

**Phone app**
- **Wrong label after power-off or lock:** the activity reads "Rejected on Game Boy" (`PhoneApp.tsx:218`, `phone.ts:247`). Fix: add a separate "cancelled" state.
- **Button stuck on "Preparing…":** the send button shows a disabled "Preparing…" for the whole broadcast and confirm wait, because `sending` is only cleared in the `finally` (`phone.ts:111`, `:132`). `waitForTransactionReceipt` has no timeout (`phone.ts:230`), so an ETH transaction that is dropped locks the form forever. Fix: clear `sending` once the request resolves, and pass `{ timeout: 120_000 }` so it ends in "unknown".
- **Balance check ignores the fee:** sending your whole balance passes the check and then fails on-chain (`phone.ts:107`). Fix: subtract 5000 lamports, or `21000 * maxFeePerGas`.
- **Wrong reason for small SOL sends:** a send below rent-exemption to a new account maps "insufficient funds for rent" to "Not enough funds…" (`phone.ts:284`).
- **Truncated Solana addresses pass:** a 43-character truncation can still decode to a valid 32-byte key and be accepted. The Game Boy shows the full address, so this is acceptable, but consider warning about the System Program address and your own address.
- **Keyboard trap on `/demo`:** the global keydown handler calls `preventDefault` for Enter and the arrow keys on anything that isn't an input (`GameBoyShell.tsx:142`). Pressing Enter on a focused link or button sends START instead of activating it, and the arrow keys can't scroll the desktop page. Fix: also skip when the target is `A`, `BUTTON` or `SELECT`.
- **Silent "Switch on" failure:** if fetching `/wallet.gb` fails, the rejection is unhandled and nothing happens on screen (`session.ts:96`). A double tap can also start two Game Boys. Fix: guard with a `booting` flag.

**Landing / site**
- **Scroll stays locked after the menu:** the menu's `overflow: hidden` is never cleared when you navigate away (`Landing.tsx:98`). Opening the menu, then "Try the live demo", leaves `/demo` unable to scroll at 761-860px (verified at 800px). Phones at 760px or narrower aren't affected. Fix: reset the overflow in the effect cleanup.
- **Menu always exposed as a dialog:** `hidden={!menu && undefined}` is always `undefined` (`Landing.tsx:280`), so `aria-modal="true"` stays on the closed menu. Fix: use `hidden={!menu}`, or `inert`.
- **Late write to a disposed scene:** if you leave the page while the attract mode is loading, `scene.setScreen` runs on a disposed scene (`Landing.tsx:207`). Fix: check `disposed` after the `await`. Also, `scene.dispose()` doesn't free the GLB's geometries, materials or textures, or force context loss (`scene.ts:275`).
- **Waitlist API:** `HGET`→`INCR`→`HSET` is not atomic, so two parallel sign-ups with the same email get two numbers. There is no rate limit, so anyone can inflate the count (`api/waitlist.ts:33`). Fix: `HSETNX`, or a Lua script, plus an IP limit.
- **Weight:**
  - The GLB is 2.7 MB of uncompressed geometry, 1.7 MB gzipped (`public/3d/kagiboy.glb`). meshopt or Draco through gltf-transform should get it under 500 kB.
  - On desktop, the landing also loads the `gameboy` chunk (598 kB raw, 164 kB gz), which includes `@solana/web3.js` and viem, only for the attract mode.
  - Entry JS is 137 kB gz (the TODO says 83 kB, so it's out of date).
  - Two chunks are over 500 kB.
  - LCP is fine locally (232 ms).
- **Dead code and lint:**
  - `CHAIN_CODE` is never used (`chip/protocol.ts`).
  - `web/README.md` is still the Vite template.
  - Lint warnings: `Landing.tsx:80` (a ternary used as a statement), set-state-in-effect at `DemoPage.tsx:101/112`, and refs or mutation during render at `GameBoyShell.tsx:50/107/170`.
- **Not verified:** the iOS software keyboard can't be simulated. Inputs are 16px (no zoom), and the send button scrolls clear of the tab bar (654 vs 675 px), but check on a real iPhone that the fixed tab bar doesn't cover the Amount field.
