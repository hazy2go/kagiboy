# kagiboy website audit #2 (read-only), 2026-10-08

Scope: https://kagiboy.vercel.app (live) and http://127.0.0.1:5200 (local preview). Tested in Chrome at 1440x900, 1280x800, 1024x1366 and 820x1180, and in WebKit as iPhone 15 Pro Max, iPhone SE 3 (375px) and iPhone SE (320px). I also walked the full demo on the live site: switch on, mash, shake, 12 words, PIN, unlocked, all five EVM networks, airdrop.
Screenshots are in `/private/tmp/claude-501/-Users-hazy/b648df4f-4071-4982-b6e9-ee85bb53598d/scratchpad/audit2-web/` (`shots/`, plus `sheet-*.png` contact sheets). Paths below are relative to that folder.

## P0: fix before submission

1. **There's no open-source link, and the repo is private.** No page links to GitHub, and `https://github.com/hazy2go/kagiboy` returns 404 when logged out. Open source is a judging criterion.
   *Fix:* make the repo public (or a cleaned mirror). Add a "Source on GitHub" link to the footer on all three pages and to the hamburger menu. Consider adding links to the pitch video and to X/contact too.
2. **On desktop, the "Switch on" button on /demo is below the fold.** At 1440x900 and 1280x800 the Game Boy fills the viewport and the controls sit at about y=920. The NEXT pill says "Switch on the Game Boy" but no switch is visible, so a judge has to scroll before anything happens. (`shots/d1440-demo-00.png`, `sheet-d1280-demo.png`)
   *Fix:* cap the device height at about `calc(100svh - 300px)` on desktop. Another option is to move Switch on into the NEXT pill or overlay it on the console. Clicking the screen could also power it on.

## P1

3. **At 1024px portrait (iPad), the 3D model covers the chapter copy.** The hero headline and lede run under the console, the PCB covers "What's under the label?", and "Hold A to sign." is completely hidden behind the zoomed screen. The desktop camera path starts at 861px and doesn't adjust for tall aspect ratios. (`sheet-t1024-home.png`, `crop-t1024-sign.png`)
   *Fix:* use the phone camera path and bottom card when `max-aspect-ratio: 1/1`, or when the width is 1100px or less.
4. **/demo scrolls sideways at 1280, 1024 and 820px.** `scrollWidth` is 1308, 1047 and 838. The cause is `.rig::before { inset: -6% -8% 0 }` (`src/demo/demo.css:55`).
   *Fix:* add `overflow-x: clip` on `.kb.demo`, or use inset `-6% 0 0`.
5. **Unknown routes show a blank white page.** `/nope` returns 200 with nothing rendered, and the console says "No routes matched". `/robots.txt` and `/favicon.ico` also return the HTML shell. (`shots/d1440-404.png`)
   *Fix:* add a `path="*"` route with a short "This cartridge is empty" page and links to Home and Demo. Add a real `public/robots.txt`.
6. **On phone, the hero never says what the product is.** `.ch-hero .lede` is `display:none` at 860px and below (`landing.css:1031`). A first-screen visitor sees only "Your keys, in a Game Boy cartridge." It never says "hardware wallet", Solana or EVM. (`sheet-ip15pm-home.png` frame 1)
   *Fix:* show one short line, for example "A hardware wallet for Solana and EVM chains."
7. **Chip callouts are clipped at 375px and 320px.** LIS3DH is cut at the left ("IS3DH"), and SE050C, CYW43439 and the label are cut at the right. At 320px the hero headline also overlaps the console, "Try the live demo" wraps onto two lines, and "Slide it in." overlaps the render. (`sheet-ip375-home.png` and `sheet-ipse-home.png`, frames 5, 1 and 3)
   *Fix:* clamp callout x to the 16px gutter, or hide the floating callouts on phones (the chip list already covers them). Shorten the hero button labels at 340px and below.
8. **"Testnet" appears too often on the landing page.** It's in the roadmap NOW item, Known limits, the "Where we're at" intro, the demo CTA ("on test networks") and the footer. That's five mentions against the one-in-the-footer rule.
   *Fix:* keep the footer and the demo tag. Reword the others, for example "The software runs today." and "It signs real transactions."
9. **The gallery photos look like real hardware.** All four AI placeholders are photoreal, and the heading "On the desk." doesn't match three of them (hands, shelf, couch). A judge will likely read them as photos of a working cartridge, which works against the honest-claims rule. Also, `/gallery/*.webp.json` is public and says "AI-generated placeholder (Higgsfield nano_banana_pro…)".
   *Fix:* put a small "MOCKUP" stamp on each figcaption, or retitle to "How it'll look". Remove the `.json` sidecars from `public/`.
10. **The demo page doesn't explain what you're looking at.** "Try kagiboy." has no subhead. The fact that the chip is simulated and the ROM is real only appears in the footer.
    *Fix:* add one line under the H1, for example "The real Game Boy ROM, with the cartridge's chip simulated in your browser. The phone on the right is the companion app."

## P2

