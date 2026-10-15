# kagiboy cartridge firmware (RP2350)

MIT. Work in progress: the board isn't built yet.

| Crate | What | Status |
|---|---|---|
| `core/` (`kagiboy-core`) | The wallet logic: the Game Boy mailbox, PIN and wipe rules, BIP-39 words, Solana and EVM keys, transaction decoding and signing, swaps, pairing, QR codes. `no_std`, so the same code runs on the RP2350 and in host tests | done, matches the browser chip byte for byte |

## The browser chip is the reference
`web/src/chip/chip.ts` is the chip the ROM is developed and tested against. `kagiboy-core` is its port, and is held to it:
- `web/scripts/chip-vectors.ts` drives the browser chip through full sessions and records every mailbox reply,
  every phone-side refusal, every pairing code and every signature, with a seeded random stream and a fixed clock
  (`core/tests/vectors/*.json`).
- `core/tests/vectors.rs` replays them against the Rust chip with the same random bytes and requires identical
  bytes: replies, the chip's half of the mailbox after every command, refusal texts, signed transactions.
- The networks, swap tokens and fees are generated from the TypeScript tables (`web/scripts/chip-tables.ts` ->
  `core/src/tables.rs`), so the two can't drift.

Run (from `web/`, then here):
```sh
pnpm exec tsx scripts/chip-vectors.ts ../firmware/rp2350/core/tests/vectors
pnpm exec tsx scripts/chip-tables.ts
cd ../firmware/rp2350 && cargo test -p kagiboy-core --release
cargo build -p kagiboy-core --release --target thumbv8m.main-none-eabihf
```

Differences from the browser chip, by design:
- Time comes from the phone (the cartridge has no clock): the 60 s pairing lapse and swap deadlines use it.
- Keys are derived on the chip as in the browser; on the cartridge they will move into the SE050 (next step).
