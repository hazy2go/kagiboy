# kagiboy cartridge board (wallet variant)

Work in progress on branch `cart-hw`. Not ordered or built.

Base: the WiFi Game Boy Cartridge Rev B board, imported unmodified from
[hazy2go/wifi-game-boy-cartridge](https://github.com/hazy2go/wifi-game-boy-cartridge) at commit `326be60`
(`hw/rev-b` → `hw/wallet`, plus `verify/`, `docs/design/`, `sim/power/`, `sim/models/`).
That board is itself [Croco Cartridge V2.1](https://github.com/shilga/rp-gameboy-cartridge-hw) by shilga
(CERN-OHL-P v2, `hw/wallet/LICENSE-CERN-OHL-P.md`) plus an ESP32-C3 radio and a console-safe power stage.

The first commit of this folder is the untouched import, so every later diff is the wallet change.

Planned wallet changes:
- Remove: HyperRAM (U4), microSD (J2), RTC (U5, Y2, coin cell).
- Add: NXP SE050E2 secure element and LIS3DH accelerometer on I²C1 (RP2350 GPIO6 SDA / GPIO7 SCL, the
  former HyperRAM RWDS/CLK traces).
- Radio: the ESP32-C3 does Bluetooth LE to the phone, isolated from the wallet logic on its own chip.

Gates (run from this folder): `python3 verify/kicad_check.py`, `verify/netlist_check.py`,
`verify/design_calcs.py`, `verify/sim_vs_netlist.py`.
