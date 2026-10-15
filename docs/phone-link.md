# Phone link

How the companion app talks to the cartridge. The Game Boy side is [protocol.md](protocol.md).

```
phone app ──Bluetooth LE──► ESP32-C3 ──SPI──► RP2350 (wallet) ──I2C──► SE050 (keys, PIN)
 RemoteChip                 passes messages    PhoneServer + Chip
 web/src/chip/link.ts       through unchanged  firmware/rp2350/core/src/phone.rs
 web/src/chip/ble.ts        firmware/esp32c3   firmware/rp2350/core/src/link.rs
```

The phone can only ask. Every signature is approved with the Game Boy's buttons, on a screen the
cartridge draws from its own decoding of the request. The radio never sees a key or a PIN.

## Messages

At most 240 bytes each way. Numbers are little-endian. `str` is a length byte and UTF-8 text, and
length `0xFF` means "none".

```
request  [op] [tag] [body]
reply    [op | 0x80] [tag] [status] [body]      status 0 ok, 1 refused (body = the reason as text), 2 malformed
```

`tag` is chosen by the phone (1-255, never 0). If no reply comes, the phone sends the same bytes
again. The cartridge answers a repeat of its last message from memory, without doing it twice. A
repeated `SIGN` therefore can't queue a second request, and a repeated `PAIR` can't refuse itself.

| op | name | body | reply body |
|---|---|---|---|
| 01 | STATUS | phone clock, unix ms (u64) | see below |
| 02 | PAIR | phone name (str) | the 6-digit code (ASCII) |
| 03 | UNPAIR | | |
| 04 | NETWORK | EVM chain id (u64) | |
| 05 | BALANCE | chain (0 Solana, 1 EVM), has (u8), base units (u128) | |
| 06 | TXSTATUS | request id (u32), state (str), hash (str), reason (str) | |
| 07 | PUT | offset (u16), bytes | |
| 08 | SIGN | kind 0 Solana message / 1 EIP-1559 wire bytes: length (u16), from the PUT buffer | request id (u32) |
|    |      | kind 2 swap: src, dst (u64), sell amount, min receive (u128), deadline (i64), sell token, buy token (str) | |
| 09 | RESULT | request id (u32) | kind: 0 not yet, 1 Solana / 2 EVM (length u16, then GET), 3 swap (signature, digest: str), 4 refused (reason: str) |
| 0A | GET | offset (u16) | up to 232 bytes of the signed transaction |

A transaction longer than one message goes up in 232-byte `PUT` chunks into a 2 KB buffer. `SIGN`
then names the length. The signed transaction comes back the same way, through `GET`. `RESULT`
for the request last handed out answers again, in case its reply was lost.

**STATUS reply:** state (0 no wallet, 1 locked, 2 unlocked), flags (bit 0 paired, 1 a request is
waiting on the Game Boy, 2 the pairing window is open, 3 addresses follow, 4 a pairing code
follows), how the last pairing ended (0 -, 1 accepted, 2 refused, 3 lapsed), EVM network (u64).
Then, by flag: the code (6 ASCII), the Solana public key (32) and EVM address (20), and the paired
phone (name, id: str; since: u64). The phone polls it every 250 ms. The cartridge takes the time
from it, because it has no clock of its own.

Everything the chip checks stays in the chip: the refusal texts are the browser chip's, word for
word.

## Bluetooth

The ESP32-C3 advertises `KAGIBOY-XXXX` with one service, `6b616769-626f-7900-0000-000000000001`
("kagiboy"):

- **RX** `…0002` (write): one whole request per write. Longer writes are reassembled by the stack.
  A full queue answers with an ATT error and the phone sends again.
- **TX** `…0003` (notify): the reply, in pieces that fit the connection's MTU. Byte 0 of each piece
  is `0x80` if more follow and `0x00` on the last one.

One phone at a time. When it disconnects, its queued messages are dropped. The ESP takes a new boot
id, so the RP2350 also drops a reply that was on its way.

**Security.** The Bluetooth link itself is not encrypted or bonded. The wallet does its own pairing:
the phone asks, both screens show the same 6-digit code, and the owner accepts on the Game Boy. This
only works while the owner has the pairing window open. Until then the cartridge refuses requests,
balances and network changes from that phone.

