# kagiboy build and security roadmap

Status on 2026-10-10: the software is real and the cartridge is in production. The GBDK ROM runs in an emulator and on a physical DMG from a flash cart. Until the cartridge ships, the key chip is simulated in the browser (`web/src/chip/chip.ts`). The phone companion signs real devnet and Sepolia transactions. This document is the plan for getting from there to a shippable, audited cartridge. Every external claim links to its source. Cost and time figures marked *estimate* are ours and were not quoted by a vendor.

## Summary

The hardware is feasible. Open-source RP2040 and RP2350 Game Boy flash carts already serve the cartridge bus from PIO state machines through TXB0108 level shifters ([shilga firmware](https://github.com/shilga/rp2040-gameboy-cartridge-firmware), [Croco Cart RP2350B](https://gbstudiocentral.com/?p=5335)). The NXP SE050 signs both curves we need, Ed25519 and secp256k1, but only on the **C and E variants** ([AN12436, Table 1](https://www.nxp.com/docs/en/application-note/AN12436.pdf)). It has no BIP-32 or SLIP-10 derivation, so keys are derived on the MCU once at setup, imported into the SE and then erased from the MCU.

The hard problems are not cost or parts. There are three:

1. The Game Boy is a screen and buttons we do not control, and its cartridge bus can be sniffed.
2. Wallet logic and the Bluetooth stack share one MCU.
3. The SE050 can only sign an Ed25519 message of about 850 bytes or less.

For each one we state the problem and the mitigation below. The plan has five phases. Phase 0 is the hackathon build. Phase 1 is a dev-board cartridge running on a real DMG, about 6 weeks. Phase 2 is a custom PCB, about 8 weeks. Phase 3 is hardening plus an external audit, about 4 months. Phase 4 is a certified small batch, about 3 months. Total: roughly 9–10 months and *est.* $150–260k to the first 500 units.

## Architecture

```
 Game Boy (DMG): runs the kagiboy ROM, served by the cartridge. Screen + D-pad.
   │ 32-pin edge, 5 V, ~1 MHz bus (A0-15, D0-7, /RD, /WR, /CS, PHI)
 ┌─┴───────────────────────────────────────────────────────────────────┐
 │ Level translation: data bus via SN74LVC8T245 (DIR from /RD)         │
 │                                                                     │
 │ RP2354B (RP2350 A4, 2 MB in-package flash, 48 GPIO)                 │
 │  Secure world: wallet logic, tx decode, policy, SE050 session,      │
 │                PIO bus server, CONFIRM button + LED (Secure GPIO)   │
 │  Non-secure:   BLE host stack, phone protocol parser                │
 │    │ I²C + SCP03 (encrypted, MCU-bound)                             │
 │    ├── SE050E2: Ed25519 + secp256k1 keys, PIN auth object (5, wipe) │
 │    ├── LIS3DH: extra entropy, tilt                                  │
 │    └── Raspberry Pi RM2 module (CYW43439, pre-certified) ── BLE     │
 └─────────────────────────────────────────────────────────────────────┘
```

### Decision: SE050E2, keys imported after derivation on the MCU

- **What the SE050 supports.** According to NXP's configuration table, Twisted Edwards Ed25519/EdDSA is available on SE050E2, SE050C1/C2 and both dev kits. Koblitz curves (including secp256k1) are available on E2, C and A. Ed25519 is **not** on the A, B, D or F variants ([AN12436 Rev 2.4, Table 1](https://www.nxp.com/docs/en/application-note/AN12436.pdf)). The APDU spec lists `Secp256k1` with 32-byte keys ([AN12413](https://www.nxp.com/docs/en/application-note/AN12413.pdf)). We pick **E2**. It is the newer generation with applet 7.2 ([AN12436 §3.5](https://www.nxp.com/docs/en/application-note/AN12436.pdf)), it has a −40…105 °C range, and the matching dev kit is OM-SE050ARD-E. The SE050 has CC EAL6+ certification and a TRNG to NIST SP800-90B, and it draws 14.4–16.1 mA during public-key operations ([SE050 datasheet Rev 3.8](https://www.nxp.com/docs/en/data-sheet/SE050-DATASHEET.pdf)). LCSC lists SE050C1 at $3.26 at 100+ ([LCSC](https://support.lcsc.com/product-detail/Security-Verification-Encryption-ICs_NXP-Semicon-SE050C1HQ1-Z01SCZ_C2650415.html)). We did not find a price for E2.
- **No HD derivation inside the SE.** The SE050 offers HKDF, PBKDF2 and HMAC, but not BIP-32 or SLIP-10. This is the same reason Trezor Safe 3 and BitBox02 keep an *encrypted seed on the MCU* and use their secure element only to release a PIN-gated secret ([Trezor](https://trezor.io/learn/a/secure-element-in-trezor-safe-3), [BitBox](https://blog.bitbox.swiss/en/best-of-both-worlds-using-a-secure-chip-with-open-source-firmware/)). The SE050 can *sign* on both our curves, so we can do better:
  1. At setup, the MCU builds the mnemonic from SE TRNG output, with button and accelerometer entropy mixed in. The Game Boy shows it.
  2. The MCU derives `m/44'/501'/n'/0'` (SLIP-10) and `m/44'/60'/0'/0/n` (BIP-32) for n = 0…4.
  3. It writes each private key into the SE050 with `WriteECKey`. Each key's policy is *sign only, never readable, usable only in a PIN-authenticated session*.
  4. It zeroizes the seed and child keys in RAM.
  5. From then on, every signature happens inside the SE050.
- **What this costs us.** The seed is **not retained**. Adding a 6th account, or the planned link-cable clone, means re-entering the 12 words. We think "after setup, your seed exists only on your paper" is worth that. This is open question Q2.
- **Ed25519 quirks.** The SE050 uses big-endian for Ed25519 keys and signatures, while RFC 8032 is little-endian. Firmware must byte-reverse ([AN12413 §7](https://www.nxp.com/docs/en/application-note/AN12413.pdf)). wolfSSL measured about 261 ms per Ed25519 signature and 103 ms per ECDSA signature ([wolfSSL](https://www.wolfssl.com/wolfssl-nxp-se050-support/)). The SE050E runs I²C at 1 MHz at most (clock stretching is off by default; [datasheet §4.1.1](https://www.nxp.com/docs/en/data-sheet/SE050-DATASHEET.pdf)), and its ECDSA output carries no recovery id, so the firmware normalises to low-S and computes the EVM yParity itself.
- **Hard limit on Solana messages.** `EdDSASign` takes the *plain* message (Solana uses PureEdDSA, so there is no prehash). The APDU payload is capped at 889 bytes ([AN12413](https://www.nxp.com/docs/en/application-note/AN12413.pdf)). After TLV overhead, Solana messages over about 850 bytes cannot be signed in the SE050, and Solana transactions can be up to 1,232 bytes. Today's scope, plain SOL transfers of about 150–250 bytes, fits easily. Large DeFi transactions would be refused. This is open question Q1.
- **EVM.** The MCU computes keccak-256 over the bytes it displayed. The SE signs the 32-byte hash. The MCU then normalizes to low-s (EIP-2) and computes the recovery id.

### Alternatives considered

| Option | Ed25519 | secp256k1 | Why not (now) |
|---|---|---|---|
| **Tropic Square TROPIC01** (open architecture, used in Trezor Safe 7) | Yes | **No** (P-256 only) | Can't sign EVM ([Trezor](https://trezor.io/es/guides/trezor-devices/trezor-safe-7/what-is-the-tropic-01-chip), [Embedded Computing](https://embeddedcomputing.com/technology/security/hardware-security/embedded-world-product-showcase-tropic-squares-tropic01-hardware-security-element)). Its auditable design and "Mac-and-Destroy" PIN slots make it the best fit as a *PIN/attestation* chip next to the SE050 in a v2 |
| Infineon OPTIGA Trust M | No | No | Seed would have to live on the MCU (Trezor model). Also affected by EUCLEAK, a non-constant-time ECDSA inversion that went unnoticed through about 80 CC evaluations ([NinjaLab](https://ninjalab.io/EUCLEAK/)) |
| Microchip ATECC608 | No | No | P-256 only. Used as a PIN-hardening chip by BitBox02 and Passport ([BitBox](https://blog.bitbox.swiss/en/best-of-both-worlds-using-a-secure-chip-with-open-source-firmware/), [Foundation](https://foundation.xyz/blog/passport-prime-security-audit)) |
| Ledger-style ST33 running custom apps (decode inside the SE) | Yes | Yes | Needs NDA access and a closed OS. It would remove our biggest structural weakness (decode on the MCU), but not at a startup's scale |
| NXP SE051 | Same family | Same | Field-updatable applet. Worth evaluating in Phase 3 |

For reference, Keystone 3 Pro uses three SEs from different vendors ([Keystone](https://accountlabs.notion.site/Keystone-3-Pro-Introduction-193292a8f24a451b9ee819b690ebabba)), and Tangem is a single EAL6+ SE on NFC ([Kryptex](https://pool.kryptex.com/en/articles/tangem-wallet-en)).

### MCU: RP2350 A4, with the BLE stack isolated by TrustZone

- **Bus service.** PIO plus DMA serves the bus, as the existing carts do ([shilga](https://github.com/shilga/rp2040-gameboy-cartridge-firmware)). That RP2040 cart has to be overclocked to fetch ROM from QSPI flash in time, which costs power. Our ROM is 32 KB, so we serve it **from SRAM** and don't need to overclock.
- **Physical attacks on the RP2350.** The [2024 hacking challenge](https://raspberrypi.com/news/security-through-transparency-rp2350-hacking-challenge-results-are-in) produced five breaks:
  - OTP guard-word glitch (E16).
  - Two USB-bootloader fault injections, by voltage and by EMFI (E20, E21).
  - Laser fault on the secure-boot hash (E24).
  - FIB/passive-voltage-contrast readout of the antifuse OTP.

  All five need physical access. The A4 stepping (Aug 2025) fixes the boot-ROM issues and E16, but **does not fix OTP readout** ([eeNews](https://www.eenewseurope.com/en/raspberry-pi-spins-its-rp2350-adds-5v-support), [heise](https://www.heise.de/en/news/Raspberry-Pi-has-revised-the-RP2350-microcontroller-10511832.html?view=print)). Our response:
  - Use only A4 parts.
  - Disable both USB BOOTSEL interfaces in OTP, which is the mitigation for E20 and E21.
  - Store OTP secrets with Raspberry Pi's recommended "chaffing" scheme.
  - Never put wallet keys in the MCU.

  Hacking Challenge 2, on the AES secure-boot side channel, runs to 2026-10-31 ([Raspberry Pi](https://www.raspberrypi.com/rp2350-hacking-challenge-2/)).
- **Isolating the radio stack.** The [internal audit](audit-security.md) rates it critical (D1) that the Bluetooth stack shares an MCU with the wallet logic. Our answer is to run the BLE host stack and phone parser in the **Arm TrustZone Non-secure world**. Wallet logic, the SE050 session, and the CONFIRM button GPIO live in the Secure world, behind one narrow, fuzzed message interface. A Bluetooth remote-code-execution bug then lands in a world that can neither press CONFIRM nor talk to the SE. If the Phase 3 audit says that isn't enough, Rev B moves BLE to a second small MCU over UART.
- **Price.** RP2350A is $0.80 on 3,400-unit reels and $1.10 singly ([Raspberry Pi](https://www.raspberrypi.com/news/rp2350-now-available-to-buy/), [CNX](https://www.cnx-software.com/2025/03/18/buy-raspberry-pi-rp2350-mcu-rp2354a-and-rp2354b-variants/)). The RP2354 variants put 2 MB of flash inside the package, which removes the external QSPI flash chip and a probe-able bus. The cartridge needs 39 GPIO (28 of them on the Game Boy bus), so it has to be the 48-GPIO **RP2354B**: the 30-GPIO A packages are too small ([hardware-sim.md](hardware-sim.md)).

### Radio: Raspberry Pi RM2 module instead of a chip-down CYW43439

The RM2 carries the same CYW43439 and SDK support as the Pico 2 W. It already has **FCC/CE/IC/UKCA modular certification** (FCC ID 2ABCB-RMC2GW4B52) and retails for about $4.60 ([SparkFun](https://www.sparkfun.com/raspberry-pi-radio-module-rmc20452t.html), [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-radio-module)). That is about the same price as our chip-down estimate, and it removes intentional-radiator certification. The finished product still needs Part 15 Subpart B testing and a "Contains FCC ID" label ([FCC KDB 996369](https://fcc.gov/sites/default/files/32-KDB-996369-Modules-TCB_Oct_2023.pdf), [Ezurio](https://www.ezurio.com/resources/white-papers/fcc-guidance-on-transmitter-modules)). Open risk: most of a DMG cartridge sits inside the console, so the antenna has to sit in the part of the shell that sticks out above the slot.

### Level shifting: keep TXB0108 for Rev A, move to explicit direction in Rev B

TXB0108 works in shipping carts, but it has real limits:
- It is auto-direction with a weak DC drive.
- Pull-ups must be ≥50 kΩ.
- Its one-shot accelerators give up on loads above about 70 pF ([TI datasheet](https://www.ti.com/document-viewer/lit/html/SCES643K/GUID-64C30AE1-CDFD-4F92-B89C-3B6AF0AC5289)).

The Game Boy data bus is shared and bidirectional, which is exactly where auto-direction can fight. For **Rev A** we copy the proven TXB0108 topology from the [open-source cart hardware](https://github.com/shilga/rp-gameboy-cartridge-hw) so the first board just works. For **Rev B** the data bus moves to **SN74LVC8T245**, a dual-supply part (1.65–5.5 V) with a DIR pin driven by the decoded /RD and /CS ([TI](https://edgeworker.ti.com/product/SN74LVC8T245)). Address and control lines are inputs only. A4-stepping RP2350 GPIOs tolerate 5 V, but only while IOVDD is powered ([eeNews](https://www.eenewseurope.com/en/raspberry-pi-spins-its-rp2350-adds-5v-support)). A cartridge can be hot-inserted, so we keep a buffer on those lines anyway.

### Power budget: measured first, not assumed

- A stock DMG draws about 235 mW. An EverDrive GB adds about 120% ([Gekkio](https://gekkio.fi/blog/2021/power-consumption-of-game-boy-flash-cartridges/)).
- RP2040 cart makers warn their draw is "significantly higher than normal cartridges" and tight on modded consoles ([Tindie](https://www.tindie.com/products/zeraphim/rp2040-based-game-boy-cartridge/)).
- The SE050 peaks at 19 mA with AES and public-key operations running together ([datasheet](https://www.nxp.com/docs/en/data-sheet/SE050-DATASHEET.pdf)).
- The CYW43439 draws about 71 µA connected at a 1 s interval and 93 µA advertising at 1 s ([Infineon datasheet, table 39](https://www.mouser.com/datasheet/2/196/Infineon_CYW43439_DataSheet_v05_00_EN-3361555.pdf)).
- Simulated over a whole session, the cartridge adds about 13 mA (67 mW, +28% of a DMG) at the home screen and peaks near 60 mA, well under what an EverDrive adds ([hardware-sim.md](hardware-sim.md)).
- **We could not find how much the DMG's 5 V converter can supply to the cartridge.**

Design rules:
- The radio is off unless a phone session is active.
- The SE050 sits in deep power-down (<5 µA) while the cartridge is locked. Deep power-down drops the PIN-authenticated session, so while unlocked it uses power-down (~0.45 mA) instead.
- The RP2350 runs at the lowest clock that meets bus timing.

Exit criterion for Phase 1: average cartridge draw at most 2× a stock cart, with no brownout on a DMG running on alkaline AAs at end of life.

## Threat model

Trust boundary in one sentence: **the SE050 protects key extraction, the RP2350 Secure world decides what gets signed, and the user approves on the cartridge.** The Game Boy, the phone and the radio are all untrusted inputs.

**The console screen problem.** We don't control the console. A modded DMG or an FPGA console (Analogue Pocket, ModRetro Chromatic) is a reprogrammable computer. It can draw a different address than the one the cartridge sent, and it can fake button presses. There is also a subtler problem: everything the Game Boy displays crosses the cartridge bus, because the console reads the ROM and mailbox from us. So an interposer between cartridge and console sees the PIN and, at setup, the seed words. That is not hypothetical: the open-source [GB Interceptor](https://github.com/Staacks/gbinterceptor) is an RP2040 bus-sniffing adapter that rebuilds the screen from bus traffic. We cannot fix this with cryptography. Here is what we do:

1. **Approval moves onto the cartridge.** A physical CONFIRM button and an LED are wired to a Secure-world GPIO. The Game Boy's A button selects; only the cartridge button signs. A console can no longer approve for you.
2. **Two-screen agreement.** The cartridge sends its own decoded summary (to, amount, fee, network) to the phone over the bonded BLE link, MAC'd with the pairing key, and both screens show the same 4-character check code. To fool the user, an attacker now has to compromise the console *and* the phone. Each one alone is caught.
3. **Honest guidance.** Use your own original console. Treat an FPGA console like a phone, meaning helpful but untrusted. Never set up a wallet through an adapter.

| Threat | Attacker | Mitigation | Phase |
|---|---|---|---|
| Malicious or modded console shows a different tx | Swaps or mods your Game Boy | Cartridge CONFIRM button; cartridge-authenticated summary + check code on the phone | 2 |
| Console fakes A presses / auto-approves | Modded console, FPGA clone | Signing requires the cartridge button; Secure-world minimum dwell between PENDING and SIGN | 2 |
| Bus interposer captures PIN / seed words | Physical, visible adapter | User guidance; seed shown only once; 6+ digit PIN; PIN alone is useless without the cartridge | 1 (docs), 3 |
| Malicious phone swaps the tx | Compromised phone | The cartridge decodes its own snapshot and signs exactly those bytes (built today); refuses what it can't show | 0 |
| Blind signing / unreadable DeFi tx | Phishing dApp | Clear signing only: Solana System/SPL decoders, EIP-712 typed data; everything else refused | 3 |
| Solana cluster ambiguity | Malicious phone | Separate derivation account for testnet builds; label "ANY CLUSTER" on mainnet ([audit M1](audit-security.md)) | 1 |
| BLE stack RCE | Attacker in radio range | TrustZone split; fuzzed parser; only a bonded phone may send requests; rate limits | 2–3 |
| BLE MITM / eavesdrop | Radio range | LE Secure Connections, Numeric Comparison shown on the Game Boy (Just Works has no MITM protection, [NIST SP 800-121 via Bluetooth SIG](https://bluetooth.com/blog/bluetooth-pairing-part-4)) | 2 |
| MCU↔SE bus sniffing | Thief with an FPGA | SE050 SCP03 encrypted, MCU-bound channel. This is exactly how Unciphered extracted OneKey seeds ([The Block](https://www.theblock.co/amp/post/210665/security-firm-unciphered-hacked-into-popular-hardware-wallet-onekey)) | 2 |
| PIN brute force | Thief | Five wrong PINs, then wipe (like Ledger): firmware deletes the key objects on the fifth failure; backstop is the SE050 auth object with hardware max-attempts set to 5 (0–0x7FFF, enforced in the applet) ([AN12413](https://www.nxp.com/docs/en/application-note/AN12413.pdf)), and the keys can only sign inside a session opened with it, so they are unusable even if the delete is skipped; PIN-derived AES auth key so the PIN is never stored | 2 |
| Key extraction from SE | Lab attacker | EAL6+ SE; keys created non-readable; still assume a lab can win (EUCLEAK precedent) and say so | 2 |
| Fault injection on MCU | Lab attacker | A4 stepping, BOOTSEL disabled, OTP chaffing, potting; no keys in MCU; key use bound to SE050 PCR measurement of firmware (to evaluate) | 2–3 |
| Malicious firmware update | Supply chain / phone | RP2350 secure boot with our key hash in OTP; anti-rollback; update needs PIN + cartridge button + on-screen version | 2 |
| Evil maid / counterfeit | Seller, courier | Genuine check: the phone challenges the SE050's die-individual attestation key (NXP-signed cert) plus our provisioning cert ([AN12436 §3.6](https://www.nxp.com/docs/en/application-note/AN12436.pdf)); tamper-evident packaging | 3 |
| Weak RNG | Malicious firmware | SE TRNG is the base, user entropy only adds; reproducible builds let users verify the code that mixes it | 3 |
| Side channels on MCU | Lab attacker | MCU never signs; constant-time compares; RP2350 power-hardened AES for boot | 3 |
| Mailbox DoS (burn PIN tries, wipe) | Anyone with a cart reader | Accepted; it is DoS only and the seed is on paper | — |

## Build phases

### Phase 0: hackathon build (now → 2026-10-13)
- **Goals:** a credible, honest submission.
- **Deliverables:** live demo, ROM, simulated chip, this roadmap, fixes for the internal audit's M1/M2/L1/L2 findings.
- **Exit criteria:** submission in; every claim matches this doc (for example, "the seed never leaves the SE" becomes "keys are generated, then sealed in the SE").
- **Cost:** about $0 beyond time.

### Phase 1: dev-board cartridge on a real DMG (weeks 1–6)
- **Goals:** prove the bus, the power budget and the SE050 port.
- **Deliverables:**
  1. Run the existing ROM on a real DMG from an off-the-shelf flash cart (week 1).
  2. Fork the open-source RP2040 cart firmware, load the simulated PIO program (`hardware/sim/programs.ts`) and the mailbox (`make hw`: writes to `0xA000`, replies read from `0x7F00`), and run `chip.ts` logic ported to C on the cart.
  3. Measure what the simulation had to assume: the PIO → DMA → PIO round trip, the point where the DMG CPU latches read data, and SE050 key-import and session times.
  4. Pico 2 W + OM-SE050ARD-E + LIS3DH on a cartridge breakout. Port key derivation and import, PIN auth object, Ed25519/secp256k1 signing.
  5. Power measurements.
- **Exit criteria:**
  - A real DMG signs a devnet and a Sepolia transfer with keys inside the SE050.
  - No bus errors over 24 hours.
  - Power numbers published.
- **Cost:** *est.* $1–2k (dev kits, DMGs, power analyzer rental). Engineering time is extra.

### Phase 2: custom PCB Rev A (weeks 6–14)
- **Goals:** cartridge-sized board with every security-relevant feature.
- **Deliverables:** 4-layer PCB in DMG cartridge outline with the RP2350 A4, SE050E2, RM2, LIS3DH, TXB0108, CONFIRM button and LED. Then:
  - Secure boot, SCP03 and the TrustZone split.
  - LE Secure Connections pairing.
  - Two-screen check code.
  - 3D-printed shell.
- **Exit criteria:**
  - 10 boards pass bus, power and RF (BLE link at 2 m inside a DMG).
  - All Phase 2 rows in the threat table are implemented.
- **Cost:** *est.* $5–10k (JLCPCB/PCBWay assembly of 2×10 boards, iteration, shells).

### Phase 3: Rev B, hardening and external audit (months 4–7)
- **Goals:** a design we are willing to let strangers attack.
- **Deliverables:**
  - Rev B with SN74LVC8T245, RP2354B and potting.
  - Clear-signing decoders (SPL, common programs, EIP-712).
  - Genuine-check flow.
  - Reproducible builds.
  - BLE parser fuzzing in CI.
  - External audit, then fixes and a public report.
- **Exit criteria:** no open critical or high audit findings; report published.
- **Cost:** *est.* $60–150k, mostly the audit (see below).

### Phase 4: certification and first batch (months 7–10)
- **Goals:** 500 units to waitlist buyers.
- **Deliverables:**
  - FCC Part 15B / CE testing of the host product (radio covered by the RM2).
  - Injection-molded shell. *est.* $5–12k for a Game Boy-type mold, though some hobbyists reported far higher quotes ([GB Studio Central](https://gbstudiocentral.com/?p=3613), [BitBuilt](https://bitbuilt.net/forums/threads/injection-molded-plastic-shells-food-for-thought.6314/latest)).
  - SE provisioning station, tamper-evident packaging, trademark-cleared name.
- **Exit criteria:** certified, provisioned, attestation verified on 100% of units.
- **Cost:** *est.* $40–80k (certification, mold, 500 × ~$20 landed BOM + assembly, packaging).

## Security program

- **Audits.** The scope is hardware, firmware, the SE integration, side-channel and fault-injection feasibility, and the phone app.
  - Keylabs did a comparable scope for Foundation's Passport Prime, covering threat model, PIN/key handling, secure boot, the ATECC608C and physical attacks, and published the report ([Foundation](https://foundation.xyz/blog/passport-prime-security-audit)).
  - Kudelski IoT is accredited by Ledger for wallet app audits ([Nagra](https://www.nagra.com/kudelski-iot-labs-accredited-ledger-provide-security-audit-services-ledger-3rd-party-applications)). One public quote for a small app audit was €5,025 ([Secret forum](https://forum.scrt.network/t/secret-ledger-app-audit/7116)). A full hardware review costs far more, and we found **no public price**.
  - Ledger Donjon has evaluated competitors' devices, including a voltage-glitch flash readout on Trezor Safe 3 ([The Block](https://www.theblock.co/post/346018/trezor-discloses-vulnerability-safe-3-crypto-wallet-rival-ledger)).
  - NinjaLab specializes in SE side channels.

  Plan: one firmware/protocol audit plus one hardware/physical audit from a different firm. Budget *est.* $50–120k.
- **Bug bounty.** It starts at Phase 3 with a public scope (firmware, BLE, phone app, genuine check). It pays more for key extraction or for signing without the CONFIRM button. Raspberry Pi's paid challenge shows that public bounties find real silicon bugs.
- **Reproducible builds.** Pinned toolchains (GBDK, Pico SDK) in a container. Published ROM and firmware hashes. The phone verifies the firmware hash at genuine check. We submit to independent verifiers such as WalletScrutiny.
- **Open source.** ROM, firmware, phone app and schematics are public. The SE050 applet is NXP's closed code, and we say so.
- **Disclosure.** `security.txt`, a PGP key, a 90-day coordinated disclosure policy and public advisories.
- **Backup.** BIP-39, 12 words, today. Evaluate SLIP-39 (Shamir) for Phase 4. That fits the "seed only on paper" model.

## Risks and open questions

- **Q1. Solana message size.** Messages over about 850 bytes don't fit the SE050's `EdDSASign` APDU. The spec text says "TBD bytes", so the real limit must be measured. If DeFi support matters, the options are a different SE or MCU signing for large transactions. The second option breaks our "keys never in the MCU" claim, so we would not do it silently.
- **Q2. No seed on the device after setup.** This blocks link-cable cloning and new accounts without the words. We need to decide whether to keep an SCP03-protected, PIN-gated seed object instead.
- **Q3. PIN exhaustion semantics.** On the SE050, a used-up auth object is *blocked*, not erased. We still need to confirm the factory-reset path (DeleteAll) on E2.
- **Q4. Power.** No verified figure for the DMG's 5 V headroom or CYW43439 BLE current. Phase 1 measures them.
- **Q5. RF.** Antenna performance inside the slot is unknown.
- **Q6. Nintendo IP (high).**
  - **Name.** Nintendo successfully opposed **GOLFBOY** for a portable electronic viewer under §2(d), citing GAME BOY (*Nintendo v. Schwartzberg*, Opp. No. 91163873) ([USPTO TTAB summary](https://www.uspto.gov/news/og/2007/week48/pattab1.htm)). A "-boy" name in Class 9 is a real risk. Keep "kagiboy" as a codename, get a clearance opinion before any sale, and have a fallback name ready.
  - **Boot logo.** The DMG boot ROM requires Nintendo's logo bytes in the cartridge header. *Sega v. Accolade* (9th Cir. 1992) held that copying lockout data for interoperability is fair use, and that Sega, not Accolade, was responsible for its trademark appearing ([Wikipedia](https://en.wikipedia.org/wiki/Sega_v._Accolade), [opinion](https://wendy.seltzer.org/neu/sem/sega-v-accolade-tm.html)). That is US law, and it is precedent, not a guarantee.
  - **Market practice.** Incube8 has sold unlicensed new DMG cartridges since 2021 ([HeldGames](https://heldgames.com/guides/homebrew-publishers-guide)). ModRetro sells a cartridge-compatible clone ([Notebookcheck](https://www.notebookcheck.net/ModRetro-Chromatic-New-Game-Boy-Color-clone-released-for-199-with-FPGA-core-and-cartridge-support.844129.0.html)). **We found no public record of Nintendo suing either. We could not verify whether any private letters exist.**
  - **Rules for us.** No Nintendo marks, an original shell design (not a copy of Nintendo's), "compatible with" wording only, and the non-affiliation notice we already show.
- **Q7. Untrusted console.** Mitigated but not solved. It is in the threat model on purpose.
- **Q8. Market.** Hardware wallets are a crowded Colosseum category. Unruggable won the Cypherpunk Grand Prize ($30k) and joined accelerator C4 ([Colosseum](https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/)). That shows Solana-native hardware can win. At least six Frontier 2026 hardware-signer entries (Faraday, Better Wallet, SolWear, Coldstar, Black Seal, Sovereign OS Vault) did not place, according to Colosseum project data. Direct prior art: Keyp's 2023 Game Wallet was an offline BTC/ETH Game Boy cartridge that generated seeds from button presses ([Decrypt](https://decrypt.co/140730/old-game-boy-might-next-bitcoin-ethereum-wallet)). kagiboy's differences are the secure element, Solana-first signing, and the phone link. Our moat is delight plus honesty, not novelty of the form factor.

## Sources

- Game Boy bus and carts: [Pan Docs: External Connectors](https://gbdev.io/pandocs/External_Connectors.html) · [shilga RP2040 cart firmware](https://github.com/shilga/rp2040-gameboy-cartridge-firmware) · [hardware](https://github.com/shilga/rp-gameboy-cartridge-hw) · [Tindie RP2040 cart](https://www.tindie.com/products/zeraphim/rp2040-based-game-boy-cartridge/) · [Hackster](https://hackster.io/news/this-game-boy-flash-cart-features-an-rp2040-microcontroller-474b658e6bc7) · [Croco Carts](https://gbstudiocentral.com/?p=5335) · [GB Interceptor](https://github.com/Staacks/gbinterceptor) · [STM32 cart emulation](https://github.com/goebish/stm32f_GBCart) · [Gekkio power measurements](https://gekkio.fi/blog/2021/power-consumption-of-game-boy-flash-cartridges/)
- RP2350: [hacking challenge results](https://raspberrypi.com/news/security-through-transparency-rp2350-hacking-challenge-results-are-in) · [A4 stepping](https://www.eenewseurope.com/en/raspberry-pi-spins-its-rp2350-adds-5v-support) · [heise](https://www.heise.de/en/news/Raspberry-Pi-has-revised-the-RP2350-microcontroller-10511832.html?view=print) · [Challenge 2](https://www.raspberrypi.com/rp2350-hacking-challenge-2/) · [pricing](https://www.raspberrypi.com/news/rp2350-now-available-to-buy/) · [RP2354](https://www.cnx-software.com/2025/03/18/buy-raspberry-pi-rp2350-mcu-rp2354a-and-rp2354b-variants/) · [IOActive FI study](https://www.ioactive.com/characterizing-the-raspberry-pico-2-fi-countermeasures-part-1/)
- SE050: [datasheet Rev 3.8](https://www.nxp.com/docs/en/data-sheet/SE050-DATASHEET.pdf) · [AN12436 configurations](https://www.nxp.com/docs/en/application-note/AN12436.pdf) · [AN12413 APDU spec](https://www.nxp.com/docs/en/application-note/AN12413.pdf) · [wolfSSL](https://www.wolfssl.com/wolfssl-nxp-se050-support/) · [LCSC price](https://support.lcsc.com/product-detail/Security-Verification-Encryption-ICs_NXP-Semicon-SE050C1HQ1-Z01SCZ_C2650415.html)
- Other secure elements and wallets: [TROPIC01 in Trezor Safe 7](https://trezor.io/es/guides/trezor-devices/trezor-safe-7/what-is-the-tropic-01-chip) · [Trezor Safe 3 SE](https://trezor.io/learn/a/secure-element-in-trezor-safe-3) · [BitBox02](https://blog.bitbox.swiss/en/best-of-both-worlds-using-a-secure-chip-with-open-source-firmware/) · [Keystone 3 Pro](https://accountlabs.notion.site/Keystone-3-Pro-Introduction-193292a8f24a451b9ee819b690ebabba) · [Tangem](https://pool.kryptex.com/en/articles/tangem-wallet-en) · [EUCLEAK](https://ninjalab.io/EUCLEAK/) · [Unciphered/OneKey](https://www.theblock.co/amp/post/210665/security-firm-unciphered-hacked-into-popular-hardware-wallet-onekey) · [Ledger Donjon/Trezor Safe 3](https://www.theblock.co/post/346018/trezor-discloses-vulnerability-safe-3-crypto-wallet-rival-ledger) · [wallet.fail](https://app.media.ccc.de/v/35c3-9563-wallet_fail)
- Radio and certification: [RM2 (SparkFun)](https://www.sparkfun.com/raspberry-pi-radio-module-rmc20452t.html) · [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-radio-module) · [FCC KDB 996369](https://fcc.gov/sites/default/files/32-KDB-996369-Modules-TCB_Oct_2023.pdf) · [Ezurio module guide](https://www.ezurio.com/resources/white-papers/fcc-guidance-on-transmitter-modules) · [Bluetooth pairing](https://bluetooth.com/blog/bluetooth-pairing-part-4)
- Level shifting: [TXB0108](https://www.ti.com/document-viewer/lit/html/SCES643K/GUID-64C30AE1-CDFD-4F92-B89C-3B6AF0AC5289) · [SN74LVC8T245](https://edgeworker.ti.com/product/SN74LVC8T245)
- Audits: [Passport Prime audit](https://foundation.xyz/blog/passport-prime-security-audit) · [Kudelski accreditation](https://www.nagra.com/kudelski-iot-labs-accredited-ledger-provide-security-audit-services-ledger-3rd-party-applications) · [audit price data point](https://forum.scrt.network/t/secret-ledger-app-audit/7116)
- Legal and market: [Sega v. Accolade](https://en.wikipedia.org/wiki/Sega_v._Accolade) · [GOLFBOY opposition](https://www.uspto.gov/news/og/2007/week48/pattab1.htm) · [Incube8 / homebrew publishers](https://heldgames.com/guides/homebrew-publishers-guide) · [ModRetro Chromatic](https://www.notebookcheck.net/ModRetro-Chromatic-New-Game-Boy-Color-clone-released-for-199-with-FPGA-core-and-cartridge-support.844129.0.html) · [Keyp Game Wallet](https://decrypt.co/140730/old-game-boy-might-next-bitcoin-ethereum-wallet) · [Colosseum Cypherpunk winners](https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/) · [mold costs](https://gbstudiocentral.com/?p=3613)
