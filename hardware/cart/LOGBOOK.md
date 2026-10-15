# Wallet cartridge logbook

Decisions, checks and results, in order. Board: `hw/wallet/` (WiFi cart Rev B + wallet changes).

## 2026-10-15 Import
WiFi Game Boy Cartridge Rev B imported unmodified from hazy2go/wifi-game-boy-cartridge `326be60`
(`hw/rev-b` → `hw/wallet`, `verify/`, `docs/design/`, `sim/power/`, `sim/models/`). Gate paths changed from
`hw/rev-b` to `hw/wallet`. All four gates pass on the unmodified copy (commit `5086bb6`).

## 2026-10-15 Wallet variant: remove HyperRAM, microSD, RTC; add SE050E2 + LIS3DH
Hazy's choices: keep the RP2350B and its external flash; remove the microSD and the RTC; add the LIS3DH.

**Removed** (DNP, off the board, kept in the schematic so they can be restored; `croco_edits` in
`docs/design/netlist_radio.json`):
- HyperRAM U4 with C22, C23, R12, TP2-TP4. A 32 KB wallet ROM is served from RP2350 SRAM
  (kagiboy `docs/hardware-sim.md`), so the 8 MB PSRAM has no job.
- microSD J2 with R6.
- RTC U5 with Y2, C24, C27, C28, R15, R17, TP1 (BT1 was already gone in the WiFi cart).

**Added** (generated sheet `radio.kicad_sch`, from the same JSON):

| Ref | Part | LCSC (stock 2026-10-15) | Job |
|---|---|---|---|
| U110 | NXP SE050E2HQ1/Z01Z3Z | C5190917 (594) | Secure element. E2 = Ed25519 + secp256k1 |
| C125, C126 | 100 nF | C1525 | SE050 VIN and VCC/VOUT |
| R133, R134 | 2.2k | C25879 | I2C1 pull-ups |
| R135 | 100k | C25741 | ENA pull-down: SE050 in Deep Power-down until firmware enables it |
| U111 | ST LIS3DHTR | C15134 (1708) | Accelerometer, I2C address 0x18 |
| C127, C128 | 100 nF, 10 uF | C1525, C19702 | LIS3DH decoupling |
| R136, R137 | 4.7k | C25900 | I2C0 pull-ups |

**RP2350 pins** (the old HyperRAM pins, GPIO function table F3):

| GPIO | Pad | Was | Now |
|---|---|---|---|
| 6 | 3 | HYPERRAM_RWDS | SE_SDA (I2C1 SDA) |
| 7 | 4 | HYPERRAM_CLK | SE_SCL (I2C1 SCL) |
| 8 | 6 | HYPERRAM_CS | ACC_SDA (I2C0 SDA) |
| 9 | 7 | HYPERRAM_DQ0 | ACC_SCL (I2C0 SCL) |
| 10 | 8 | HYPERRAM_DQ1 | SE_ENA |
| 11 | 9 | HYPERRAM_DQ2 | ACC_INT1 |

GPIO1 (SD CS), GPIO5 (RTC CS) and GPIO12-16 are now free. SPI0 (GPIO0/2/3) only carries the ESP32-C3.

**Why two I2C buses:** the LIS3DH is a 400 kHz part, the SE050 runs at up to 1 MHz here (kagiboy firmware
timing assumes 1 MHz). Separate buses also keep the secure element alone on its bus.

**SE050 wiring** (data sheet Rev 3.8, Table 5 and sec 5.2): supply on VIN (+3V3), VOUT tied to VCC, ENA from
GPIO10. That is the wiring Deep Power-down needs (3 uA while locked vs 0.45 mA in Power-down, Table 12).
ISO14443 LA/LB and RST_N to GND, IO1/IO2/CLK not connected, centre pad to GND.

