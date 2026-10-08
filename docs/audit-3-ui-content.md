# Audit 3: UI, visual, content and quality

Date 2026-10-08. Read-only. Tested on the preview at http://127.0.0.1:5200 (built `dist`) and on https://www.kagiboy.xyz. Every P0 and P1 below was re-checked on the live site and shows up there too.
Tools: Chrome headless (Metal ANGLE) at 320/375/430/768/820/1024/1280/1440/1920, WebKit with iPhone 15 Pro Max, iPhone SE (3rd gen) and iPad Pro 11, plus Chrome with Pixel 7 and Galaxy S24 profiles.
Screenshots are in `/private/tmp/claude-501/-Users-hazy/b648df4f-4071-4982-b6e9-ee85bb53598d/scratchpad/audit3-ui/shots/`. Below, `S/` is short for that folder.

No route scrolls sideways at any width (`scrollWidth == innerWidth` everywhere). No broken images, no console errors, and every `<img>` has an `alt`.

---

## P0: a judge will notice these in the first minute

### P0-1 · /demo on Android phones: the A button is off-screen
- **Where:** /demo on Chrome with the Pixel 7 (412 px) and Galaxy S24 (360 px) profiles. Chrome at 375/390/430 with a tall viewport does the same. Safari on iPhone is fine.
- **Screenshots:** `S/x-chromePixel7-demo.png`, `S/x-chromeGalaxyS24-demo.png`, `S/demo-430.png`. For comparison, Safari: `S/wk-iPhone15ProMax-demo.png`.
- **What's wrong:** `.pane-gb .device-stage` is `height:100%; width:auto; max-width:100%` with a 4/5 aspect ratio. In Chrome the width follows the height, so the stage comes out wider than the screen (16–543 px on a 412 px viewport) and `.pane-gb` crops it. The A tap zone sits at 372–437 px, past the 412 px edge. A is the button that signs, so the demo can't be finished. On Pixel 7 the "Switch on" button is also off-centre.
- **Fix:** size the stage from the width and cap it by the height. For example `.pane-gb .device-stage { width: min(100%, calc((100svh - var(--chrome)) * .8)); height: auto; aspect-ratio: 4/5; margin-inline: auto }`. Or give `.pane-gb .device` `grid-template-columns: minmax(0,1fr)` and `justify-items: center`. Re-test with the Pixel 7 profile.

### P0-2 · Landing: "Known limits" is hidden under the security receipt on phones and tablets
- **Where:** the landing #security section, at every width up to 860 px and on any portrait screen (375, 768, 820, 1024×1366).
- **Screenshots:** `S/limits-375.png`, `S/limits-1024.png`, `S/home-1024-security.png`.
- **What's wrong:** in the mobile media query `.receipt-wrap .receipt` and `.limits` both get `grid-column:1`. Both stay on `grid-row:1`, so they stack in the same cell. The receipt is 594 px tall and opaque, and `elementFromPoint` on the limits text returns the receipt. The honest part of the page (glitch attacks, a modded console can fake presses, keep test and real seeds apart, an outside review before sale) is invisible to every phone and tablet visitor.
- **Fix:** in `@media (max-width:860px), (max-aspect-ratio:799/1000)`, add `.limits { grid-row: 2; }` and set `.receipt-wrap .receipt { grid-row: 1 }` explicitly.

---

## P1

### P1-1 · Landing nav on a 1024 px portrait tablet has no menu
- **Where:** / at 1024×1366 (iPad Pro 12.9 portrait). It happens on any width from 861 px up when the screen is portrait.
- **Screenshot:** `S/home-1024-stage0.png`
- **What's wrong:** the portrait rule (`max-aspect-ratio:799/1000`) hides `.kb-links a`. But `.menu-btn` only appears at `max-width:860px`. Only "Live demo" is left, with no way to reach About, App, the sections or the waitlist.
- **Fix:** add the same `(max-aspect-ratio:799/1000)` condition to the `.menu-btn` rule in kb.css:374.

### P1-2 · Tablet portrait gets the phone layout scaled up
- **Where:** / at 768, 820 and 1024 portrait.
- **Screenshots:** `S/home-1024-stage0.png`, `S/home-1024-setup.png`, `S/sheet-home-768-b.png`
- **What's wrong:**
  - The hero copy sits at a 22 px gutter while the nav sits at 52 px, so the left edges don't line up.
  - The two CTAs stretch to about 480 px each.
  - About 250 px of empty space sits between the nav and the console.
  - The setup rail uses 66vw strips, so a single print is about 730 px wide and pixelated.
  - The exploded-cartridge image fills the whole width before you reach the BOM.
  - It reads as "phone, enlarged", which is the opposite of the brief.
