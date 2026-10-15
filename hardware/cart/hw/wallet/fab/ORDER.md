# JLCPCB order: kagiboy wallet cartridge (wallet variant of WiFi cart Rev B)

**NOT READY TO ORDER.** Work in progress on branch `cart-hw`; see `../../../LOGBOOK.md`.
Open before any order:
1. **L1 out of stock at JLC** (4 left, need 10): Croco's RP2350 core-regulator inductor AOTA-B201610S3R3-101-T (C42411119), also out at LCSC (2026-10-15). **Keep this exact part:** the RP2350 datasheet (6.3.8.2-6.3.8.3) requires a fully shielded, polarity-marked 3.3 uH inductor and recommends this one, because the regulator is sensitive to the inductor's orientation and roll-off. Generic 2016 3.3 uH parts have no polarity mark. Either wait for JLC to restock, or pre-order ~10 through JLC (DigiKey ~26k and Mouser ~14k in stock, about $0.21 each). The WiFi cart's order has the same hold.
2. The WiFi cart's own hold points still apply to the shared radio and power stage: ESP32-C3 calibration time, antenna RSSI in the shell (see the WiFi repo's ORDER.md).
3. Firmware: none of the wallet firmware (RP2350 bus + wallet logic, ESP32-C3 BLE) exists for this board yet.

Below: the WiFi cart's order notes, kept for the settings (stackup, finish, preview checks). The file names are the same; the BOM/CPL/Gerbers in this folder are the wallet board's. No zip has been made yet.

