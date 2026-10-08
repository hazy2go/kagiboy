# kagiboy pitch deck brief (for Claude Design)

Everything needed to design the kagiboy pitch deck: what it's for, what to say, how it should look, and where every asset is. Written 2026-10-08.

**All assets (public Google Drive folder, no sign-in needed):**
https://drive.google.com/drive/folders/1weeLOwM52fLkonGtmRDujNDA2Ou-FKeH

---

## 1. What this deck is for

kagiboy is our entry to the **Colosseum Crypto World's Fair hackathon** (https://colosseum.com/worldsfair).

- **Deadline:** October 12, 2026, 11:59pm PT. Winners announced by December 5, 2026.
- **What gets judged:** the official rules don't ask for a deck. The submission's centrepiece is a **pitch video of 3 minutes or less** (Colosseum calls it the most important part), plus a technical demo video and the GitHub repo. **This deck is the visual backbone of the pitch video** (and something to share with judges and the Colosseum team afterwards). Design it to be read in a few seconds per slide while a voiceover talks.
- **Judging criteria (official rules, section 8):**
  1. **Functionality:** how well does it work, and what's the code quality?
  2. **Potential impact:** how big is the addressable market, and what's the impact on the broader crypto ecosystem?
  3. **Novelty:** how unique is the concept?
  4. **UX:** how well does it use blockchain to create great UX for users?
  5. **Open source:** is it open source, and how well does it compose with other crypto primitives?
  6. **Business plan:** is there a viable business, and can the team execute?
- **Colosseum's own advice for the pitch:** cover the team's background, the problem, who it's for, any validation, and the vision. "A brief startup pitch, not a product demo." Clear narrative beats flashy visuals; no buzzwords.
- **Prizes we can win:** Grand Champion ($30k), one of 20 standout teams ($15k each), and track prizes. kagiboy works with **Solana, Ethereum, Base, Arbitrum, HyperEVM (Hyperliquid) and Robinhood Chain**, which are all Colosseum tracks. Winners are interviewed for the Colosseum accelerator.

**Important: this is a hackathon. The deck must NOT ask for money.** No "$300k ask", no funding slide, no use-of-funds table. End on the vision and the call to try the live demo.

---

## 2. Links

| What | URL |
|---|---|
| Website | https://kagiboy.xyz |
| Live demo (the real Game Boy ROM + simulated cartridge + phone app) | https://kagiboy.xyz/demo |
| Story / About (real photos) | https://kagiboy.xyz/about |
| GitHub repo | https://github.com/hazy2go/kagiboy (private right now; it will be public before submission) |
| Asset folder | https://drive.google.com/drive/folders/1weeLOwM52fLkonGtmRDujNDA2Ou-FKeH |
| Hackathon | https://colosseum.com/worldsfair |

---

## 3. The story in one breath

**kagiboy is a hardware wallet that is a Game Boy cartridge.** You plug it into the original Game Boy you already own. The console becomes the trusted screen and buttons, the cartridge holds your keys in a secure chip, and your phone can only ask. Nothing is signed until you hold A.

- **Tagline (from the site):** "Your keys, in a Game Boy cartridge."
- **Lede (from the site):** "kagiboy turns the original Game Boy into a hardware wallet. Your keys live in a chip inside the cartridge, and nothing gets signed until you hold A."
- **Why a console from 1989?** "Because it can't do much." No Wi-Fi, no Bluetooth, no app store. A screen and a few buttons that only talk to the cartridge.
- **Positioning:** not a Ledger rival. Same rules underneath (keys off the phone, a trusted screen, standard recovery words), but in a form people love and want to keep on a shelf. A second wallet for the people who grew up with a Game Boy and ended up in crypto.

### Team / founder
hazy: lives in Japan, collects retro hardware, has spent years building in Web3. Japan matters in practice: the biggest supply of used Game Boys, a short flight to Shenzhen manufacturing, and a home market (12M+ crypto exchange accounts). The flea-market story: hazy's first console was a Game Boy from a flea market (see the About page).

---

## 4. How it works (the product)

**Three parts:**
1. **The Game Boy** (DMG, Game Boy Color or GBA): the screen and the buttons. No Wi-Fi, no apps.
2. **The cartridge:** makes and keeps the keys in a secure element, decodes every request, signs.
3. **The phone app:** balances, send, receive, swaps. It can only ask.