- **Fix:** add a 768–1100 px portrait tier:
  - cap `.ch-hero` at about 640 px and use the nav gutter;
  - auto-width buttons;
  - `.rail { grid-auto-columns: min(66vw, 300px) }`;
  - put the inside grid in 2 columns.

### P1-3 · Hero headline overlaps the console on real iPhone viewports
- **Where:** / on WebKit iPhone 15 Pro Max (430×739 Safari viewport). Also at 320 px stage 28 ("Slide it in" sits across the console).
- **Screenshots:** `S/wk-iPhone15ProMax-home.png`, `S/home-320-stage28.png`
- **What's wrong:** the H1 "Your keys, in a Game Boy cartridge." runs across the bottom of the Game Boy and its speaker grille. Meanwhile about 150 px of empty space sits above the console. This is the first frame on a phone.
- **Fix:** on short phones (`max-height: 760px`), aim the camera higher and frame tighter (the TALL_KEYS path in scene.ts), or move `.ch-hero` lower and the console higher. Check at 430×739 and 375×667.

### P1-4 · "Hold A to sign" card covers the A button at 320 px
- **Where:** / at 320 px, stage 80%. At 375 the card covers the D-pad but A stays visible.
- **Screenshots:** `S/home-320-stage80.png`, `S/home-375-stage80.png`
- **What's wrong:** the chapter that says "hold A" hides A.
- **Fix:** at 320 to 375 px, pull the camera back a little for the sign chapter, or shrink the card (smaller type, no lede).

### P1-5 · /app: the tab bar is pushed off-screen on the Swap and Cartridge tabs
- **Where:** /app on iPhone 15 Pro Max and iPhone SE (WebKit).
- **Screenshots:** `S/b-webkitiPhoneSE3rdgen-2-Swap.png`, `S/b-webkitiPhoneSE3rdgen-2-Cartridge.png`
- **What's wrong:** `nav.app-tabs` is `position:fixed`, but it gets top 735–758 px against a 667–739 px viewport. It behaves like `absolute` inside a transformed ancestor (likely the `.tab-view` / `.app-view` enter animation leaves a `transform`). On the two longest tabs you can't switch tabs until you scroll to the bottom.
- **Fix:**
  - Render the tab bar outside the animated container, or leave `transform: none` (or `animation-fill-mode: none`) after the enter animation.
  - Pad the scroller's bottom by the tab bar's height.
- **Related, desktop:** the "Live mainnet quotes. This demo signs on the cartridge but doesn't send the swap." line sits under the tab bar (`S/b-chromedesk1440-2-Swap.png`). That line is the swap honesty statement and has to stay visible.

### P1-6 · Reduced motion on phones: about 3,000 px of 3D scroll with no text
- **Where:** / with `prefers-reduced-motion: reduce` at ≤860 px. iOS "Reduce Motion" turns this on.
- **Screenshots:** `S/home-375-rm-stage55.png`, `S/home-375-rm-stage80.png`
- **What's wrong:** the reduced-motion block sets `.stage {height:100svh}` and hides the non-hero chapters. The phone block comes later in the file and sets `.stage {height:470vh}` again. The visitor scrolls through the exploded and zoomed console with every caption hidden. On desktop it collapses to just the hero, so the chip list never appears there either.
- **Fix:** move the reduced-motion block after the phone queries, or raise its specificity. Under reduced motion, render the chip list (`.ch-apart .chip-list`) as a normal static section so the content survives.

### P1-7 · Copy: claims a judge could check
1. **"5 TRIES, THEN WIPE"** appears in three places: the landing receipt, the setup strip and its caption ("Five wrong tries and the chip erases the keys").
   - hardware.md says the SE050 erases.
   - ROADMAP.md specifies a "PIN auth object (max 5)" on the SE050E2. Auth objects with a max-attempts counter lock; they don't erase.
   - This is still open with hazy. Pick one: "5 tries, then locked", or say the firmware wipes the keys after the SE locks.
