# kagiboy

A hardware wallet for the original Game Boy. A secure chip inside the cartridge
holds your Solana and EVM keys, and you approve every transaction on the Game
Boy's own screen and buttons, which your phone can't touch.

**Status, honestly:** the software is real and runs today on testnets. The Game
Boy ROM is written in C with GBDK-2020 and runs on a real Game Boy (DMG) from a
flash cart, and in the browser through an emulator. The cartridge's key chip is
simulated in the browser (`web/src/chip/`), and together with the phone app it
signs and broadcasts real testnet transactions. The cartridge hardware itself
is a work in progress: the parts, security model and build plan are in
[docs/hardware.md](docs/hardware.md) and [docs/ROADMAP.md](docs/ROADMAP.md).
Testnets only. Never put a real recovery phrase into the demo.

## Live

- https://kagiboy.xyz: what it is and why
- https://kagiboy.xyz/demo: the real ROM, the simulated chip and a phone app, side by side
- https://kagiboy.xyz/about: the story behind it

## How the demo works

The demo has six networks: Solana devnet plus five EVM testnets (Ethereum
Sepolia, Base Sepolia, Arbitrum Sepolia, HyperEVM testnet and Robinhood Chain
testnet). One recovery phrase gives one Solana address and one EVM address; the
EVM address is the same on all five networks, and the phone app has a picker to
switch between them.

Keys: arrows, `A` or `X` = A, `B` or `Z` = B, `Enter` = Start, `Shift` = Select.
On a phone, tap the on-screen buttons.

1. Switch on, press START, choose **New wallet** (or **Restore**,
   with test words only).
2. Mash buttons, hold **shake**, write down the 12 words, pick a 4-digit PIN.
3. Fund the wallet: press A on the Game Boy to show your address as a QR code,
   or use **Get test SOL** / **Get test {coin}** in the phone app (ETH or HYPE,
   depending on the network). These open the network's public faucet and copy
   your address. For SOL there is also "or try a quick airdrop", which is often
   rate limited.
4. Send from the phone. The Game Boy shows the amount, fee, network and address
   that the chip decoded from the transaction itself. Hold A to sign, B to
   reject. The bus monitor under the Game Boy shows every mailbox command (PIN
   and words are hidden).

Known demo rough edge: HyperEVM testnet has no working EVM block explorer that
we could find, so the app hides explorer links on that network. There's no direct faucet
for HyperEVM HYPE either: claim testnet HYPE in Hyperliquid's testnet app and move it to HyperEVM.

## Repo layout

| Path | What's in it |
|---|---|
| `rom/` | The Game Boy ROM (C, GBDK-2020): setup, button and shake entropy, 12 words, PIN, restore with word suggestions, receive QR codes, hold-A-to-sign |
| `web/` | Website and demo (Vite + React + TypeScript): landing `/`, `/demo`, `/about`, the simulated chip (`src/chip/`), the phone app (`src/phone/`), the waitlist function (`api/waitlist.ts`). See [web/README.md](web/README.md) |
| `assets/3d/` | Blender model and scripts for the 3D Game Boy and cartridge label |
| `assets/og/` | Social preview image generator |
| `docs/` | Protocol, hardware, roadmap and audits |

## Build and run

