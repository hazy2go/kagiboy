# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Right now: Colosseum hackathon judges and crypto investors deciding whether
kagiboy is a credible, fundable hardware product. They skim fast, care about
whether it actually works, and will open the live demo if the page earns it.
Later: collectors and retro gamers who hold crypto and want a hardware wallet
they'll actually enjoy owning.

## Product Purpose

kagiboy is a crypto hardware wallet that is a cartridge for the original Game
Boy (DMG). A secure element in the cartridge holds the keys; the Game Boy is the
trusted screen and buttons; a phone app talks to the cartridge over Bluetooth to
build and broadcast transactions. It supports Solana and EVM. Success for the
page: a judge understands it in seconds, believes it can be built, tries the
demo, and leaves an email on the waitlist.

## Positioning

The only screen that approves a transaction is one the phone can't touch: an
offline 1989 Game Boy. The cartridge decodes each transaction itself and signs
exactly what it shows. It turns millions of working Game Boys into hardware
wallets. Prior art exists (Keyp's 2023 "Game Wallet", Bitcoin/Ethereum, cold
storage only); kagiboy differs by being Solana-first plus EVM, signing over
Bluetooth, and using a secure element.

## Operating Context

The demo runs the real ROM in an in-browser emulator with a simulated key chip
and a phone panel, on Solana devnet and Ethereum Sepolia. The hardware is a
design (docs/hardware.md): RP2350 MCU, NXP SE050E2 secure element, CYW43439
Bluetooth, LIS3DH accelerometer, ~$14 in parts at 100 units.

## Capabilities and Constraints

- Real today: the Game Boy ROM (GBDK, DMG-only, 32 KB), the chip logic (BIP-39,
  Solana m/44'/501'/0'/0', EVM m/44'/60'/0'/0/0, PIN with wipe after 5, restore
  from 12 words, QR receive, exact amount/fee/network on screen, refuses what it
  can't show), the phone app, and a headless test suite.
- Not built: the physical cartridge. Never claim it ships, is certified, or has
  been tested on real hardware. The ROM has not yet been run on a physical DMG.
- Testnets only in the demo.
- Waitlist: email sign-up is the end call to action; storage is provisioned at
  deploy time (Vercel), not yet.
- Link-cable backup between two cartridges is roadmap only.

## Brand Commitments

- Name: **kagiboy** (lowercase in running text, KAGIBOY on the cartridge label).
  "Kagi" is Japanese for "key".
- The user's binding direction for the site: Apple-like, smooth, minimal,
  soothing; white with pastel blue and soft pink gradients; not dark, not green;
  animation is important; real Game Boy renders and product shots, not CSS
  imitations; nothing that reads as cheap or AI-generated.
- Cartridge look (approved): pearl-white shell, blue-to-pink gradient label,
  white pixel key icon, KAGIBOY wordmark, "SOL · EVM".
- No Nintendo logos or marks on renders; footer states non-affiliation.

## Evidence on Hand

- Real ROM screenshots: web/public/screens/*.png (regenerate with `pnpm smoke`).
- Approved hero cartridge render: assets/renders/01-cartridge-hero.png.
- Accurate Blender model and renders in progress: assets/3d/, assets/renders/3d/,
  web/public/3d/kagiboy.glb.
- Security model and limits: docs/hardware.md. Protocol: docs/protocol.md.
- No customers, testimonials, press, pricing or partnerships. Do not invent any.

## Product Principles

1. Show, don't claim: the live demo and real screens carry the argument.
2. Honest about status: the software is real, the hardware is a design.
3. Calm confidence: security explained plainly, limits stated.
4. Delight is the moat: it should feel like something you want to own.

## Accessibility & Inclusion

Respect prefers-reduced-motion everywhere (the scroll animation must have a
static path). Text contrast WCAG AA on pastel backgrounds.
