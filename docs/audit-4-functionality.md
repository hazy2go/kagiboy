# Audit 4: end-to-end functionality

Date: 2026-10-08. Read-only on source. Started at commit `4bb2f92`. Three commits landed while the audit ran (`a25fd84`, `4138752`, `5bda90a`, then `c0c5c2f`). I re-ran the checks and the main flows against `c0c5c2f`.
Scratch, scripts and screenshots: `/Users/hazy/.claude/jobs/d7a54b92/tmp/audit4-func/`. Screenshots are in `shots/`. `lcd-*.png` files are the emulator's own 160x144 frames, and `montage-*.png` files put them side by side.

How I tested: a Vite dev server on :5301, plus the `dist/` build served on :5302 with the `vercel.json` headers (CSP included), driven by headless Chrome 154 through puppeteer-core. Every flow was driven the way a user would: keyboard on desktop (arrows, X/Z, Enter, Shift), touch taps on the projected Game Boy zones on phones, and clicks/taps on the phone app. I only read `window.__session` to check state, never to drive the flow. The one exception: I gave the phone a fake balance so that a send could reach the Game Boy. Viewports were 1440x900, 390x844 and 360x780.

Note on timing: headless swiftshader runs the emulator at 14-20 fps instead of 60. The harness waits in emulated frames, so it doesn't mistake slowness for bugs. Every failure listed below was reproduced and has a cause in the code.

## Build checks (at HEAD `c0c5c2f`)

| Check | Result |
|---|---|
| `pnpm exec tsc -b` | pass, 0 errors |
| `pnpm build` | pass. Chunk-size warnings only: `dist-*.js` (SODAX SDK) is 4.0 MB / 1.0 MB gzip and loads lazily on Swap; `scene` is 650 kB; `index` is 589 kB |
| `pnpm lint` (oxlint) | exit 0, 27 warnings and no errors. Most are `react(set-state-in-effect)`, `react(immutability)` and `react(refs)` in DemoPage, GameBoyShell, KagiApp and accordion |
| `pnpm smoke` | all checks passed (`smoke2.log`, PNGs in `smoke2/`). Also passed at the start commit (`smoke.log`) |

## Findings

### P0

None. Every user-facing flow completes on desktop, 390 and 360.

### P1

**P1-1. Phone landing page scrolled sideways and the menu button was off-screen. Fixed in `4138752` while this audit ran.**
- Where: `web/src/site/ui/comparison.tsx:33`. The table wrapper had `overflow-x-auto` but no positioning. The `sr-only` "Yes"/"No" spans are `position:absolute`, so they escaped the scroller and widened the document to 614 px.
- Effect at 390 and 360 wide: `innerWidth` became 614. The fixed nav stretched with it and pushed the hamburger to x=560, outside a 390 px screen. Puppeteer reported the menu button and the waitlist button as "not clickable", and the page panned sideways.
- Evidence: `shots/m390-01-landing.png` (no hamburger), `probe2.mjs`/`probe6.mjs` output, `pages-results.json` (`landingOverflow.over: 224`).
- Fix: `relative` on the wrapper, now in `4138752`. I re-checked at HEAD: overflow is 0 at 390 and 360, in both dev and prod builds.
- Suggestion: add an overflow assertion at 360 px to CI or the smoke run so this doesn't come back.

### P2

**P2-1. Tapping "Pair cartridge" right after turning a phone away shows the wrong instruction.**
- Where: `web/src/chip/chip.ts:201-207` (refuses whenever the window is closed), `chip.ts:495-498` (a pairing answer closes the window), `rom/src/main.c:1293-1297` (shows "Not paired" for 90 frames before `home()` reopens the window), `web/src/phone/phone.ts:99-112`.
- Repro: pair, press B on the Game Boy, then tap "Pair cartridge" again within about 1.5 s. Every run, at every viewport, the phone says *"Go back to the Game Boy's home screen, where it says 'Pair your phone!'"*. A moment later the Game Boy shows exactly that screen. A second tap works.
- Evidence: `demo-*-steps.json` step "immediate retry after refusal works", `shots/demo-d1440-11-retry-too-soon.png`.
- Fix: while the chip is unlocked and unpaired, have `Phone.pair()` wait up to about 3 s for `pairWindowOpen` before failing. Alternatively, leave the window open after a refusal when nothing is paired.

