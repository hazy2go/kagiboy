# kagiboy radio (ESP32-C3)

MIT. The cartridge's Bluetooth LE side: one GATT service for the paired phone, and the SPI-slave half of the link
to the RP2350 that holds the wallet. It passes the phone link's messages through unchanged and never sees keys or
PINs. Spec: [docs/phone-link.md](../../docs/phone-link.md).

| Path | What |
|---|---|
| `components/wallet_link` | The SPI link, ESP half (plain C, no ESP-IDF): the code that ships, also built on the host by `firmware/rp2350/core/tests/spi_link.rs` |
| `wallet/` | The ESP-IDF app: NimBLE service (`ble.c`), SPI slave (`link.c`), power loop (`power.c`) on the WiFi cartridge's power manager (`hardware/cart/firmware/esp32c3/components/power_mgr`) |
| `test/wl_host.c` | Drives `wallet_link` over stdin for the Rust test |

Build (ESP-IDF 5.5.1):
```sh
cd wallet && idf.py set-target esp32c3 && idf.py build
idf.py -p /dev/cu.usbmodem* flash monitor   # over the cart's USB-C (native USB Serial/JTAG)
```

Not yet run on hardware: the board isn't built. The Bluetooth link is unencrypted at the BLE layer; the wallet pairs
the phone itself (see the spec's Security section).
