# Simulating the cartridge before building it

The cartridge hasn't been built yet. To find the mistakes before paying for boards,
[`hardware/sim`](../hardware/sim) simulates it with the real ROM and the real wallet
code. Every figure comes from a datasheet or a published measurement, and the
simulation says where it had to assume. Those assumptions are listed at the end, with
what to measure in Phase 1 to close them.

Results below are from `hardware/sim/out/summary.txt` (2026-10-10, 150 MHz).

## What it runs

1. **The real ROM through a whole session.** The real-cartridge build of the ROM
   (`make hw`) runs in an emulator for 47 seconds of Game Boy time:
   - set up a wallet;
   - set the PIN;
   - pair a phone;
   - show the receive QR codes;
   - sign a Solana send, a Sepolia send and a SOL to Base swap;
   - power cycle, enter one wrong PIN, then unlock.

   Each of the 49.7 million machine cycles the Game Boy puts on the cartridge bus is
   recorded.
2. **The cartridge, cycle by cycle.** The chosen frames are replayed against a model
   of the cartridge (about 300,000 machine cycles, including every frame that touched
   the mailbox):
   - **Game Boy edges:** placed from published DMG bus timing.
   - **Level shifter:** each edge passes through it, with datasheet propagation delays.
   - **RP2350 inputs:** they then go through the RP2350's two-flop input synchronisers.
   - **PIO program:** the actual program runs instruction by instruction.
   - **Lookup:** each byte is fetched through a DMA model from SRAM.
   - **Output:** it then goes back out through the pads and the shifter.
   - **Checks:** every byte the Game Boy reads is checked at the moment its CPU latches
     it. Every write is checked for correct capture, and every cycle for two drivers on
     the bus at once.
   - **Corners:** this repeats at worst and best corners and over random draws of
     every timing range.
3. **The firmware with real latencies.** The wallet logic the website runs
   (`web/src/chip/chip.ts`) answers the mailbox, but each command now takes the time
   it would on an RP2350 with an SE050. That covers I²C at the SE050's 1 MHz, its
   signing times and its TRNG speed, plus key derivation on the MCU.
4. **Power.** Each part's current, from its datasheet, over the session's timeline.

## Results

### Bus timing: it works, at the RP2350's stock 150 MHz

When does the Game Boy CPU latch read data? Two hypotheses are published:
- at the CLK fall, about 480 ns into the cycle. This is a guess from a logic capture.
- at the next CLK rise, about 954 ns. Gekkio is "95% sure" of this one, tested on a
  Super Game Boy.

The design has to meet the early one.

| Design | Clock | PIO slots | Margin, early latch | Margin, late latch | Bus errors |
|---|---|---|---|---|---|
| **ROM-window mailbox (chosen), TXB0108** | **150 MHz** | **20 / 32** | **81.8 ns** | **562 ns** | **0** |
| ROM-window mailbox, SN74LVC8T245 | 150 MHz | 20 / 32 | 77.6 ns | 559 ns | 0 |
| ROM-window mailbox | 125 MHz | 20 / 32 | 46.1 ns | 528 ns | 0 |
| ROM-window mailbox | 100 MHz | 20 / 32 | fails by 7–10 ns | 467 ns | 0 |
| Mailbox at 0xA000, speculative | 150 MHz | 32 / 32 | fails (mailbox reads) | 378 ns | 0 |
| Mailbox at 0xA000, decode first | 200 MHz | 26 / 32 | fails by 7 ns | 460 ns | 0 |
| Mailbox at 0xA000, decode first | 250 MHz | 27 / 32 | 15.3 ns | 497 ns | 0 |

**Bus errors** counts these, summed over the worst corner, the best corner and 12
random draws:
- two drivers on the data bus at once;
- driving the bus outside a cartridge read;
- data changing before the latch hold time;
- writes captured wrong.

At 150 MHz the design meets the early latch at the worst corner as long as each DMA
hop is up to ~12 cycles; the RP2350 datasheet doesn't publish a figure. Up to 8 cycles
per hop, the margin barely moves (89 → 83 ns), because the lookup finishes while the
program waits for A15. At 125 MHz it tolerates about 8 cycles.