**P2-2. A sign request lands behind the last send's "Transaction failed / A DONE" screen.**
- Where: `rom/src/main.c:1274-1275`. `tx_result()` ends in `wait_a()`, which, unlike `receive()`, doesn't check `request_waiting()`.
- Repro: send from a fresh wallet. Broadcast fails with "NOT ENOUGH FUNDS", which is the normal case for new testnet users. Then start a swap. The phone and the NEXT banner say "hold A to sign", but the Game Boy still shows the old failure. Holding A only dismisses it. You then have to release A and hold it again on the approval screen. This happened on desktop and on 390.
- Evidence: `shots/montage-m390-swap.png` and `shots/montage-d1440-4.png` (`26-swap-request` = old failure screen, `27` = approval screen).
- Fix: use `wait_press_or_request()` in the final wait of `tx_result`. When it returns 0, return to `home()`, which already routes the request.

**P2-3. A pairing that lapses after 60 s is shown as "turned down" (from the code; the live run was cut short).**
- Where: `chip.ts:217-219` and `dropPairing()` resolve `false`. `phone.ts:110` sets `"refused"` with no `pairError`, so `KagiApp.tsx:239` shows "Pairing was turned down on the Game Boy." Meanwhile the Game Boy keeps showing the stale code until a key is pressed, and then answers "Expired".
- Status: the 60 s live run in headless Chrome stalled and I stopped it, so this finding rests on reading the code.
- Fix: resolve the lapse with a reason, for example a `"timeout"` string, and show "The code expired. Tap Pair cartridge to get a new one."

**P2-4. After back navigation into the middle of the landing stage, the 3D model and chapter copy are out of sync with the scroll position (phones).**
- Where: `web/src/landing/Landing.tsx:240-245`. `ScrollTrigger.create({ onUpdate })` only fires on scroll. When the browser restores a mid-stage scroll position, `scene.setProgress` is never called with the initial progress.
- Repro (390): scroll to y≈2700 (the "Hold A to sign." card), go to /about, then back. The model shows the wrong pose and no chapter copy (the `ch-apart` chapter sits at opacity 0.18). Scrolling 10 px fixes it.
- Evidence: `shots/nav-m390-B0-mid.png` (before) and `nav-m390-B2-back.png` / `nav2-m390-after-back.png` (after), plus the `nav2.mjs` output.
- Fix: after creating the trigger, call `scene.setProgress(st.progress)`. A `ScrollTrigger.refresh()` once the model loads would also work.
- Desktop and the hero itself were not affected. Hero buttons are clickable after every back/forward combination, and I saw no green screen.

**P2-5. Swap result copy reads "for at least 1.107124+ SOL".**
- Where: `KagiApp.tsx:507` already puts "+" on `rec.buy`, and `:520` wraps it in "for at least …".
- Evidence: `shots/demo-a360-27-swap-signed.png`.
- Fix: drop one of the two.

**P2-6. Flipping the pair keeps the old number, now in the new sell token.**
- Where: `KagiApp.tsx:548-552`.
- Repro: 1 SOL→USDC, then flip. The swap becomes 1 USDC→SOL, SODAX returns HTTP 400, and the page shows "Try a different amount." The 400 also appears as a console error.
- Fix: on flip, carry the quoted output (`outText`) over as the new amount.

**P2-7. The mobile demo `.panes` strip can be scrolled out of alignment by code.**
- Where: `web/src/demo/demo.css:929-932` uses `overflow: hidden`, which can still be scrolled programmatically.
- What happened: a `scrollIntoView()` during the tab transition left `.panes.scrollLeft = 129`. Half the wallet and half the Bus pane showed, and taps missed. Puppeteer triggered it in my run. Users are unlikely to hit it, but any future `focus()` or `scrollIntoView` would cause the same thing.
- Evidence: `shots/demo-m390-16-send-sheet.png` from the earlier run, plus the `SL after-click-send [129,…]` trace.
- Fix: use `overflow: clip`.

**P2-8. The Game Boy D-pad tap zones are small on phones.**
- Measured: 22-26 px wide at 360/390, even with the 1.4x coarse-pointer growth. A, B, Start and Select are 40-44 px.
- Where: `GameBoyShell.tsx:36-46, 92`.
- Note: they do work. Mashing, PIN entry and network LEFT/RIGHT all succeeded by touch.
- Fix: make the minimum 44 px for each arm, or widen the D-pad zones on coarse pointers.

**P2-9. The gallery lightbox has no dialog semantics.**
- Where: `web/src/site/ui/masonry-lightbox.tsx:115-128`. There is no `role="dialog"` or `aria-modal`, focus doesn't move to the close button, and focus doesn't return to the tile afterwards.
- What does work: open, Escape, the close button and backdrop clicks, at all three sizes. The body scroll lock is restored.