## Files (this folder)
| file | upload as |
|---|---|
| `GameboyCartridgeV2.1-RevB-gerbers.zip` | Gerber file (13 Gerber layers + PTH/NPTH Excellon drill, mm, absolute origin) |
| `GameboyCartridgeV2.1-BOM-JLC.csv` | BOM (Comment, Designator, Footprint, LCSC Part #); DNP parts (D4-D8, R1, R17) are left out |
| `GameboyCartridgeV2.1-CPL-JLC.csv` | CPL / pick and place (Designator, Mid X, Mid Y, Layer, Rotation); all parts on top |
| `bom_check.txt` | live JLC library check: every part exists, package matches the footprint, value matches, stock covers 5 boards |
| `cpl_check.txt` | rotation/offset of every part derived from the footprint JLC will place (matched pad by pad) |

Regenerate: `tools/make_bom.py GameboyCartridgeV2.1.kicad_sch fab`, `tools/make_cpl.py GameboyCartridgeV2.1.kicad_pcb fab/...-BOM-JLC.csv fab/...-CPL-JLC.csv`, Gerbers/drill with `kicad-cli` as in LOGBOOK.

## PCB options
| option | value | why |
|---|---|---|
| Layers | **6** | |
| Dimensions | 52.95 x 61.34 mm (read from the Gerbers) | |
| PCB qty | 5 | |
| Thickness | **0.8 mm** | fits the cartridge slot (Croco's author recommends 0.8 mm) |
| Impedance control / stackup | **Yes, JLC06081H-7628** | the stackup the layout was designed on: F.Cu-In1 0.2104 mm, same as Croco's 4-layer board, so its USB/HyperRAM/QSPI routing keeps its impedance (LOGBOOK) |
| Via covering | **Epoxy filled & capped** (POFV) | 49 vias touch or sit inside SMD pads (RP2350 exposed pad, SE050 centre pad, LIS3DH and 0402 pads, plane stitching); they must be filled or solder wicks away. Free on JLC 6-layer |
| Min via hole / diameter | 0.15 mm / 0.25 mm (board minimum used: 0.15 / 0.30) | |
| Surface finish | **ENIG** | edge-connector fingers and fine-pitch parts; Croco's recommendation |
| Gold fingers | No (ENIG covers them) | as Croco |
| Remove order number | **Specify a location** (the `JLCJLCJLCJLC` marker on the back) | keeps the number off the front |
| Solder mask / silkscreen | any colour (Croco: green / white) | |

## Assembly options (PCBA)
| option | value |
|---|---|
| PCBA type | Standard (BGA HyperRAM and 0.4 mm QFN need standard, not economic) |
| Assembly side | Top |
| PCBA qty | 5 (minimum 2) |
| Tooling holes | added by JLC |
| Confirm parts placement | **Yes**: check the photos/preview below before production |

## Before paying: check in JLC's placement preview
The CPL already carries the corrections JLC's own footprints need (e.g. USB-C J1 shifted 1.30 mm, ESP32-C3 module U104 0.70 mm, TPS63802 U103 0.075 mm; SOT/SOIC/MSOP/QFN rotations), each derived pad-by-pad, none guessed. Still look at these in the preview, pin 1 / polarity marks:
- U3 RP2350 (QFN-80), U4 HyperRAM (BGA, ball A1), U104 ESP32-C3 module (antenna end to the board edge), U103 buck-boost, U107 USB hub
- polarised: D1 LED, D2/D3/D101-D104 diodes (cathode band), C105-C107 tantalum (+), Q1/Q101/Q102/U109 (SOT), Y1/Y101 crystals
- J1 USB-C and J2 microSD sit on their pads and face the board edge

## Not on the board (buy separately)
- 2.4 GHz stick-on FPC antenna with an **I-PEX MHF III ("IPEX3" / "3rd generation", = Hirose W.FL)** plug. The ESP32-C3-MINI-1U uses this smaller connector (datasheet v2.2, 10.3), **not U.FL/IPEX1**: a U.FL antenna does not plug in. Goes inside the shell at the grip end (LOGBOOK 18:45). Not common in Japanese shops; AliExpress sells them (search "IPEX3 2.4G FPC antenna" / "MHF3"); prefer small ones (<= ~35 x 10 mm). **Pick (2026-10-14): CDEBYTE/Ebyte TX2400-FPC3-2509** (25 x 9 mm, IPEX3, 10 pcs about 663 yen, https://ja.aliexpress.com/item/1005012574238566.html, choose variant "TX2400-FPC3-2509"). A buyer review confirms it works on an ESP32-S3-MINI-1U, which uses the same connector.
- Cartridge shell: a standard DMG shell (the height checks used Printables #804399). The old `legacy/3dprint/` shell was made for the original PCB and has not been checked against Rev B. **A stock DMG shell needs a cut-out at the top edge for the USB-C plug (up to 6.5 mm), as with Croco.** The receptacle J1 is 3.31 mm (+-0.15) above the board, over the 3.3 mm low end of the label-half clearance, and the cut-out clears it. Every other part is <= 2.55 mm (`tools/height_check.py`, LOGBOOK 2026-10-15).

## Part changes vs Croco's schematic (2026-10-14, stock)
- U2 flash W25Q16JVSSIQ (0 stock) -> **W25Q128JVSIQ** C97521 (same family/footprint, 16 MB, JLC basic part)
- U4 HyperRAM W956A8MBYA5I (0 stock) -> **ISSI IS66WVH8M8BLL-100B1LI** C1349096 (3.0 V, 64 Mb, identical HyperBus ball map, checked ball by ball; 100 MHz max vs ~22 MHz used by Croco's firmware)
- U1 USBLC6-2P6: same part, in-stock listing C2827693
- R101/R102 PR1 divider (2026-10-14): 5.1k/2.0k -> **1.3k C25866 (extended) / 510 C25123**. Same USB threshold; it tolerates 1.78 mA of D3 leakage instead of 453 uA (the SM5817PL can leak ~0.6 mA at 75 C). One more feeder fee.
- C27/C28 RTC crystal load caps: schematic said 4.3 pF but linked a 15 pF part; now 4.3 pF C59526 (MCP7951x datasheet eq. 5-1 with the 7 pF crystal)