**SE050 footprint** (`tools/gen_wallet_footprints.py`): from NXP's SOT1969-1 package information, Figures 3-5:
pads 0.725 x 0.2 at 0.4 pitch, 1.538 from centre, 1.9 mm centre pad, 0.05 mask margin, centre paste as
4 x 0.75 squares. Independently confirmed by `make_cpl.py`: JLC's own footprint for C5190917 lands on ours with
matching pad numbers at 0.012 mm.

**Layout:** both chips in the former HyperRAM area left of the RP2350 (`docs/design/placement.json`).
- The copper of every changed net (HyperRAM, SD CS, RTC) was ripped up (`update_pcb.py --rip`).
- Stubs left on SPI, GND and +3V3 were pruned (`prune_dangling.py`).
- Pads were stitched to the In1 GND and In4 +3V3 planes (`stitch_planes.py`). Three duplicate vias it
  made were removed by hand.
- Signals were routed with `finish_route.py` / `route_pair.py`. SE_ENA had to go first, because the other
  five lines otherwise took the only inner-layer corridor from GPIO10.
- The ESP32-C3 ADC divider trace (ADC_VCC, R118-R119) crossed the SE050 corner. It was ripped and re-routed.
- Hand-placed links (`tools/add_track.py`): SE050 VIN to C125, VOUT to VCC to C126, ENA to R135,
  SDA to R133, R134 supply.
- Silk: new parts' reference fields are on F.Fab, as for the WiFi parts. C7 and C19 reference fields moved to
  F.Fab because the area got denser. `update_pcb.py` now hides the LCSC field it adds: it was landing visible
  on the silkscreen.

**Gates** (all PASS):
- `kicad_check`: ERC 70 vs 71 baseline, 0 new; DRC 308 vs 454, 0 new; unconnected 0; parity 0.
- `netlist_check`, `design_calcs` and `sim_vs_netlist`.

Five reviewed exceptions were added to `verify/baseline/accepted.json`:
- 3 isolated labels HYPERRAM_DQ0-2, on the DNP U4 side only.
- 2 `lib_footprint_mismatch` for U110/U111, from the clipped silk (same as U104).