**P2-10. "Unpair this phone" acts with no confirmation.**
- Where: `KagiApp.tsx:818-820`. Getting back requires walking to the Game Boy. The Game Boy's own "Forget phone?" asks first.

**P2-11. Small polish items.**
- `app/ui/segmented-control.tsx:141`: the class `text-foreground0` is a typo, so unselected labels get no colour class.
- `Waitlist.tsx:31`: an empty email shows "That email doesn't look right." "Enter your email" would read better.
- On 390x844, with the quote details open, "Review on Game Boy" sits below the two stacked bottom bars (the app tab bar plus the demo tab bar). It can still be reached by scrolling, but it isn't obvious. Consider collapsing the details by default on phones, or making the CTA sticky.
- Development-only console noise: motion's "Reduced Motion enabled" warning, three's `KHR_parallel_shader_compile` warning, and swiftshader GPU-stall messages.

## What passed

- **Landing** at 1440, 390 and 360:
  - The hero buttons render and receive taps. Initial-load `elementFromPoint` checks pass.
  - The hamburger opens, Escape closes it, and the scroll lock is released.
  - Waitlist validation works for empty and malformed input.
  - A valid address goes to local `/api/waitlist`. The dev server has no API, so it gets a 404, and the page handles it gracefully: "Couldn't save that. Try again in a minute." No emails were sent to production.
- **Navigation:**
  - landing→demo→back, landing→about→back, forward/back again, and the demo logo link to home all keep the scroll position.
  - After every one of these, the hero is clickable, nothing is locked and there is no overflow.
  - Leaving and returning to the demo keeps the emulator powered, with the LCD drawn (no green screen).
- **/demo, full flow:**
  - Switch on (from the phone app or the Game Boy).
  - Wallet creation: START, New wallet, mash 40/40, Hold to shake, 12 words, PIN 1200, then confirming the PIN.
  - "Pair your phone!" screen, then pairing with a matching 6-digit code on both screens. B refuses, A accepts. On phones the app switches to the Game Boy tab by itself and the Wallet tab shows a "Pair" badge.
  - Balances load from devnet/testnet RPCs.
  - Faucet links work (correct href, `target=_blank`, `rel=noreferrer`).
  - Network RIGHT/LEFT on the Game Boy goes Ethereum→Base→Robinhood→Ethereum, and the phone follows. The network sheet on the phone switches too.
  - Receive: the sheet shows a QR code, Copy address puts the right address on the clipboard, and the Game Boy shows its own QR code.
  - Send validation catches a bad address, zero, and an amount above the balance.
  - Send: the request reaches the Game Boy. B rejects it ("Cancelled"). Holding A signs it, and the phone then reports the broadcast result ("Failed: not enough funds").
  - Swap:
    - The live SODAX quote loads (about 115 USDC per SOL).
    - Flip re-quotes, and the token picker opens, searches and filters by chain.
    - The quote details expand.
    - The Game Boy shows "Approve? SWAP ETHEREUM" with the minimum receive. A signs, giving "Signed on your Game Boy" and the DEMO screen on the Game Boy. B gives "Not signed".
  - Activity lists sends and swaps with the right states, and the detail sheet opens.
  - Cartridge tab: the sound toggle persists (`kagiboy.muted`) and stays in sync with the Game Boy's sound label.
  - SELECT→Phone on the Game Boy shows the paired phone. "Pair new phone" opens a 60 s listening window and B closes it. SELECT forgets the phone after a confirmation, and the app drops back to the Pair screen.
  - Unpairing from the phone puts the Game Boy back to listening, and re-pairing works without touching menus.
  - Switch off, Switch on, then locked → unlock with the PIN works.
- **/about:** the pixel game canvas (160x144) animates, the gallery has 6 tiles, and the lightbox opens and closes. No overflow.
- **404 page** renders.
- **Reduced motion:** the landing is static and shows the full hero, the buttons work, and there is no overflow at any size.
- **Prod build under the `vercel.json` CSP:** `/`, `/about` and `/demo` (switch on, boot) produced zero `securitypolicyviolation` events. Every host the app or SDK calls is in `connect-src` (`api.sodax.com` and all the RPCs).
- **Console:** no page errors and no failed requests on any flow, except the expected SODAX 400 for a too-small amount and the dev-only `/api/waitlist` 404.
