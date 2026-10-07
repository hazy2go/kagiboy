# kagiboy

A hardware wallet for the original Game Boy. A secure chip inside the cartridge
holds your Solana and EVM keys, and you approve every transaction on the Game
Boy's own screen and buttons, which your phone can't touch.

> **Status:** the software is real and runs today. The Game Boy ROM, the
> cartridge chip's logic and the phone app sign real testnet transactions. The
> cartridge hardware is a design ([docs/hardware.md](docs/hardware.md)); in the
> demo the chip is simulated in the browser. Testnets only.

## Try it

```sh
cd web
pnpm install
pnpm dev            # open /demo
```

Keys: arrows, `X` = A, `Z` = B, `Enter` = Start, `Shift` = Select. On a phone,
tap the on-screen buttons.

1. Switch on, press START, choose **Create new wallet** (or **Restore 12 words**).
2. Mash buttons, hold **shake**, write down the 12 words, pick a PIN.
3. Press A on the Game Boy to show your address as a QR code, or use
   **Airdrop 1 SOL** in the phone app.
4. Send from the phone. The Game Boy shows the amount and address it decoded
   itself. Hold A to sign, B to reject.

## How it fits together

```
Game Boy ROM (rom/)          screen + buttons only, never sees a key
      │  256-byte mailbox on the cartridge bus (docs/protocol.md)
Cartridge chip (web/src/chip) keys, PIN counter, decodes + signs transactions
      │  Bluetooth on real hardware
Phone app (web/src/phone)     balances, builds transactions, broadcasts
```

- **ROM:** C with GBDK-2020. Button-mash and shake entropy, 12 recovery words,
  PIN, restore with on-device word suggestions, QR codes for receiving, and
  hold-A-to-sign.
- **Chip:** BIP-39 seed; Solana at `m/44'/501'/0'/0'`, EVM at `m/44'/60'/0'/0/0`.
  It decodes each transaction itself and refuses anything it can't show (no
  blind signing).
- **Phone:** Solana devnet and Ethereum Sepolia through public RPCs.

## Build and test

```sh
cd rom && make                 # needs GBDK-2020 at ~/gbdk; copies the ROM to web/public/wallet.gb
cd web && pnpm smoke smoke-out  # runs the real ROM against the chip headlessly
```

The smoke test walks setup, decodes the Game Boy's QR codes, signs a Solana
transfer and an ETH transfer (checking the signatures), rejects one, cuts the
power mid-request, wipes after five wrong PINs, and restores a BIP-39 test
vector letter by letter. It saves a PNG of every screen.

## Docs

- [docs/hardware.md](docs/hardware.md): parts, cost, security model and its limits, build plan
- [docs/protocol.md](docs/protocol.md): the mailbox between the Game Boy and the chip

Not affiliated with Nintendo. Game Boy is a trademark of Nintendo.