11. **Setup step numbers don't match between the landing page and the ROM.** The landing rail says STEP 1 = MASH + SHAKE, STEP 2 = 12 WORDS, STEP 3 = PIN. The ROM says STEP 1 = mash, STEP 2 = "Now shake it", STEP 3 = PIN (`rom/src/main.c:608,648,936`). Pick one.
12. **Parts and naming are inconsistent.** It's "SE050C" in the callout, "NXP SE050" in the BOM and "SE050 kit" in the roadmap. "Four main chips" sits next to "6 PARTS". Suggest "4 chips + 2 support parts". "Real DMG" and "link-cable backup" are jargon for investors.
13. **About-page copy has two issues:**
    - The Bluetooth story conflicts. "You can't connect this to anything… no Bluetooth" and "every extra feature is one more thing to worry about" both clash with the cartridge's Bluetooth radio. Add half a sentence that the radio only carries public data, as the landing page does.
    - There are two "not X" lines in a row: "I'm not doing this to get rich" and "NOT A LEDGER RIVAL… I'm not out to beat…". Keep one.
14. **The bus monitor says "SWITCH ON THE GAME BOY TO SEE TRAFFIC" after power-on.** It stays that way until START is pressed. When powered, show "PRESS START" instead. (`sheet-ipse-demo.png` frame 4)
15. **The quick airdrop hangs.** It shows "Requesting…" for about 8 seconds while web3.js retries 429s with backoff, and the console logs eight errors. Set `disableRetryOnRateLimit: true` on the Connection.
16. **The haze ends in a hard line.** There's a visible horizontal edge where the stage background stops, and a pastel strip under the nav at the origin section. (`shots/d1440-home-09.png`, `-10.png`)
17. **The origin section is left-aligned at 232px; the sections after it start at 112px.** (`d1440-home-10/11`)
18. **The desktop "Inside" layout leaves a gap.** The BOM receipt sits beside a tall render with about 450px of empty space below it. Sticky the receipt, or shorten the render.
19. **The reduced-motion still screen is neon lime.** `/screens/home.png` doesn't match the pale LCD tint. It may also flash briefly before attract mode loads. (`shots/reduced-0.png`)
20. **The OG image has white bands at the top and bottom.** It also lists "SOLANA · ETHEREUM" only. Fill the edges to the bleed.
21. **Demo heading order skips a level.** The page goes H1, then H3 "Switch on your Game Boy", then H2.
22. **Page titles are generic.** /demo keeps the title "kagiboy". Set it to "kagiboy demo".
23. **Public assets are served with `cache-control: max-age=0`.** This covers the GLB (845 KB br) and renders. Add an immutable cache header for `/3d/*` and `/renders/*`.
24. **The waitlist helper text is slightly low on contrast.** "One email when kagiboy ships." is 4.25:1 on blue paper. Darken it a step.

## Checked and fine

- **Console and CSP:** the live site logged no CSP violations or JS errors across `/`, `/about` and `/demo`, including all five EVM networks. The only errors were the devnet airdrop 429s. All explorer and faucet hosts are allowed by CSP.
- **Demo flow:** the end-to-end keyboard flow works (START → mash 40/40 → shake → words → PIN → unlocked). The phone app follows along, and the network picker updates both the Game Boy home screen (HyperEVM/HYPE) and the faucet button.
- **Mobile demo:** the ≤760px demo is a properly designed app. It has a tab bar, a NEXT pill, and the console fits with Switch on visible. It works well at 430px and 320px.
- **Phone landing:** the separate camera path works. The bottom chapter card and the chip list replace the callouts cleanly, and the setup rail scrolls with dots.
- **Performance:** LCP is about 0.6–1.3 s and CLS is about 0.002. The landing entry chunk is 140 KB gz. Three.js (164 KB) and serverboy (158 KB) load lazily, the GLB is compressed with br, and the images are light. The demo SDKs are only loaded on /demo.
- **Accessibility:**
  - Headings are in order on `/` and `/about`, and all images have alt text.
  - Every control has a name, and the menu has aria and Escape.
  - Focus rings are visible.
  - Under reduced motion, Lenis and the attract mode are off and the stage collapses to a still image.
  - Grey-on-pastel contrast passes almost everywhere.
- **Meta:** og:image and twitter:image are absolute and load (1200x630). The favicon renders.
- **Links:** all internal anchors and routes resolve, external faucet and explorer links resolve, and the waitlist API answers 405 to GET.
- **Copy:**
  - The chain list (Solana + Ethereum, Base, Arbitrum, HyperEVM, Robinhood Chain) is consistent on the hero, the receipt ("5 networks") and the picker.
  - Bluetooth and keys claims are honest on the landing page.
  - The PIN "5 tries, then wipe" is consistent.
  - There are no prices or "weeks", no Sepolia/devnet in visible copy, and the hardware is clearly called a work in progress.
- **Judge's first 10 seconds on desktop:** clear. The headline, lede and two CTAs show up front, the console animates the real ROM, and the scroll story reads well: insert, the chips, hold A, the printed slip.
