# kagiboy cartridge board (wallet variant)

Work in progress on branch `cart-hw`. Not ordered or built.

Base: the WiFi Game Boy Cartridge Rev B board, imported unmodified from
[hazy2go/wifi-game-boy-cartridge](https://github.com/hazy2go/wifi-game-boy-cartridge) at commit `326be60`
(`hw/rev-b` → `hw/wallet`, plus `verify/`, `docs/design/`, `sim/power/`, `sim/models/`).
That board is itself [Croco Cartridge V2.1](https://github.com/shilga/rp-gameboy-cartridge-hw) by shilga
(CERN-OHL-P v2, `hw/wallet/LICENSE-CERN-OHL-P.md`) plus an ESP32-C3 radio and a console-safe power stage.

The first commit of this folder is the untouched import, so every later diff is the wallet change.

Wallet changes (done 2026-10-15, details in `LOGBOOK.md`):
- Removed: HyperRAM (U4), microSD (J2), RTC (U5, Y2), with their passives. DNP and off the board, still in
  the schematic.
- Added: NXP SE050E2 secure element (U110) on I2C1, RP2350 GPIO6/7, enable on GPIO10 (Deep Power-down
  wiring). LIS3DH accelerometer (U111) on I2C0, GPIO8/9, INT1 on GPIO11.
- Radio and power stage unchanged: the ESP32-C3 does Bluetooth LE to the phone, isolated from the wallet logic
  on its own chip.
- All gates pass. Not ready to order: L1 is out of stock at JLC, and there is no firmware yet
  (`hw/wallet/fab/ORDER.md`).

Gates (run from this folder): `python3 verify/kicad_check.py`, `verify/netlist_check.py`,
`verify/design_calcs.py`, `verify/sim_vs_netlist.py`.