2. **Secure element model:** the landing callout says "SE050C", the BOM says "NXP SE050", hardware.md says SE050C, and ROADMAP's "Decision" says **SE050E2**. Use one name everywhere.
3. **"It signs real transactions on Solana, Ethereum, Base, Arbitrum, HyperEVM and Robinhood Chain."** (landing, "Go on, press Start"). Without "test" this reads like mainnet. Use "It signs real testnet transactions on…".
4. **The hero is in the present tense** ("Your keys live in a chip inside the cartridge"). That's fine for a product page, but the first honest status line is far down the page ("Where we're at") or in the 11 px footer. Consider a short line under the hero CTA, such as "Software live on testnets · cartridge in development". It would sit next to the existing "The screen runs the real Game Boy software."

### P1-8 · Meta and share tags are the same on every route and point at the old domain
- **Where:** index.html. Checked live: every route serves the same description.
- **What's wrong:**
  - `og:url` and `og:image` use `https://kagiboy.vercel.app/` instead of kagiboy.xyz.
  - There's no `<link rel=canonical>`.
  - /about, /demo and /app get the landing description and `og:title`. Only `document.title` changes, and crawlers don't run JS.
  - There's no `twitter:title` or `twitter:description`, and no `og:image:alt`.
  - The OG card says "SOLANA · ETHEREUM" while the site says six chains.
- **Fix:**
  - Switch the canonical and OG URLs to https://www.kagiboy.xyz.
  - Add per-route static HTML (Vite multi-page, or small `about/index.html` copies with their own meta). At minimum, set `<meta name=description>` from JS for the in-browser title.

---

## P2

