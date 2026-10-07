# TODO

Deadline: Colosseum submission closes 2026-10-13 06:59 UTC (Oct 12 evening, Americas).

## Waiting on hazy
- [ ] **Name.** CARTWALLET is a placeholder. Change `brand.json`, then `cd rom && make`.
- [ ] **AI mockups (Higgsfield).** Cartridge on a DMG, exploded view of the internals (MCU + SE050 + BLE),
      shake-to-generate, phone + Game Boy signing, link-cable backup, packaging. Credits needed.
- [ ] Deploy to Vercel (hazy's account, check `vercel whoami` first). Then make og:image an absolute URL in web/index.html.

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

