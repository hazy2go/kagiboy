# JLCPCB order: kagiboy wallet cartridge, Rev A

**Not ready to order.** Hold points (details in `../../../LOGBOOK.md`):
1. **L1 out of stock at JLC** (4 left, need 10): the RP2350 core-regulator inductor AOTA-B201610S3R3-101-T
   (C42411119), also out at LCSC (2026-10-15). **Keep this exact part:** the RP2350 datasheet (6.3.8.2-6.3.8.3)
   requires a fully shielded, polarity-marked 3.3 uH inductor and recommends this one, because the regulator is
   sensitive to the inductor's orientation and roll-off. Generic 2016 3.3 uH parts have no polarity mark.
   Wait for JLC to restock, or pre-order ~10 through JLC (DigiKey ~26k and Mouser ~14k in stock, about $0.21 each).
2. The radio and power stage are the WiFi cart's. Its bench tests still apply: ESP32-C3 calibration time and
   antenna RSSI inside the shell (hazy2go/wifi-game-boy-cartridge, `hw/rev-b/fab/ORDER.md`).
3. Firmware: the wallet firmware (RP2350 bus + wallet, ESP32-C3 Bluetooth) is not written yet.

## Files (this folder)
| file | upload as |
|---|---|
| `kagiboy-cart-RevA-gerbers.zip` | Gerber file (13 Gerber layers + PTH/NPTH Excellon drill, mm, absolute origin) |
| `GameboyCartridgeV2.1-BOM-JLC.csv` | BOM (Comment, Designator, Footprint, LCSC Part #); DNP parts (D4-D8, R1) are left out |
| `GameboyCartridgeV2.1-CPL-JLC.csv` | CPL / pick and place (Designator, Mid X, Mid Y, Layer, Rotation); all parts on top |
| `bom_check.txt` | live JLC library check: every part exists, package matches the footprint, value matches, stock covers 5 boards |
| `cpl_check.txt` | rotation/offset of every part derived from the footprint JLC will place (matched pad by pad) |

Regenerate (from `hw/wallet`):
- `tools/make_bom.py GameboyCartridgeV2.1.kicad_sch fab`
- `tools/make_cpl.py GameboyCartridgeV2.1.kicad_pcb fab/GameboyCartridgeV2.1-BOM-JLC.csv fab/GameboyCartridgeV2.1-CPL-JLC.csv --report fab/cpl_check.txt`
- Gerbers: `kicad-cli pcb export gerbers --no-x2 --no-netlist --subtract-soldermask --check-zones` (the 13 layers)
- Drill: `kicad-cli pcb export drill --format excellon --excellon-separate-th`

## PCB options
| option | value | why |
|---|---|---|
| Layers | **6** | |
| Dimensions | 52.95 x 61.34 mm (read from the Gerbers) | |
| PCB qty | 5 | |
| Thickness | **0.8 mm** | fits the cartridge slot |
| Impedance control / stackup | **Yes, JLC06081H-7628** | the stackup the layout was designed on (F.Cu-In1 0.2104 mm), so the USB and QSPI routing keeps its impedance |
| Via covering | **Epoxy filled & capped** (POFV) | 49 vias touch or sit inside SMD pads (RP2350 exposed pad, SE050 centre pad, LIS3DH and 0402 pads, plane stitching); they must be filled or solder wicks away. Free on JLC 6-layer |
| Min via hole / diameter | 0.15 mm / 0.25 mm (board minimum used: 0.15 / 0.30) | |
| Surface finish | **ENIG** | edge-connector fingers and fine-pitch parts |
| Gold fingers | No (ENIG covers them) | |
| Remove order number | **Specify a location** (the `JLCJLCJLCJLC` marker on the back) | keeps the number off the front |
| Solder mask / silkscreen | any colour (renders: green / white) | |

## Assembly options (PCBA)
| option | value |
|---|---|
| PCBA type | Standard (0.4 mm QFNs and an LGA need standard, not economic) |
| Assembly side | Top |
| PCBA qty | 5 (minimum 2) |
| Tooling holes | added by JLC |
| Confirm parts placement | **Yes**: check the photos/preview below before production |

## Before paying: check in JLC's placement preview
The CPL already carries the corrections JLC's own footprints need (e.g. USB-C J1 shifted 1.30 mm, ESP32-C3 module
U104 0.70 mm; SOT/SOIC/QFN rotations), each derived pad by pad, none guessed. Still look at these in the preview,
pin 1 / polarity marks:
- U3 RP2350 (QFN-80), **U110 SE050 (QFN-20, pin 1 top left)**, **U111 LIS3DH (LGA-16)**, U104 ESP32-C3 module
  (antenna end to the board edge), U103 buck-boost, U107 USB hub
- polarised: **L1 (polarity mark, RP2350 datasheet Figure 26)**, D1 LED, D2/D3/D101-D104 diodes (cathode band),
  C105-C107 tantalum (+), Q1/Q101/Q102/U109 (SOT), Y1/Y101 crystals
- J1 USB-C sits on its pads and faces the board edge

## Not on the board (buy separately)
- 2.4 GHz stick-on FPC antenna with an **I-PEX MHF III ("IPEX3", = Hirose W.FL)** plug, not U.FL: the
  ESP32-C3-MINI-1U uses the smaller connector (datasheet v2.2, 10.3). Bluetooth uses the same antenna.
  Pick: CDEBYTE/Ebyte TX2400-FPC3-2509 (25 x 9 mm). Goes inside the shell at the grip end.
- Cartridge shell: a standard DMG shell with a cut-out at the top edge for the USB-C plug (up to 6.5 mm). Every
  other part is within the 3.3 mm label-half clearance (`tools/height_check.py`).

## Part changes vs the base design (stock, 2026-10-14/15)
- U2 flash W25Q16JVSSIQ (0 stock) -> **W25Q128JVSIQ** C97521 (same family/footprint, JLC basic part)
- U1 USBLC6-2P6: same part, in-stock listing C2827693
- R101/R102 PR1 divider: 5.1k/2.0k -> **1.3k C25866 / 510 C25123**: same USB threshold, tolerates 1.78 mA of
  D3 leakage instead of 453 uA
- Wallet: HyperRAM, microSD and RTC removed; SE050E2 C5190917 and LIS3DHTR C15134 added with their passives
