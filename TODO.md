# TODO

Deadline: **Crypto World's Fair (Colosseum) closes Oct 12 2026, 11:59pm PT** (Oct 13 06:59 UTC / 15:59 JST).
Judging: functionality, potential impact, novelty, UX, open-source, business plan.
Live: https://kagiboy.vercel.app · repo hazy2go/kagiboy (private) · deploy = push to main (Vercel root dir `web`).

## Submission checklist (in order)
- [x] Full audit of website + software (2026-10-08): docs/audit-2-website.md, docs/audit-2-software.md
- [ ] **Fix audit P0s:** MIT LICENSE + NOTICE (demo bundles serverboy, GPL-2.0); GitHub link in footer/menu once public; /demo "Switch on" above the fold on laptops
- [ ] **Fix audit P1s (website):** iPad portrait (≤1100px / tall) uses the phone camera path; /demo sideways scroll (`.rig::before` inset → overflow-x clip); 404 route; phone hero one line saying what it is; chip callouts clipped ≤375px; "testnet" down to the footer only; MOCKUP stamp on gallery + move *.webp.json out of public/; demo subtitle "real ROM, simulated chip"
- [ ] **Fix audit P1s (software):** HyperEVM explorer/faucet links (hide or verify); WebGL context leak across routes (dispose context, cleanup when unmounted mid-load, attract disposed check); restore warning "test words only" on the ROM + PIN try spent before check in chip.ts; stale docs (README, hardware.md, protocol.md ACCOUNT name field, web/README.md)
- [ ] Audit P2 polish: chip naming consistency, bus monitor idle text, airdrop 429 retries, OG white bands, /demo title + heading order, cache headers for GLB/renders, contrast, EVM card icon per network, waitlist body-size limit + atomic rate limit, zero-fee refusal, lint warnings, untrack .impeccable/
- [ ] README (what it is, run it, architecture, security model, honest limits) + MIT LICENSE + secrets scan of git history
- [ ] **hazy:** approve making the repo public (open-source criterion)
- [ ] Business plan (unit cost, price, limited editions, collector market, path to first batch) → docs + site section + deck slide
- [ ] Pitch deck (story → problem → demo → security → roadmap → business → team)
- [ ] Video script + storyboard (pitch video + technical demo); record screen demos
- [ ] **hazy:** real Game Boy photos for /about → flip PLACEHOLDER_PHOTOS
- [ ] **hazy:** register team on colosseum.com, check whether one project can enter several tracks
- [ ] **hazy:** decide "5 TRIES, THEN WIPE" vs "then locked" (SE050 may only lock)
- [ ] **hazy:** profile.jpg on the PLAYER 1 card? (optional)

## Done since the redesign (2026-10-07)
- [x] Thermal Print site, real 3D model (Blender) with KAGIBOY face print + new label, phone re-staged (TALL_KEYS), About story page
- [x] Flash-cart demo ROM (`make demo`, battery save) confirmed on a real DMG via EverDrive
- [x] Security + functionality audits (docs/audit-*.md), all fixed; ROADMAP.md researched
- [x] Deployed to Vercel, CSP/headers, waitlist live on Upstash, git-push deploys
- [x] Copy rewritten from hazy's story, AI-pattern audit, devnet labels removed, Bluetooth = cartridge only
- [x] Performance: render-on-change, adaptive resolution, no nav blur; Safari sound fix
- [x] Six chains: Solana devnet + Ethereum/Base/Arbitrum/HyperEVM/Robinhood Chain testnets (networks.ts allowlist)

## Later / nice to have
- [ ] Tempo track: decode TIP-20/ERC-20 token transfers on the cartridge ("SEND 5 USD")
- [ ] Custom boot logo via RP2350 cart (first read kagiboy, second read Nintendo) — hardware phase
- [ ] Link-cable backup (hardware phase)