| # | Page / viewport | Screenshot | Issue | Fix |
|---|---|---|---|---|
| 1 | /demo 320–430 (Chrome) | `S/demo-375.png` | "Switch on" in the NEXT pill wraps onto 2 lines, and a second "Switch on" sits under the console: two identical CTAs on one screen | `white-space:nowrap`; hide the pill's button on mobile |
| 2 | /demo phones | results JSON | On-screen Game Boy tap zones are below 44 px: D-pad 31–35 px, SELECT/START 35 px high (18–20 px at 320) | Let the invisible hit zones grow past the drawn button (`::after` inset −8 px) |
| 3 | / footer, origin link, logo (phones) | `S/home-375-kb-foot.png` | Footer links are 18 px tall, "Read the whole story" 26 px, logo 23 px | `padding-block:12px` on footer links; `min-height:44px` |
| 4 | /about 375 | `S/g-about-375b.png` | "Join the waitlist" wraps onto 2 lines inside the pill; the CTA "Press Start" doesn't match "Try the live demo" everywhere else | `white-space:nowrap` / stack the buttons; use one CTA label |
| 5 | /app 375 + desktop | `S/b-webkitiPhoneSE3rdgen-2-Swap.png`, `S/b-chromedesk1440-2-Swap.png` | "You get" amount is clipped mid-glyph ("115.05'", "114.94:") | Format to fewer decimals for large values, or shrink the font to fit |
| 6 | /app after unlock | `S/app-webkitiPhone15ProMax-2-wallet.png` | The Game Boy sheet stays open over the wallet after you unlock; it only auto-closes after a request | Auto-close about 1.2 s after the state goes from locked to unlocked, like after a signature |
| 7 | /app Cartridge tab | `S/b-webkitiPhoneSE3rdgen-2-Cartridge.png` | The cartridge render on the card is washed out (low-contrast white on a pastel gradient) | Use the `cart-hero.webp` render or add a darker backdrop |
| 8 | / setup rail, desktop | `S/rail-1440-5s.png` | 480 px pixel-art prints shown at about 150 px: the dot-matrix text blurs and shimmers | Show them at 1/2 or 1/3 size with `image-rendering: pixelated`, or export at the display size |
| 9 | / waitlist (all) | `S/home-1440-waitlist.png` | `#wl-msg` is #666c80 on #dbe9ff, 4.25:1 at 14 px (below AA 4.5) | Darken to `--kb-ink-2` (about #555b6e) |
| 10 | all | — | Focus ring `#8fb2ff` on white is about 2.1:1 (WCAG 2.2 focus asks for ≥3:1); `.swap-amt` and `.tok-find` set `outline:none` | Darker focus colour (#3b6fe0), and keep a visible ring on inputs |
| 11 | /, /about, /app | — | No `<main>` landmark (only /demo has one) | Wrap the page content in `<main>` |
| 12 | all | — | `/favicon.ico` and `/sitemap.xml` return the SPA HTML with status 200; `/nope` returns 200 (soft 404); no apple-touch-icon (the data-URI SVG favicon doesn't work as an iOS home-screen icon) | Add a real favicon.ico/png and a 180 px apple-touch-icon, a sitemap.xml, and exclude them from the rewrite |
| 13 | /about 1440 | `S/about-1440-gallery.png` | Gallery tiles are offset vertically by 20–28 px (293/321 px tops). It reads as uneven, not as a deliberate stagger | Align the tops, or make the stagger bigger so it looks intentional |
| 14 | /about | — | Gallery webps are 1120–1400 px wide but shown at 162–480 CSS px (812 KB for 6 images) | `srcset` with 480 and 960 px variants |
| 15 | / | — | Landing downloads `chip.js` (145 KB br) and `gameboy.js` for the attract loop, on top of the 920 KB GLB. JS is 492 KB br / 1.7 MB raw. LCP is fine (H1, 0.4–0.6 s), CLS is about 0 | Fine for judges on wifi. If you trim anything, defer the attract ROM until the stage is idle |
| 16 | / ↔ /about | — | /about uses British spelling ("colour", "favourite"); the rest of the site has no British-vs-American words, so this is the only spot that could look inconsistent. The landing says "My dad found it at a flea market", /about says "My dad bought it for me". Both can be true, but a quick reader may see a mismatch | Keep British spelling if that's hazy's voice. Join the two story lines, e.g. "My dad found it at a flea market and bought it for me" |
| 17 | Cartridge label render + OG | `public/renders/cart-exploded.webp`, `public/og.png` | The label reads "SOLANA · ETHEREUM" while the product claims Solana + 5 EVM | Fine as a "Solana + EVM" shorthand; consider "SOLANA · EVM" in the next render |
| 18 | /about | — | "magic" / "magical" twice in two paragraphs | Cut one |
| 19 | /demo, /app (Chrome emulation) | — | Swap mainnet quote vs devnet balance: you can quote 1 SOL with a 0.011 devnet balance and no "insufficient" hint | Fine for the demo; optionally prefill with the wallet balance, or show "quote only" next to the amount |

Dark mode (`prefers-color-scheme: dark`): no colour-scheme handling, so every page stays light. Nothing breaks: explicit backgrounds, inputs readable (`S/*-dark*.png`). Acceptable; optionally add `<meta name="color-scheme" content="light">` so iOS form controls don't flip.

---

## Looks good
- **Brand:** Funnel Display / Funnel Sans plus Pixel Operator are used the same way on the site, /about, /demo and /app. The pastel blue/pink/lavender "thermal print" system (receipts, slips, perforations) is consistent and reads as Apple-clean with personality.
- **3D story on desktop** (1280–1920): every chapter is legible. Callouts sit on their chips and stay inside the gutter. The sign slip hangs cleanly from the console (`S/home-1440-stage55.png`, `S/home-1440-stage97.png`).
- **Phones (375/430):** each chapter is re-staged (camera path and copy cards) rather than shrunk. The menu sheet is clean, with 44 px+ primary CTAs.
- **/about gallery:** real photos of the ROM on a DMG, with captions matching the screens. The copy is honest ("The keys in this test build live in the ROM's stand-in chip until the cartridge exists").
- **Swap:** live SODAX quotes work on the live site under the CSP. Fees show as "KAGIBOY 0.1%" and "SODAX 0.1%" and match swap.ts. "At least" plus 0.5% slippage are shown. The Game Boy review screen shows the amount, fee and minimum receive. 160 token logos load with none broken, and they're real (local webp from SODAX/Trust lists).
- **Paired /demo flow** (WebKit iPhone 15 Pro Max): Switch on → START → PIN 0000 with A → unlocked home with balances. No errors.
- **Copy:** no em dashes, no AI tells ("seamless", "unlock the power", etc.), first person and specific. The chain lists match everywhere (Solana + Ethereum, Base, Arbitrum, HyperEVM, Robinhood Chain; "5 networks, named on screen"). Bluetooth is consistently described as the cartridge's radio, never the Game Boy's. The footer states "software real on testnets; hardware a work in progress" on / and /about. /demo says "Testnet funds only".
- **404:** "This cartridge is empty. Blow on the contacts…" is on brand.
- **External links:** faucet and explorer links resolve. Base Sepolia scan returns 403 and the Solana explorer and Robinhood faucet return 429 to curl, which is bot protection; they load in a browser. HyperEVM links are hidden on purpose. robots.txt is fine.
- **Performance:** LCP 0.4–0.9 s on all routes (live, desktop and 390 px emulation). CLS ≤ 0.035. /about ships only 143 KB of JS.
