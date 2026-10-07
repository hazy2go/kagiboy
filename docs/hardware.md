# The cartridge

Status: design. Nothing here has been built yet. The software in this repo (ROM,
chip firmware logic, phone app) is what the hardware will run.

## What's inside

| Part | Job | Why this part | Est. unit cost* |
|---|---|---|---|
| **RP2350** MCU | Answers the Game Boy's cartridge bus (ROM reads, the mailbox at `0xA000`), runs the wallet firmware | Its PIO state machines can serve the 1 MHz bus in time. RP2040 flash carts already prove the approach. Also has signed boot, OTP, TrustZone and a hardware TRNG | ~$1.10 |
| **NXP SE050C** secure element | Generates and stores the seed, signs, enforces the PIN retry counter | Common Criteria EAL 6+. Supports **Ed25519** (Solana) and **secp256k1** (EVM) | ~$3 (100+) |
| **Infineon CYW43439** | Bluetooth LE link to the phone | Same radio as the Pico 2 W, so drivers exist | ~$4 |
| **LIS3DH** accelerometer | "Shake your Game Boy" entropy, tilt-to-scroll | Cheap, low power, I²C | ~$0.80 |
| 3× **TXB0108** | 5 V Game Boy bus ↔ 3.3 V logic | Used by existing RP2040 carts | ~$1.50 |
| 4 MB QSPI flash | Holds the ROM and firmware (no keys) | | ~$0.40 |
| PCB, shell, label | Standard DMG-size cartridge, potted | | ~$3 |
| **Total** | | | **~$14 parts at 100+ units** |

*Distributor list prices, October 2026, small volume. Assembly, certification and
packaging are not included.

## How it fits together

```
 Game Boy (screen + buttons; never sees a key)
      │  32-pin cartridge edge, 5 V bus
 ┌────┴──────────────────────────────────────────────────┐
 │ TXB0108 ×3                                            │
 │    │                                                  │
 │ RP2350 ── PIO: serves ROM + mailbox at 0xA000         │
 │    │  I²C                                             │
 │    ├── SE050C ── seed, keys, PIN counter (never leave)│
 │    ├── LIS3DH ── accelerometer                        │
 │    └── CYW43439 ── Bluetooth LE ── phone app          │
 └───────────────────────────────────────────────────────┘
```

The Game Boy runs the wallet ROM like any other game. To talk to the key chip it
reads and writes the cartridge RAM window, which the RP2350 answers instead of a
RAM chip. The demo uses the same protocol at `0xD800` (see
[protocol.md](protocol.md)).

## Security model

**What we protect against:** someone who steals the cartridge, someone who
compromises the phone, and someone who sniffs Bluetooth.

- **Keys never leave the secure element.** The SE050 generates the seed and signs
  inside itself. There's nothing to copy by plugging the cartridge into a reader.
- **PIN with a hardware retry counter.** Five wrong PINs and the SE050 erases the
  seed. The counter lives in the secure element, so it can't be reset by
  reflashing the MCU.
- **What you see is what you sign.** The phone sends a transaction. The cartridge
  freezes its bytes, decodes them itself and shows the exact amount, fee,
  network and destination on the Game Boy screen. The phone can't draw on that
  screen: it only sends numbers and fixed status codes, and the cartridge writes
  every word. Only the A button approves, and the cartridge signs exactly the
  bytes it showed. Anything the firmware can't decode is refused (no blind
  signing): today that means plain SOL and ETH transfers only.
- **Spending limits on EVM.** The cartridge only signs on the network it was built
  for (Sepolia in the demo), only 21000-gas plain transfers, and refuses fees
  above a cap (0.01 ETH).
- **Randomness.** The seed comes from the SE050's hardware RNG. Button-mash timing
  and accelerometer samples are hashed in on top. They can only add randomness,
  never take it away.
- **Firmware.** Signed boot on the RP2350, debug port locked, epoxy potting over
  the board.
- **Bluetooth carries only public data:** unsigned transactions in, signatures
  out. A sniffer learns what you sign, not how to sign.

**Known limits, stated plainly:**
- The RP2350's glitch detectors have published bypasses. That's why the keys live
  in the SE050, not the MCU. A compromised MCU could still show a misleading
  screen, so the firmware is signed and the board is potted.
- The Game Boy itself is trusted only as a display and buttons. A modified
  console could fake button presses. Physical possession plus the PIN is the bar.
- A Solana transaction doesn't say which cluster it's for (the recent blockhash
  decides). The cartridge firmware is built for one cluster and labels it, but
  can't prove a phone didn't use another cluster's blockhash. Keep testnet and
  mainnet seeds separate.
- Power: the radio draws more than a normal cartridge. DMG power budget testing is
  the first prototype task.

## Backup and recovery

- **12 words, shown once** on the Game Boy screen during setup. They restore into
  any BIP-39 wallet: Solana at `m/44'/501'/0'/0'`, EVM at `m/44'/60'/0'/0/0`.
- **Link-cable backup (planned).** Two cartridges, two Game Boys, one link cable.
  The secure elements agree a key over the cable (ECDH), both screens show the same
  6-character code, you confirm on both, and the seed moves across encrypted.
  "Trade your wallet like a Pokémon."

## Build plan (if funded)

1. **Week 1–2:** dev board. Pico 2 W + SE050 eval kit + LIS3DH breakout wired to
   an existing RP2040 flash-cart PCB. Port `web/src/chip` logic to firmware.
2. **Week 3–4:** first custom PCB, power testing on a real DMG.
3. **Week 5–8:** signed firmware, potting, Bluetooth pairing, link-cable backup.
4. **Then:** small batch, external security review before anyone stores real
   funds on it.

## References

- RP2040 Game Boy flash carts using PIO and TXB0108 level shifters:
  [Hackster](https://hackster.io/news/this-game-boy-flash-cart-features-an-rp2040-microcontroller-474b658e6bc7),
  [Tindie](https://www.tindie.com/products/zeraphim/rp2040-based-game-boy-cartridge/)
- RP2350 security features: [product brief](https://datasheets.raspberrypi.com/rp2350/rp2350-product-brief.pdf),
  and the [published glitch bypasses](https://www.electropages.com/blog/2025/01/uncovering-vulnerabilities-rp2350-challenges-microcontroller-security-and-emerging-threats)
- SE050 Ed25519/secp256k1 support: [wolfSSL SE050 notes](https://www.wolfssl.com/wolfssl-nxp-se050-support/)
- SE050 pricing: [Farnell](https://pt.farnell.com/nxp/se050c1hq1-z01scz/iot-plug-trust-secure-element/dp/3224949)