That is the trust model the browser demo already has. Someone in radio range can watch the traffic,
which holds public keys, balances and signed transactions (all public once broadcast). Two gaps
remain:

- An attacker in range can send requests too. Each request still needs the owner's button press on
  a screen the cartridge drew, and only one waits at a time.
- An attacker could spoof STATUS polls and see the lock state.

LE Secure Connections with the Game Boy as the display is the planned hardening (ROADMAP).

## SPI link (RP2350 ↔ ESP32-C3), wallet profile

This is the WiFi cartridge's SPI link v1 wire format: SPI mode 0, 8 MHz, CS on GPIO46, 12-byte
headers with a magic byte and CRC-16/CCITT-FALSE, a session byte, 4-byte multiples, and state
instead of messages, because there is no IRQ line. The direction is reversed: the ESP offers
messages and the RP2350 fetches and answers them. Version byte 2.

**Master header (MOSI):**

| Byte | Meaning |
|---|---|
| 0 | magic `C5` |
| 1 | type: 0 POLL, 1 REPLY |
| 2 | flags: bit 0 = bytes 3 and 5 are valid |
| 3 | ack: the seq of the last message taken |
| 4 | the seq a REPLY answers |
| 5 | the ESP boot id the ack refers to |
| 6 | reply length |
| 7 | session: random, new on every RP2350 boot |
| 8-9 | 0 |
| 10-11 | CRC |

A REPLY carries its body and CRC after the header.

**ESP header (MISO):**

| Byte | Meaning |
|---|---|
| 0 | magic `5C` |
| 1 | flags: bit 0 phone connected, bit 2 MSG, bit 3 ACCEPTED |
| 2 | boot id: random, new on every ESP boot and after a phone disconnects |
| 3 | seq of the offered message |
| 5 | its length |
| 8 | seq of the last reply accepted |
| 9 | version 2 |
| 10-11 | CRC |

With MSG set, the message and its CRC follow the header.

**Master:** a transaction every 1 ms. When MSG shows a seq it hasn't taken, the next POLL is
long enough to carry the body. With a good CRC, the master takes the message (from then on it acks
that seq in every header), answers it, and sends the REPLY every 10 ms until ACCEPTED shows that
seq. It gives up after 2 s. It takes no new message while a reply is pending. A new ESP boot id
means "forget what you took and drop the reply in flight".

**ESP:** messages from the phone queue up (4 deep). The first one is offered until it is acked with
the current boot id. An ack built before the master saw an ESP restart would otherwise drop the
new boot's first message. A REPLY whose seq was already accepted is a repeat and is ignored.
Garbage is ignored. A new session byte (RP2350 restart) resets the reply bookkeeping but keeps the
queue.

On a clean link each message takes three transactions: see it, fetch it, reply. That is 3 ms plus
the wallet's own time.

## Tests

| What | Where |
|---|---|
| The web app's messages and the reference server's replies for every phone call of the three recorded sessions (303 messages, all ops, every pairing outcome), replayed through the Rust `PhoneServer`: identical, with the software vault and with the SE050 behind the Game Boy bus | `cargo test --test phone_link` |
| The same sessions phone → ESP queue → SPI → RP2350 → back, with both halves as they ship (the C half built with the host compiler): identical on a clean link, and with damaged MOSI and MISO, missed transactions and ESP restarts. Every message that reaches the wallet is checked against what the phone sent. Restarts on either side, 240-byte messages, a full queue, damaged bodies | `cargo test --test spi_link` |
| Malformed messages (never a panic), the phone clock, refusals, repeats answered once | `cargo test --test phone_link` |
| The app's `RemoteChip` against the browser chip over a fake Bluetooth link that loses about one message in six and one reply in seven, while a scripted Game Boy approves: pairing (refused, accepted, lapsed), Solana and EVM signatures that verify, a swap, refusals, the network following the Game Boy, balances, unpairing | `pnpm link-loop` |
| The ESP32-C3 app builds for the chip (ESP-IDF 5.5.1, NimBLE) | `idf.py build` in `firmware/esp32c3/wallet` |

Not yet tested on hardware: the Bluetooth service on a real ESP32-C3 and Web Bluetooth against it,
or the SPI link between the two chips on the board.