**Setup feels like starting a new game (4 steps, all on the Game Boy):**
1. **Mash + shake:** you mash buttons and shake the console; it's mixed into the chip's own randomness.
2. **Write 12 words:** your backup, shown once, on the Game Boy only. Restores in any standard wallet (Phantom, MetaMask).
3. **Pick a PIN:** entered twice. Five wrong tries and the cartridge erases the keys (like a Ledger).
4. **Pair your phone:** the same 6-digit code on both screens; A lets it in.

**Signing:** the phone sends a request. The cartridge decodes it itself and draws the amount, fee, network and address on the Game Boy screen. **Hold A for a second to sign.** B says no.

**Swaps:** live quotes from SODAX inside the app. The Game Boy shows what you pay, the least you'll get and the fees. The cartridge keeps its own token list and works out the amounts itself, so the phone can't fudge the numbers. (In the demo, swaps are a preview: signed but never sent.)

**Chains:** Solana, Ethereum, Base, Arbitrum, HyperEVM, Robinhood Chain. One key covers every EVM network, and the Game Boy names the network on every request (LEFT/RIGHT on the Game Boy picks which EVM network the home screen shows).

---

## 5. Security (keep it calm and honest)

- **The phone can only ask.** What you approve is what the cartridge decoded and drew on the Game Boy.
- **Keys never leave the cartridge.** NXP SE050E2 secure element (Common Criteria EAL 6+), keys as sign-only objects.
- **Five wrong PINs, then wipe.** The 12 words bring it back.
- **Bluetooth carries public data only:** requests in, signatures out. Pairing needs the code on both screens plus an A press.
- **Known limits, said openly:** a modified console could fake button presses (planned fix: a confirm button on the cartridge itself); the main chip has published glitch attacks (that's why keys live in a separate secure element); nothing goes on sale before two outside security reviews.

---

## 6. What's real today (functionality, the strongest card)

- The wallet **ROM runs on a real Game Boy**, loaded from a flash cart (real photos in the asset folder).
- The **live demo** at kagiboy.xyz/demo runs the **same ROM** in the browser, next to a simulated cartridge chip and the phone app.
- It signs **real testnet transactions** on all six chains.
- **Live SODAX swap quotes**, shown and signed on the Game Boy.
- **Phone pairing** with a code on both screens, a Phone menu on the Game Boy (see / forget / pair new).
- **Waitlist** is open on the site.
- Written with GBDK-2020 (ROM, C), React + three.js (site, live 3D Game Boy), viem and @solana/web3.js (signing), @sodax/sdk (swaps). Open-source license: MIT.

**What isn't built yet:** the cartridge hardware itself. Next step is a dev-board cartridge (Pico 2 W + SE050 kit) signing on testnet from a real Game Boy.

---

## 7. Inside the cartridge

| Part | Job |
|---|---|
| RP2350 | Serves the Game Boy cartridge bus, decodes transactions, runs the wallet firmware (modern flash carts already use this chip family) |
| NXP SE050E2 | Holds the keys, signs, counts PIN tries |
| CYW43439 (Raspberry Pi RM2 module, pre-certified) | Bluetooth LE to the phone, public data only |
| LIS3DH | Accelerometer: turns a shake into randomness |

All off-the-shelf parts. Estimated landed cost: about **$31 a unit at 500, $24 at 2,000, $18 at 10,000**.

---

## 8. Business (for the "business plan" criterion)

- **Customer:** crypto holders roughly 28 to 45 who owned a Game Boy as kids; collectors; people buying a gift for that person.
- **Prices (planned):** $129 standard · $169 limited colourways (500 numbered each) · ¥24,800 Japan-only edition · $279 bundle with a refurbished, unmodified Game Boy.
- **Margins:** about 65% at 500 units, 70% at 2,000, 75% at 10,000 (estimates).
- **Recurring line:** in-app swaps through SODAX earn a small partner fee on every swap. *(hazy removed the fee number from the website; leave the exact % out of the deck unless hazy says otherwise.)*
- **Go-to-market:** waitlist → refundable deposits once a real board exists → small numbered batches, nothing built ahead of demand. Crypto Twitter (the product films well), the retro community (open-source ROM and schematics), Japan retro shops, gifting.
- **Market reference points (sourced):**
  - Hardware wallet market 2025: $348M–$565M (IMARC, GII)
  - Ledger devices sold since 2014: about 8 million (CoinLaw)
  - Crypto owners worldwide 2025: 741 million (Crypto.com)
  - Game Boy + Game Boy Color sold: 118.69 million (Wikipedia)
  - Crypto exchange accounts in Japan: over 12 million (Japan FSA)
- **Our estimate (label it as ours):** 35,000–55,000 units a year reachable; base case 3,000 units in the first year of sales.
- **Roadmap:** NOW software works · Q4 2026 dev-board cartridge on a real Game Boy · Q1 2027 custom board, Bluetooth pairing, deposits · then two external audits (published) · then certification and the first 500 numbered units.
- **Prior art (be upfront):** Keyp's 2023 Game Wallet was an offline Game Boy cartridge wallet with no secure element, no Solana and no phone link.

Full business plan: `docs/BUSINESS-PLAN.md` in the repo (but again: **no funding ask in the deck**).

---

## 9. Suggested slide outline (about 10 slides, one idea each)

1. **Cover:** "kagiboy. Your keys, in a Game Boy cartridge." Hero render of the Game Boy with the cartridge. kagiboy.xyz.
2. **The problem:** phone wallets show you what to sign on the same screen that's asking; hardware wallets are safe but joyless commodities.
3. **The idea:** the Game Boy you already own becomes the trusted screen. Three parts: console, cartridge, phone.
4. **Setup feels like a new game:** mash, shake, write 12 words, pick a PIN, pair. Use the Game Boy screens or the receipt prints.
5. **Hold A to sign:** the approve screen (send or swap) big, with "the phone can only ask."
6. **It works today:** real photo of a Game Boy running the ROM + "try it at kagiboy.xyz/demo" + six chain logos.
7. **Inside the cartridge:** exploded render + the four chips.
8. **How it compares:** kagiboy vs hardware wallet vs phone wallet (the table from the site).
9. **The business:** who buys it, prices, margins, swaps as the recurring line, market numbers.
10. **Roadmap and honesty:** what's next, audits before sale.
11. **Close:** "Press Start." kagiboy.xyz/demo, the repo, the team.

Map to criteria: functionality (6), novelty (1, 3, 4), UX (4, 5), impact and business (9), open source (6, 11), team (11).

---

## 10. Art direction

**Mood:** Apple-like product launch meets a Game Boy you'd keep on a shelf. Calm, white, soft pastel light, lots of air. The Game Boy is the hero object; everything else stays quiet. The pixel stuff is a homage (small labels, the LCD), never the whole look. Not dark, not neon, not "crypto". No sensory overload.

### Colors (exact, from the site's CSS)

| Token | Hex | Use |
|---|---|---|
| Ink | `#1F2330` | Headings, body text, dark buttons |
| Ink 2 | `#535A6D` | Secondary text |
| Ink 3 | `#666C80` | Captions, footnotes (5.1:1 on white) |
| White | `#FFFFFF` | Page background |
| Pastel blue | `#CFE2FF` | Background glow, highlights |
| Pastel pink | `#FFDCE8` | Background glow, highlights |
| Lavender | `#E6E0FF` | Third glow |
| Paper blue | `#DBE9FF` | Receipt / card tint |
| Paper pink | `#FFE3EC` | Receipt / card tint |
| Paper lavender | `#ECE7FF` | Receipt / card tint |
| Accent blue | `#3B6FE0` | Links, focus, small accents |
| Accent pink | `#B8304F` | Rare emphasis (e.g. "REJECTED" stamp) |
| Hairline | `rgba(31,35,48,0.12)` | Dividers, card borders |

**Background treatment:** white with soft radial glows: blue (`rgba(207,226,255,0.9)`) top right, pink (`rgba(255,220,232,0.85)`) lower right, lavender (`rgba(230,224,255,0.7)`) lower left. See any website screenshot.

**Game Boy screen palette (the site's soft LCD, NOT the classic green):**
`#E4EBD8` (lightest) · `#A4B696` · `#526658` · `#1E2826` (darkest). Every Game Boy screen in the asset folder already uses it. **Never use the pea-green DMG palette** (`#9BBC0F` etc.).

### Type

- **Display:** Funnel Display, 600–800, tight letter-spacing (about −0.04em at large sizes). Headlines like "Your keys, in a Game Boy cartridge."
- **Text:** Funnel Sans, 300–600.
- **Pixel accent:** Pixel Operator 8, uppercase, wide letter-spacing, small sizes only (eyebrows like "THE STORY", receipt text, labels).
- Font files are in `06-fonts/` (Funnel is SIL OFL; Pixel Operator is CC0, license included). Funnel is also on Google Fonts.
- **Wordmark:** "kagiboy" in lowercase, Funnel Display bold. There is no separate logo file.

### Layout and details

- Big headline, one short line under it, one strong visual. One idea per slide.
- Generous white space, 16:9.
- Cards: white, 1px hairline border, large radius (24–28px), very soft shadow.
- Thermal-receipt motif: the site uses printed "receipts" with dashed perforations and pixel text (see `08-receipt-prints/` and the setup/security screenshots).
- Motion (if any): slow, eased (cubic-bezier(0.16, 1, 0.3, 1)), never bouncy.

### Do

- Use the real photos (they're the proof it runs on a real Game Boy).
- Use the soft-LCD Game Boy screens, large and crisp (nearest-neighbour scaling, never blurry).
- Use the renders from `01-renders/` and the website screenshots for the 3D look.
- Label estimates as estimates and cite sources in small footnotes.

### Don't

- No funding ask, no "$300k", no use-of-funds.
- No green Game Boy screens, no renders that aren't in the asset folder.
- No Nintendo logos or the "Game Boy" logotype as a design element (the console in the photos is fine; kagiboy is independent and not affiliated with Nintendo).
- No invented statistics or quotes.
- No claims that the hardware exists or is audited, that it's on mainnet, or that swaps are live.
- No dark "crypto" aesthetic, neon, or heavy gradients.

---

## 11. Asset index (Drive folder)

**01-renders/** (Blender renders used on the site)
- `hero-gameboy-3q.png` (2400×1350): Game Boy with the kagiboy cartridge, three-quarter view, pastel background. Cover / hero.
- `gameboy-front.png` (900×1600, transparent): the console straight on. Good for layouts with a screen placed on top.
- `cartridge-exploded.png` (1600×2400): the cartridge taken apart (front shell with label, board with four chips, back shell). Inside slide.

**02-real-photos/** (hazy's own Game Boy running the real ROM from a flash cart)
- `photo-boot.jpg`: title screen, on a desk.
- `photo-welcome.jpg`: "new wallet or restore".
- `photo-mash.jpg`: thumbs mashing buttons (entropy step).
- `photo-shake.jpg`: the shake step.
- `photo-pin.jpg`: PIN entry.
- `photo-home.jpg`: wallet home with Solana and Ethereum balances, held in two hands. Best single proof shot.

**03-website-screenshots/** (live kagiboy.xyz, 2× resolution, 2880×1800; phone shots 1170×2532)
- `desktop-01-landing-hero` · `02-stage-cartridge` · `03-stage-turn` ("Slide it in. Feel the click.") · `04-stage-inside-chips` (exploded board with chip labels) · `05-stage-sign-screen` ("Hold A to sign.") · `06-setup-receipts` (the setup steps as receipts) · `07-security` ("Why a console from 1989?" + security receipt) · `08-compare` · `09-inside` · `10-roadmap` · `11-faq` · `12-waitlist` · `13-demo` (Game Boy + phone app side by side) · `14-about-hero` · `15-about-gallery`
- `phone-01-landing-hero` · `phone-02-demo-gameboy`

**04-gameboy-screens/** (the real ROM's screens, soft-LCD palette, 640×576, pixel-exact)
`01-boot` · `02-new-or-restore` · `03-mash-buttons` · `04-shake` · `05-recovery-words` (sample test words) · `06-choose-pin` · `07-pair-your-phone` · `08-pair-code` · `09-home` · `10-receive-qr` · `11-approve-send` · `12-signed-confirmed` · `13-approve-swap` ("GET AT LEAST … USDC ON BASE") · `14-swap-signed-demo` · `15-home-network-base` · `16-phone-menu`

**05-3d-model/** `kagiboy.glb`: the Game Boy + cartridge model used on the site (meshopt-compressed glTF).

**06-fonts/** Funnel Display, Funnel Sans (woff2, OFL), Pixel Operator 8 + Mono (ttf, CC0), licenses.

**07-chain-logos/** Solana, Ethereum, Base, Arbitrum, HyperEVM (png), Robinhood (svg).

**08-receipt-prints/** `receipt-home.png`, `receipt-sign.png`: the thermal-receipt style Game Boy prints used on the site.

---

## 12. Honesty rules (non-negotiable)

- The **software** is real and runs today; the **cartridge hardware is in progress**.
- Everything signs on **testnets** only. Swaps are a **preview** (signed, never sent).
- In the web demo the cartridge chip is **simulated in the browser**.
- Nothing goes on sale before **two outside security reviews**.
- Prices, costs and volumes are **estimates**.
- kagiboy is **not affiliated with Nintendo**. Game Boy is a trademark of Nintendo. "kagiboy" is a working name.
