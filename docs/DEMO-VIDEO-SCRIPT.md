# kagiboy technical demo video: script v2

The second Colosseum video. Colosseum's guidance: 2–3 minutes about **the how** (features, tech stack, the reasoning behind decisions). Judges look at the Solana integration, the logic and the architecture. It must not turn into a second pitch, so there is no story, no market and no products here.

- **Voice:** hazy's cloned voice, one take, calm and precise; first person ("I").
- **Picture:** real-time recordings of kagiboy.xyz/demo (the real ROM in the emulator, the simulated cartridge, the phone app, the bus monitor), real devnet transactions on the Solana explorer, real source code, and animated architecture diagrams in the site's style.
- **Subtitles and music:** same subtitle style as the pitch; the music sits lower.
- **Recording wallet:** a dedicated devnet test wallet, funded from the faucet.

---

### 1 · The system
**Visual:** /demo full screen, the console booting. The three parts get outlined one by one: the Game Boy, the cartridge (bus monitor), and the phone.

> This is the technical walkthrough of kagiboy. Everything you see is running live. On the left, the actual Game Boy ROM, written in C with GBDK, in an emulator. In the middle, the cartridge chip. And on the right, the phone app. Three parts, and only one of them ever holds a key.

### 2 · The architecture
**Visual:** an animated diagram. Game Boy → cartridge bus → the mailbox at 0xD800 (the REQ and RESP blocks light up) → chip (secure element) → Bluetooth (public data only) → phone (web3.js, viem, SODAX SDK) → Solana RPC. A red dashed line marks the trust boundary: the phone sits outside it. Then a cut to the real bus monitor, with commands scrolling.

> A Game Boy has no network and no operating system, just the cartridge slot. So that's the wire. The ROM writes a command into a small mailbox in cartridge memory, and the chip writes back a reply. The sequence number goes last, so a half-written answer is never read. The phone talks only to the chip, and only with public data: requests in, signatures out. The phone is never trusted.

### 3 · Keys
**Visual:** recording of a new wallet: mashing the buttons, the ENTROPY commands on the bus, the shake meter, the twelve words. Then a code card with the derivation paths.

> Every button press and shake is sent to the chip as entropy, and it's folded into a SHA-256 pool. On create, the pool is mixed with the chip's own random generator, and that becomes a standard BIP-39 phrase. Solana uses SLIP-10 ed25519 on Phantom's path, and EVM uses MetaMask's. So the same twelve words restore in any normal wallet. The PIN is entered twice, stored salted and hashed, and five wrong tries wipe the chip.

### 4 · Pairing
**Visual:** the phone's "Pair cartridge", the same six digits on both screens, A pressed. On the bus: PHONE, then PAIR.

> Pairing only works while the Game Boy is listening for it. The chip shows a six-digit code on both screens, and you confirm with A. A phone that shows up outside that window gets refused.

### 5 · Signing on Solana
**Visual:** a devnet send of 0.05 SOL from the phone. On the Game Boy: amount, fee and the full address over three lines. A held down with the progress bar filling. "Signed", then "Confirmed" with the signature. Then the same signature on the Solana explorer (devnet), and a code card from `decodeRequest` with the checks.

> This is the part I care most about. The phone builds a normal transfer and sends the serialized message bytes. The chip copies those bytes and decodes them itself. The fee payer has to be this wallet, there has to be exactly one instruction, and it has to be a System Program transfer. The amount is shown exact to the lamport, and the address is shown in full. You hold A for one second, the chip signs those same bytes with ed25519, and the phone only broadcasts. And the phone can't fake the result: the Game Boy shows "confirmed" only for the signature the chip itself made. Here it is on devnet.

### 6 · What it refuses
**Visual:** a quick montage of refusals: an instruction it can't show ("only plain SOL transfers…"), a phone that isn't paired, a request while the cartridge is locked.

> Anything the chip can't show in full, it refuses. No blind signing. A token instruction, an unknown program, an amount too long for the screen: rejected before you're ever asked.

### 7 · EVM and swaps
**Visual:** LEFT/RIGHT cycling networks on the Game Boy (Ethereum Sepolia, Base, Arbitrum, HyperEVM, Robinhood Chain). A swap quote in the app; the Game Boy swap screen ("GET AT LEAST … ON BASE"); the DEMO status.

> The same key covers five EVM testnets. The chip decodes the EIP-1559 transaction, checks the chain against its own list, and caps the fee. For swaps, quotes come live from the SODAX SDK. The phone names tokens only by their address, so symbols, decimals and fees come from the cartridge's own list, and it shows the least you'll get. In this demo, swaps are signed but never sent.

### 8 · Hardware and source
**Visual:** the cartridge exploding on the site: RP2350, NXP SE050, CYW43439, LIS3DH. End card: kagiboy.xyz/demo · github.com/hazy2go/kagiboy · MIT.

> In hardware, the keys move into an NXP secure element, behind an RP2350 that speaks this same mailbox protocol. The ROM doesn't change. It's all open source, and you can try every step of this yourself at kagiboy dot x y z slash demo.

---

### Notes
- Every claim matches the code:
  - `chip/chip.ts` `decodeRequest`, `setTxStatus` and `handle(ENTROPY / CREATE)`;
  - `chip/keys.ts` `newMnemonic` and `slip10Ed25519`;
  - `rom/src/main.c` (the one-second hold).
- Testnets only: Solana devnet plus EVM testnets. Swaps are never broadcast. The cartridge is simulated in the web demo, and the hardware is the planned design.
- Not repeated from the pitch: the flea market, the drawer, "honest screen", who it's for, products and the roadmap.
