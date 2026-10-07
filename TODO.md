# TODO

Deadline: Colosseum submission closes 2026-10-13 06:59 UTC (Oct 12 evening, Americas).

## Waiting on hazy
- [ ] **Name.** CARTWALLET is a placeholder. Change `brand.json`, then `cd rom && make`.
- [ ] **AI mockups (Higgsfield).** Cartridge on a DMG, exploded view of the internals (MCU + SE050 + BLE),
      shake-to-generate, phone + Game Boy signing, link-cable backup, packaging. Credits needed.
- [ ] Deploy to Vercel (hazy's account, check `vercel whoami` first).

## Loop backlog
### UI/UX
- [x] Phone app header sits under the notch
- [x] Failed tx: show the reason (e.g. "no funds") on the Game Boy and phone; phone validates address/amount/balance first
- [ ] Phone: latest transaction status is below the fold after sending; show it next to the form
- [ ] First-run guidance: point at the Game Boy, highlight the next action
- [x] Mobile layout pass (390px): touch-only setup verified, key hint hidden on touch, no tap-zoom, scrolls to the Game Boy when the phone sends a request
- [x] Receive screen QR code on the Game Boy (air-gapped receive), scanned in the smoke test with jsQR; QR toggle in the phone app too
- [ ] Sound: Web Audio beeps mirroring the ROM's

### Performance
- [x] Code-split /demo (landing 83 kB gz, demo chunk 213 kB gz)
- [x] Emulator: pause when the tab is hidden (requestAnimationFrame already stops; catch-up is capped at 4 frames)

### Features
- [x] Real marketing landing page (why, how it works with real ROM screens, security model + limits, hardware, roadmap)
- [x] docs/hardware.md: parts list, BOM cost, tamper model, link-cable backup
- [ ] Restore from 12 words
- [ ] Link-cable backup simulation (two cartridges)

- [ ] Social preview (og:image, twitter card) — use a mockup once hazy picks them, a ROM screenshot until then

### Bugs / hardening
- [ ] Landing page uses real ROM screenshots from public/screens; regenerate them after any ROM UI change
- [x] Wrong-PIN wipe flow end-to-end test (smoke: 5 wrong PINs → WIPED, storage erased)
- [x] EVM sign path (smoke: approved ETH tx recovers to the wallet address)
- [x] Power off mid-signing (smoke: pending request resolves as rejected)