### Firmware: nothing comes near the ROM's timeout

The ROM gives up on the chip after 600 frames (10 s).

| Command | Typical | Worst corner | What takes the time |
|---|---|---|---|
| CREATE | 583 ms | 712 ms | 16 bytes from the SE050 TRNG (140 ms), BIP-39 PBKDF2 (4096 SHA-512 blocks), 3 secp256k1 point mults |
| SET_PIN | 265 ms | 401 ms | Two key imports, the PIN auth object and opening the PIN session |
| UNLOCK | 187 ms | 278 ms | Spend a try, derive the PIN key, open the session |
| SIGN, Solana (150-byte message) | 264 ms | 316 ms | SE050 Ed25519: 261 ms |
| SIGN, Ethereum | 165 ms | 206 ms | SE050 ECDSA (103 ms) + recovery id on the MCU |
| SIGN, swap from Solana | 263 ms | 315 ms | Ed25519 over the 32-byte intent digest |
| PAIR accept | 50 ms | 401 ms | Storing the BLE bond in flash (sector erase) |
| Everything else | 0.3 ms | 0.5 ms | The Game Boy sees it next frame, as today |

All three signatures were produced, and the unlock after the power cycle worked, at
both corners. The Solana message was 150 bytes, well under the SE050's ~850-byte
Ed25519 limit.

### What the bus carries

These are counts from the ROM itself:

- **ROM reads:** 3.46 million in 47 s; 3,704 of them are mailbox reads.
- **Back-to-back reads:** up to 25 in a row, so the program re-arms within the same
  cycle.
- **Writes the Game Boy makes:** 317 to the mailbox, none to ROM space.
- **Writes it never makes:** none to a byte the chip owns.
- **Read-backs:** the Game Boy never reads back a byte it wrote, so the write path has
  no read-after-write hazard.
- **Cycles to ignore:** 880,000 work-RAM reads (including OAM DMA) and 280,000 work-RAM
  writes. The DMG pulls /CS low for these too. In the cycle-level run, the cartridge
  never drove the bus during one of them.

### Power, from the Game Boy's 5 V rail