**Fab check** (`make_bom.py`, live JLC stock, 5 boards): 128 placed parts, all new parts in stock.
**1 FAIL: L1** (Croco's RP2350 regulator inductor AOTA-B201610S3R3-101-T, C42411119): stock 4 < 10.
Not changed yet: Raspberry Pi specifies this part for the RP2350 core regulator, so a substitute needs that
datasheet checked first. In-stock 3.3 uH 2016 candidates: FHD201610S-3R3MT C601997, CMLW201610S3R3MST C411344,
LVC201B10-3R3M-N C285877. Same problem for the WiFi cart's order.

**Pin audit** (`pin_audit.py` vs the JLC records): U110 and U111 agree pin by pin. The listed differences are
names only; LIS3DH pin 10 is "RES" in JLC's record, which the data sheet says to tie to GND.

**Power:** the SE050 peaks at 19 mA, the LIS3DH draws µA, both on Croco's AP2112 +3V3. The removed HyperRAM
and microSD drew more than that, so the console-side load goes down.

**Not done / next:**
- L1 decision.
- Firmware for this board: RP2350 bus + wallet logic (port of `web/src/chip/chip.ts`), ESP32-C3 BLE.
- `sim/system` (the WiFi cart's full-system sim) was not copied; kagiboy's own `hardware/sim` covers the bus.
- The kagiboy hardware sim still models the earlier design (RP2354B, CYW43439, TXB0108 x4) and should be
  pointed at this board.

## 2026-10-15 Checks, simulations, routing polish, back silkscreen
**L1 (RP2350 regulator inductor) decision: keep AOTA-B201610S3R3-101-T.** RP2350 datasheet 6.3.8.2: LX must be
fully shielded, 3.3 uH +-20 %, DCR <= 250 mOhm, Isat >= 1.5 A, **polarity-marked**. 6.3.8.3: the regulator's
output depends on the inductor's field orientation, so the polarity mark is needed. In-stock generic 2016 parts
have none, so no swap. Sourcing: JLC 4 left, LCSC out of stock, DigiKey ~26k, Mouser ~14k (2026-10-15). Hazy:
waiting for a restock is fine; otherwise pre-order through JLC. No board change.

**Simulations on this board:**
- Power stage, vendor models (`sim/power`): A1-A7 81 PASS, A8 114 PASS. The A8 runs needed
  `sim/power/out/.spiceinit` (ngbehavior=psa), now tracked. A1-A7 compile the radio's shipped `power_mgr.c`
  (copied to `firmware/esp32c3/components/power_mgr`, MIT).
- Stress case: A8 with the cart logic load at 80 mA instead of 60. 106 PASS, 52 FAIL. All 52 are corners where
  the console's static load alone (console 100 mA + logic 80 mA through 2.5-3 ohm) is already below the 4.588 V
  set-point or 4.5 V. There the radio path carries 0 mA (A8.2 "I 0.0 mA"), so A8.3 finds no loop crossover, and
  the A8.4 hot-plug dip is just 5 - 3 x 0.18 = 4.46 V. So these are not radio-stage failures.
  This board's logic draw (kagiboy power model: about 28 mA while signing, including the SE050) is under the 60 mA
  the audits use.
- Bus (`hardware/sim`, `pnpm sim`, real ROM, 47 s session): TXB0108 at 150 MHz, early-latch margin 81.8 ns,
  0 contention/spurious/hold/write errors; unchanged vs the documented result. The model also puts the address
  lines through a shifter; on this board they go straight into the RP2350, so the model is pessimistic here.

**Design calcs section 10 (I2C):** Cb ~20 pF from the routed lengths (12-21 mm, 2-4 vias), checked at 30 pF.
- SE050 bus: 2.2k gives 56 ns rise (Fm+ limit 120 ns) and 1.64 mA sink (SE050 VOL spec at 3 mA).
- LIS3DH bus: 4.7k gives 121 ns (Fm limit 300 ns).

**Routing polish** (`route_audit.py` / `route_clean.py` against the imported WiFi board, so only new copper is
touched):
- 26 router staircases and 4 crumbs before; 121 segments removed (12 chains pulled tight, 4 crumbs, 1 duplicate).
- 2 collinear pairs merged by hand: the cleaner had missed them over a 1 nm offset.
- Left: one 3-segment ACC_SCL escape between LIS3DH pads to its via (no shorter legal path).
- No stubs, dangling copper or one-layer vias.

**Back silkscreen:** RemAI art and "co-created with RemAI" removed. In their place, the kagiboy logo traced from
`assets/logo/kagiboy-logo-horizontal.png` (`art/kagiboy_logo_bw.png`, 4.5 mm tall, thinnest stroke ~0.23 mm).
The label reads "kagiboy wallet / Rev A 10/2026 / RP2350B+SE050E2", the URL is `github.com/hazy2go/kagiboy`,
and the Croco credit stays.

**SE050 3D model** for renders: KiCad's UQFN-20 3x3, z-scaled to 0.32 mm. The shell-height check uses the
datasheet 0.33 mm (OVERRIDE): PASS.

**Fab outputs regenerated** (BOM, CPL, Gerbers). BOM: 1 FAIL = L1 stock (above). Pin audit and placement fits agree.
**Gates after everything:** kicad_check (ERC/DRC 0 new, unconnected 0, parity 0), netlist_check, design_calcs,
sim_vs_netlist, height: all PASS. kagiboy software loop (ROM build, tsc, web build, smoke): all PASS.

## 2026-10-15 No Croco credit on the board (Hazy)
Hazy: the base design is already credited in the WiFi cart repo, so the kagiboy board and docs don't repeat it.
- Back silk: "based on Croco Cartridge V2.1 by shilga" removed. The back now carries only the kagiboy logo,
  "kagiboy wallet / Rev A 10/2026 / RP2350B+SE050E2", `github.com/hazy2go/kagiboy` and JLC's order-number marker.
- Docs: README, `docs/hardware.md`, `hardware/cart/README.md`, `hw/wallet/README.md` point to the WiFi cart repo.
- `fab/ORDER.md` rewritten for this board: hold points, the wallet parts in the preview checklist (U110, U111,
  L1 polarity), and the HyperRAM, microSD and RTC lines dropped.
- Kept, as CERN-OHL-P v2 requires: the licence file and the upstream notices inside the design source
  (schematic sheets). Internal footprint-library names (`CrocoV2:`) are not printed and stay.
- Gerbers regenerated and zipped (`fab/kagiboy-cart-RevA-gerbers.zip`, 16 files). Gate: PASS (0 new).
- The submitted Colosseum state is tagged `colosseum-submission` (c20ffd3) on GitHub.

## 2026-10-15 Firmware: the bus on this board, simulated and built
- **Board facts for the firmware:**
  - CLK/RD/CS/A0-A15 on GPIO17-35, straight into the RP2350; D0-D7 on GPIO36-43 through the TXB0108.
  - No /WR. GPIO44 high enables the shifter. GPIO45 high holds the Game Boy in reset.
  - These match the pin map in the schematic netlist. The polarities were read from the Croco firmware, facts
    only, since that code is GPL.
- **Simulation:** `hardware/sim` gained this pin map and a /RD-based write program. Real ROM traffic at 150 MHz:
  83.0 ns early-latch margin and 0 errors over worst, best and 12 random corners (`docs/hardware-sim.md`).
- **Firmware:** `firmware/rp2350/cart` (Embassy) serves the bus with those programs:
  - PIO with two chained DMA channels for reads, and a DMA ring for writes.
  - It holds the Game Boy in reset until the bus is up.
  - It builds for thumbv8m: about 206 KB of flash and 197 KB of RAM.
- **Found while building it:** embassy-rp 0.10 writes the PIO `jmp pin` as an absolute GPIO number. With
  GPIOBASE=16 that would make the programs test A14 instead of /RD, so the firmware sets EXECCTRL itself.
- **Assembler check:** the PIO programs assemble to identical words with pio-parser (the firmware's) and Adafruit's
  pioasm.

## 2026-10-16: JLC manufacturability check

The gates compared DRC against the WiFi board's baseline ("0 new"), which hid anything inherited. New gate
`verify/jlc_check.py` runs KiCad's DRC with JLC's published 6-layer limits instead. Before the fixes it found:
- 24 GND stitching vias along the top edge at 0.190 mm from the outline (JLC: 0.2 mm). Moved 0.06 mm inward -> 0.25 mm.
- The GND planes on B.Cu and In1 came within 0.116 mm of the bottom-left corner: the board's edge-clearance rule was
  0.025 mm. Rule set to 0.2 mm, planes refilled (kicad-cli --refill-zones). The edge connector's fingers must reach
  the edge: `GameboyCartridgeV2.1.kicad_dru` exempts J5.
- The repo URL on the back was 0.8 mm text (JLC minimum 1.0 mm). Now 1.0 mm.
All three came from the imported WiFi Rev B board (the via row and the rule) or from us (the URL). The WiFi board
has the same via row and edge rule.

What remains at JLC limits sits only inside three footprints kept from Croco V2.1, checked geometrically:
- J5: each no-net copper shape is the finger of exactly one pin (no shape touches two nets).
- SW1: the printed button is two separate combs (BUTTON: 9 pieces, GND: 11 pieces) with no copper joining them.
- J1: GCT's USB-C land pattern (0.19 mm pad to NPTH peg).
The 199 mask "bridges" are all on J5 and SW1, which are exposed contacts. Silkscreen text under 1.0 mm: Croco's pin
labels (0.6 mm) and the JLC order-number field. Gerbers regenerated, renders updated.
Re-run after the fixes: kicad_check, netlist_check, design_calcs, sim_vs_netlist, height, route audit, pin audit,
CPL (unchanged), power audits, bus simulation.
