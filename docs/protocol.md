# Cartridge bus protocol

The Game Boy never touches keys. It is the trusted screen and buttons. All
key material lives in the cartridge's chip (microcontroller + secure element on
real hardware, `web/src/chip/` in the demo).

The two sides talk through a 256-byte mailbox.

- **Real cartridge:** the cartridge MCU answers reads/writes on the external RAM
  window (`0xA000`), exactly where a normal cartridge's save RAM sits.
- **Demo:** the mailbox lives in work RAM at `0xD800` so any emulator works; the
  chip reads and writes it between frames.

## Layout (offsets from `0xD800`)

| Offset | Size | Writer | Field |
|---|---|---|---|
| `0x00` | 1 | Game Boy | `req_seq`: bumped last, after the request is written |
| `0x01` | 1 | Game Boy | `cmd` |
| `0x02` | 1 | Game Boy | `req_len` |
| `0x03` | 1 | Game Boy | `arg` |
| `0x04` | 60 | Game Boy | request data |
| `0x40` | 1 | chip | `resp_seq`: set to `req_seq` once the response is written |
| `0x41` | 1 | chip | `status` (0 = ok) |
| `0x42` | 1 | chip | `resp_len` |
| `0x44` | 171 | chip | response data |
| `0xF0` | 1 | chip | `0xC7` while the chip is powered (presence) |
| `0xF1` | 1 | chip | accelerometer X, signed |
| `0xF2` | 1 | chip | accelerometer Y, signed |
| `0xF3` | 1 | chip | `1` while the phone has a transaction waiting for approval |

One writer per byte, so there are no races. The Game Boy waits until
`resp_seq == req_seq`, then copies the response out.

## Commands

| Cmd | Name | Request | Response |
|---|---|---|---|
| `0x01` | PING | | `data[0]` = wallet state: 0 none, 1 locked, 2 unlocked |
| `0x02` | ENTROPY | raw bytes (button timings, accelerometer samples) | `data[0..3]` = pool fingerprint |
| `0x03` | CREATE | | 12 words, space separated |
| `0x04` | SET_PIN | 4 digits | |
| `0x05` | UNLOCK | 4 digits | status 0 ok, 1 wrong (`data[0]` = tries left), 2 wiped |
| `0x06` | ACCOUNT | `arg` = chain (0 Solana, 1 EVM) | `address\0balance\0` |
| `0x07` | PENDING | | `chain, to\0amount\0` (status 1 = nothing pending) |
| `0x08` | SIGN | `arg` = 1 approve, 0 reject | |
| `0x09` | WIPE | | |
| `0x0A` | TXSTATUS | | `state\0short-signature\0` |
| `0x0B` | LOCK | | |

Randomness: the chip's hardware RNG is the source. Button timings and
accelerometer samples are hashed into the pool on top of it; they add to it,
they do not replace it.