A stock DMG draws about 235 mW. An original EverDrive adds about 230 mW and runs fine
on DMGs ([Gekkio](https://gekkio.fi/blog/2021/power-consumption-of-game-boy-flash-cartridges/)).

| State | Current | Power | vs a stock DMG |
|---|---|---|---|
| Home screen, phone connected | 13.4 mA | 67 mW | +28% |
| Home screen, radio off | 12.7 mA | 64 mW | +27% |
| Locked | 12.2 mA | 61 mW | +26% |
| Signing | 28.1 mA | 141 mW | +60% |
| Peak (SE050 peak + radio burst + busy core at once) | 60 mA | 300 mW | |

The session averaged 66 mW, about a quarter of what the DMG itself uses and well
under an EverDrive. Two changes move the home-screen figure:
- a buck converter instead of the LDO: 13.4 → 10.4 mA;
- a 30 ms BLE connection interval instead of 100 ms: 13.4 → 14.9 mA.

### Pins

The cartridge needs 39 GPIOs:
- **28 on the bus:** A0-A15, D0-D7, /RD, /WR, PHI, and DIR on Rev B.
- **11 on the board:** I²C, SE050 ENA, 4 for the RM2, CONFIRM, LED, /RES and the
  LIS3DH interrupt.

The 30-GPIO RP2350A and RP2354A don't have enough. The RP2354B has 48 GPIO and the
same 2 MB of flash in the package.

## What the simulation changed

1. **The Game Boy reads the mailbox through ROM space.**
   - **The old way:** reads from 0xA000 can only be answered once /CS is valid (up to
     275 ns into the cycle). That leaves too little time before the early latch, even
     at 200 MHz.
   - **The fix:** the hardware build (`make hw`) now reads the chip's half of the
     mailbox at 0x7F00, which the ROM leaves empty (it ends at 0x50D0). It still
     writes requests to 0xA000.
   - **Why it works:** every read is a ROM read now. The cartridge starts the lookup
     from A0-A14 at ~185 ns and only waits for A15 to decide whether to drive.
   - **What it saves:** /CS isn't needed at all, and the program fits in 20
     instructions. The shipping `wallet.gb` is byte-for-byte unchanged.
2. **A15 is not an early address bit.** On the DMG it's the ROM select strobe and only
   goes low with /CS. The first speculative design looked bytes up with A15 still high
   and returned the wrong bytes. The simulation caught it on the first run.
3. **RP2354B, not RP2354A**, because of the pin count above.
4. **150 MHz, no overclock.** Existing RP2040 carts overclock because they stream the
   ROM from QSPI flash. Serving the 32 KB ROM from SRAM makes the stock clock enough.
5. **Rev B turns the shifter around without extra instructions.** The SN74LVC8T245's
   DIR pin is the ninth OUT pin, with its latch held at 1 and a pull-down. RP2350's
   `mov pindirs` then drives D0-D7 and flips DIR in the same cycle.
6. **Ed25519 on the SE050 takes 261 ms, not 103 ms.** 103 ms is wolfSSL's ECDSA figure.
   A Solana signature takes about a quarter to a third of a second.
7. **Facts the firmware has to handle:**
   - The SE050E runs I²C at 1 MHz at most, because clock stretching is off by default.
   - Deep power-down loses the authenticated session, so while unlocked the SE050 sits
     in power-down at ~0.45 mA.
   - Its ECDSA output has no recovery id, so the firmware normalises to low-S and
     computes yParity itself. Both are in the latencies above.
8. **BLE current is no longer unknown.** It's in the CYW43439 datasheet (table 39):
   about 71 µA connected at a 1 s interval, 93 µA advertising at 1 s.

## What it doesn't simulate

- **Analog behaviour:**
  - signal integrity;
  - the TXB0108's one-shots on a shared bus;
  - ground bounce;
  - hot-plugging and ESD.
- **The DMG's 5 V converter:** how much current it can give the cartridge, and
  brownout on weak batteries.
- **RP2350 DMA latency.** Assumed 3–8 cycles per hop; the sweep above shows how much
  slack there is.
- **When exactly the DMG CPU latches read data.** The design meets the earlier of the
  two published hypotheses.
- **Assumed timings:** SE050 key-write and session-open times, and MCU crypto cycle
  counts. These are marked `assumed` in `hardware/sim/params.ts`.
- **RP2350 current:** scaled from the datasheet's tables, not measured on this
  workload.
- **Power-on.** The DMG boot ROM reads the cartridge header almost immediately, so the
  cartridge should hold /RES low until its PIO program is running. That's why /RES is
  in the pin count.
- **The radio:** range with the antenna in the shell, and RF certification.

## Phase 1 measurements that close the gaps

On a Pico 2 W:
1. **PIO to DMA to PIO round trip.** Toggle a pin in PIO, push to DMA, pull the byte
   back, toggle again. This settles the one big assumption above.
2. **CPU latch point.** Feed a real DMG a byte that changes between 480 and 954 ns and
   see which value it latches. This decides whether the 82 ns margin or the 562 ns
   margin is the real one.
3. **Power.** Current into the cartridge slot at the home screen and while signing,
   on fresh and nearly flat AAs.
4. **SE050 timings.** Key import, session open and secp256k1 signing on the
   OM-SE050ARD-E.

## Run it

```sh
cd rom && make hw                # build/wallet-hw.gb: mailbox writes at 0xA000, reads at 0x7F00
cd ../web && pnpm sim            # about 5 minutes; MHZ=125 TRIALS=30 pnpm sim to change the run
```

The run writes `hardware/sim/out/summary.txt` and `results.json`. The files:

- **`params.ts`:** every number, with its source and whether it's a datasheet value,
  a measurement or an assumption.
- **`programs.ts`:** the PIO programs the cartridge would load.
- **`pio.ts`:** the PIO model and assembler.
- **`cartsim.ts`:** the cycle-level cartridge.
- **`tracer.ts` and `session.ts`:** the instrumented emulator and the scripted
  session.
- **`firmware.ts`:** command timings.
- **`power.ts`:** the power model.