ROM (needs [GBDK-2020](https://github.com/gbdk-2020/gbdk-2020); the Makefile
looks in `~/gbdk`, override with `make GBDK=/path/to/gbdk`):

```sh
cd rom
make        # build/wallet.gb, copied to web/public/wallet.gb
make demo   # build/wallet-demo.gb: flash-cart build with an in-ROM mock chip and battery save,
            # for a real Game Boy with no key chip; copied to ~/Desktop/kagiboy-demo.gb
```

Web:

```sh
cd web
pnpm i
pnpm dev               # open /demo
pnpm build
pnpm smoke smoke-out   # runs the real ROM against the chip headlessly
```

The smoke test walks setup, decodes the Game Boy's QR codes, signs a Solana
transfer and an ETH transfer (checking the signatures), rejects one, checks that
the phone can't put its own text on the screen, signs on HyperEVM and with
Arbitrum-sized gas, cuts the power mid-request, wipes after five wrong PINs, and
restores a BIP-39 test vector letter by letter. It saves a PNG of every screen
and exits non-zero if any check fails.

## Architecture

```
Game Boy ROM (rom/)            screen + buttons only, never sees a key
      │  256-byte mailbox: cartridge RAM window 0xA000 on hardware,
      │  work RAM 0xD800 in the demo (docs/protocol.md)
Cartridge chip (web/src/chip)  keys, PIN counter, network allowlist,
      │                        decodes + signs transactions
      │  Bluetooth LE on hardware, a JavaScript call in the demo
Phone app (web/src/phone)      balances, builds and broadcasts transactions
```

- The Game Boy writes a command into the mailbox, the chip answers in the same
  256 bytes. One writer per byte, sequence numbers on both sides.
- **Chip:** BIP-39 seed; Solana at `m/44'/501'/0'/0'`, EVM at `m/44'/60'/0'/0/0`.
  It snapshots each request, decodes it itself and refuses anything it can't
  show in full on the Game Boy (no blind signing). Today that means one plain
  SOL transfer, or one plain native-coin transfer on an allowed EVM network
  (chain id allowlist, gas limit 21000 to 600000, fee cap 0.01 of the coin),
  or a SODAX swap intent shown in full (amount, least you get, fees, chains).
  The demo signs swaps but never sends them.
- **Phone:** talks to public RPCs for Solana devnet and the five EVM testnets.
  It can send balances as numbers and transaction status as fixed codes; the
  chip writes every word that appears on the Game Boy.

More detail: [docs/protocol.md](docs/protocol.md) (mailbox and commands),
[docs/hardware.md](docs/hardware.md) (parts, cost, security model, build plan),
[docs/ROADMAP.md](docs/ROADMAP.md) (path to a shippable, audited cartridge).

## Security model and known limits

What the design protects against: someone who steals the cartridge, a
compromised phone asking for a send you didn't mean, and someone sniffing
Bluetooth. Swaps are a preview for now: the cartridge decodes and signs them
with its own token list, but the signature isn't what SODAX executes yet. What you approve is what the
chip decoded and showed on the Game Boy, and only the A button on the Game Boy
approves it. On real hardware the keys sit in an NXP SE050 secure element with
a hardware PIN retry counter.

Two internal audits are in `docs/` ([audit-security.md](docs/audit-security.md),
[audit-2-software.md](docs/audit-2-software.md)). These items are still open:

**The demo**

- **Test words only.** The browser demo keeps the recovery phrase in plain text
  in `localStorage`, and the PIN is a salted hash of 4 digits, so anyone with
  access to the browser (or an XSS bug) gets the keys. It uses the same
  derivation paths as Phantom and MetaMask, so a real phrase typed in here maps
  to your real mainnet accounts. Never restore a real seed into it. The ROM
  shows a "Test words only" screen before restore.
- **The Solana cluster can't be bound.** A Solana transaction doesn't say which
  cluster it is for; the recent blockhash decides. The screen says `SOLANA`, and
  the phone uses devnet, but the chip can't prove a malicious phone didn't use a
  mainnet blockhash. EVM is different: the chip enforces the chain id.
- **No auto-lock.** The chip stays unlocked as long as it has power.
- **SIGN isn't tied to a digest.** Approving signs whatever is pending. It
  can't be exploited today because the phone can't replace or cancel a pending
  request, but it must be bound to a digest of what was shown before any
  cancel or queue logic is added.
- **Fee cap on Base.** On OP-stack chains the L1 data fee is charged outside
  gas × max fee per gas, so "MAX" on the screen is not a strict cap there.
  Negligible today (about 2×10⁻¹⁶ ETH on Base Sepolia).
- **Balances come from the phone.** The chip formats them, but it can't verify
  them.
- `pnpm audit --prod` reports 8 advisories (3 high), all deep inside the
  `@sodax/sdk` tree: `bigint-buffer`, `toml`, `ws` 7, `stream-json`, `uuid`.
  Patched releases need a major-version bump the SDK doesn't support yet;
  same-major fixes are pinned in `web/pnpm-workspace.yaml`. The SDK only loads
  when you open the swap screen, and none of these are meaningfully reachable
  in the browser.
- The waitlist API tells a caller whether an email is already on the list. That is
  the price of the numbered ticket, kept on purpose; it is rate-limited per IP.

**The hardware design**

- Transaction decoding, the fee cap and the PIN session run on the RP2350 MCU,
  not inside the secure element. The SE050 protects keys from extraction, not
  from misuse by compromised MCU firmware. The plan isolates the Bluetooth stack
  in TrustZone's non-secure world, signs the firmware and pots the board.
- The SE050 can't derive BIP-32/SLIP-10 keys, so the seed exists on the MCU
  during setup; the plan is to derive once, import the keys into the SE and
  erase the seed.
- The PIN and the words cross the Game Boy's cartridge bus in plain text, and a
  modified console could fake button presses. The console is trusted as a
  screen and buttons: use your own, unmodified Game Boy.
- Bluetooth pairing is not specified yet (LE Secure Connections with numeric
  comparison on the Game Boy screen is the plan).
- No cartridge has been built, and nothing has had an external security review.
  Nobody should store real funds on this until both have happened.

## License

kagiboy is released under the [MIT License](LICENSE). The `/demo` page bundles
the `serverboy` Game Boy emulator, which is GPL-2.0; that bundle is distributed
under GPL-2.0 terms. See [NOTICE](NOTICE) for this and the other third-party
licenses.

Game Boy is a trademark of Nintendo. kagiboy is not affiliated with Nintendo.