## Loop backlog
### UI/UX
- [x] Phone app header sits under the notch
- [x] Failed tx: show the reason (e.g. "no funds") on the Game Boy and phone; phone validates address/amount/balance first
- [x] Phone: latest transaction status shown under the Send heading
- [x] First-run guidance: a "Next" line above the rig that follows the wallet state
- [x] Mobile layout pass (390px): touch-only setup verified, key hint hidden on touch, no tap-zoom, scrolls to the Game Boy when the phone sends a request
- [x] Receive screen QR code on the Game Boy (air-gapped receive), scanned in the smoke test with jsQR; QR toggle in the phone app too
- [x] Sound: Web Audio square beeps from the ROM's channel-1 register writes, with a mute toggle

### Performance
- [x] Code-split /demo (landing 83 kB gz, demo chunk 213 kB gz)
- [x] Emulator: pause when the tab is hidden (requestAnimationFrame already stops; catch-up is capped at 4 frames)

### Features
- [x] Real marketing landing page (why, how it works with real ROM screens, security model + limits, hardware, roadmap)
- [x] docs/hardware.md: parts list, BOM cost, tamper model, link-cable backup
- [x] Restore from 12 words (D-pad letter picker with chip suggestions; smoke restores a BIP-39 test vector)
- [~] Link-cable backup: deferred to the hardware roadmap (needs serial-port emulation + a second emulated Game Boy; faking it would undercut the real-ROM demo). Documented in docs/hardware.md and the landing roadmap.

- [x] Social preview: public/og.png from the landing hero (swap for a mockup later)

### Bugs / hardening
- [x] Button presses lost during redraws: joypad now latched in the VBlank interrupt; stale presses flushed at confirm screens
- [x] Landing page uses real ROM screenshots from public/screens; regenerate them after any ROM UI change (refreshed)
- [x] Wrong-PIN wipe flow end-to-end test (smoke: 5 wrong PINs → WIPED, storage erased)
- [x] EVM sign path (smoke: approved ETH tx recovers to the wallet address)
- [x] Power off mid-signing (smoke: pending request resolves as rejected)

### Full review (independent pass, 14 findings) — all fixed
- [x] Chip signed the phone's live object, not what it showed → snapshot bytes at request time, sign exactly those (smoke: swapped transfer still signs the shown one)
- [x] EVM chain/gas/fee unchecked, network label hardcoded → Sepolia only, 21000 gas, 0.01 ETH fee cap, fee + network shown by the chip
- [x] Phone could write text on the Game Boy screen → balances as base units, status as fixed codes, every field clipped to its rows
- [x] One global tx status slot → per-request ids; stale updates ignored
- [x] Signing failure hung the phone and claimed "signed" → resolves cleanly, ROM shows NOT SIGNED
- [x] Errors after broadcast marked "failed" (double-send risk) → "status unknown, check explorer"
- [x] PIN and restore words on the bus monitor → redacted
- [x] Stale balances across wallets → cleared on lock/wipe/power, stale fetches dropped
- [x] Loose amount parsing, rounded amounts → strict decimal to base units, exact amounts on screen
- [x] Async reply surviving a power cycle → generation counter
- [x] Sync throw froze the emulator → try/catch in tick
- [x] Leftover B/A presses on the sign screen; keys stuck after window blur → arm only after release; release all on blur
- [x] LOCK left a request queued; CREATE/SET_PIN could overwrite a stored seed → rejected / refused
- [x] Docs and landing claims updated to match (incl. the Solana cluster limit)

### Second review (verified the 14 fixes; 3 material + 1 low found) — all fixed
- [x] Status "fixed codes" only enforced by types → runtime checks on state, reason and per-chain hash format (smoke: free text blocked)
- [x] Broadcast transport errors reported as FAILED (double-send) → only node rejections fail; timeouts/HTTP errors are UNKNOWN with the hash precomputed from the signed bytes
- [x] 60-digit amount cut on screen but signed → chip refuses any field longer than its rows (smoke: 2^256-1 refused)
- [x] SIGN timeout said "not signed" → "NO ANSWER, CHECK YOUR PHONE"

### Third review — no material issues
- [x] Smoke test was flaky (random mash could pick RESTORE) and exited 0 on failed checks → selects CREATE first, exits 1 on any failed check
- [x] "CREATE NEW WALLET" wrapped by one column on the start menu

