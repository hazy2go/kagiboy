# Cartridge bus protocol

The Game Boy never touches keys. It is the trusted screen and buttons. All
key material lives in the cartridge's chip (microcontroller + secure element on
real hardware, `web/src/chip/` in the demo).

The two sides talk through a 256-byte mailbox.

- **Real cartridge** (`make hw`): the Game Boy writes its half to the external RAM
  window (`0xA000`), where a normal cartridge's save RAM sits, and reads the chip's
  half through ROM space it leaves empty (`0x7F00`). The cartridge MCU answers both
  from SRAM. Every read is then a plain ROM read, which the cartridge serves fastest
  (see [hardware-sim.md](hardware-sim.md)).
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
| `0xF3` | 1 | chip | what waits for the owner: `1` a sign request, `2` a phone asking to pair, `0` nothing |
| `0xF4` | 1 | chip | `1` once a phone is paired with this wallet; the home screen asks you to pair until then |

One writer per byte, so the two sides never overwrite each other. The Game Boy
waits until `resp_seq == req_seq`, then copies the response out. Replies that
take time (signing) are tagged with the power cycle they belong to, so a reply
that finishes after the Game Boy restarts is dropped.

## What the phone can and can't put on the screen

The phone sends balances as numbers (lamports, wei) and transaction status as
fixed codes. The chip turns those into text. Transactions are snapshotted when
requested; the chip decodes and signs the snapshot, so editing the request
afterwards changes nothing.

## EVM networks

One key and one address (`m/44'/60'/0'/0/0`) serve every EVM network. The chip
signs only for chain ids on its allowlist (`web/src/chip/networks.ts`), and the
network on the approve screen comes from the transaction's own `chainId`, not
from the phone's picker.

| Chain id | Network | Coin | Approve screen |
|---|---|---|---|
| 11155111 | Ethereum Sepolia | ETH | `ETHEREUM` |
| 84532 | Base Sepolia | ETH | `BASE` |
| 421614 | Arbitrum Sepolia | ETH | `ARBITRUM` |
| 998 | HyperEVM testnet | HYPE | `HYPEREVM` |
| 46630 | Robinhood Chain testnet | ETH | `ROBINHOOD CHAIN` |

Other rules for an EVM request: EIP-1559 only, a `to` address, empty `data`, no
access list, gas limit between 21000 and 600000 (rollups such as Arbitrum and
Robinhood Chain count their L1 cost in gas, so a plain transfer can need more
than 21000), and `gas × maxFeePerGas` at most 0.01 of the network's coin. The
fee line shows that product as `MAX …`, rounded up.

On OP-stack chains (Base) the L1 data fee is charged on top of
`gas × maxFeePerGas`, so `MAX` is not a strict cap there. Today that extra is
negligible (measured upper bound around 2×10⁻¹⁶ ETH on Base Sepolia).

Solana transactions don't name their cluster. The chip signs one plain System
transfer from its own key and labels it `SOLANA`; the phone uses devnet.

## Commands

| Cmd | Name | Request | Response |
|---|---|---|---|
| `0x01` | PING | | `data[0]` = wallet state: 0 none, 1 locked, 2 unlocked |
| `0x02` | ENTROPY | raw bytes (button timings, accelerometer samples) | `data[0..3]` = pool fingerprint |
| `0x03` | CREATE | | 12 words, space separated |
| `0x04` | SET_PIN | 4 digits | |
| `0x05` | UNLOCK | 4 digits | status 0 ok, 1 wrong (`data[0]` = tries left), 2 wiped, 3 no wallet |
| `0x06` | ACCOUNT | `arg` = chain (0 Solana, 1 EVM) | `address\0balance\0name\0`. `balance` is formatted by the chip from base units (at most 18 characters, e.g. `0.5000 HYPE`, `-- ETH` while unknown). `name` is the network shown on the Game Boy's home screen: `Solana`, or for EVM the network the phone has selected (`Ethereum`, `Base`, `Arbitrum`, `HyperEVM`, `Robinhood`) |
| `0x07` | PENDING | | `chain, to\0amount\0fee\0network\0`, all decoded by the chip from its own snapshot of the request (status 1 = nothing pending or no paired phone). A swap reports chain 1 and fills the fields as SEND amount, fee, `SWAP <FROM CHAIN>` and a 3-row `GET AT LEAST <min> <token> ON <chain>` box |
| `0x08` | SIGN | `arg` = 1 approve, 0 reject | status 0 signed, 1 could not sign (nothing was signed) |
| `0x09` | WIPE | | |
| `0x0A` | TXSTATUS | | `state\0detail\0`: state is SIGNED, BROADCAST, CONFIRMED, FAILED, UNKNOWN or DEMO (a swap the demo build signed but never sends; the phone can't change it); CONFIRMED needs the hash the chip signed; detail is a shortened hash or a fixed reason. Both are chosen by the chip from codes; the phone never sends text |
| `0x0B` | LOCK | | |
| `0x0C` | QR | `arg` = chain | `size`, then `size×size` bits row by row (1 = dark). 29×29 for both address types; the ROM draws it with 16 tiles, one per 2×2 block |
| `0x0D` | WORDS | word prefix (lowercase) | `count`, then per suggestion a 2-byte word index and the word, 0-terminated (max 4, exact match first) |
| `0x0E` | RESTORE | 12 × 2-byte word indices | status 0 ok, 2 checksum failed |
| `0x0F` | NETWORK | arg 1 next, 2 previous | switches the EVM network on the home card (allowlist order, wraps); status 0 ok, 1 locked or bad arg. The cartridge tells the phone, which follows |
| `0x10` | PAIR | arg 0 get code, 1 accept (data: the 6 digits the Game Boy showed), 2 refuse | arg 0 replies the 6-digit code as text; 1 stores the phone as paired, only if the digits match the waiting request; status 1 when no pairing waits. One pairing at a time, and it lapses after 60 s. Once a phone is paired, a new one may only ask while the owner has opened the window with PHONE arg 2 |
| `0x11` | PHONE | arg 0 info, 1 forget, 2 open pairing window (60 s), 3 close it | arg 0 replies `name\0id\0date\0` of the paired phone (status 1 if none); 1 forgets it and drops any request it left waiting |

Randomness: the chip's hardware RNG is the source. Button timings and
accelerometer samples are hashed into the pool on top of it; they add to it,
they do not replace it.

## Pairing

The mailbox PENDING byte says what waits for the owner: `1` a sign request, `2` a phone asking to pair.
Pairing is Bluetooth numeric comparison done on the Game Boy: the phone and the Game Boy show the same
random 6-digit code, and only an A press on the console lets the phone in. A phone may only ask while
the Game Boy is listening: on its "Pair your phone!" screen, or in the minute after Phone > Pair new phone. The pairing belongs to the
wallet, so wiping or restoring forgets it.

## Swap requests

The phone can ask the cartridge to sign a swap quoted by SODAX: source and destination chain, the sell
token (by contract address or mint) and amount, the buy token and the least the user accepts (after every
fee), and a deadline within the next hour. The phone never sends symbols, decimals or fees: the chip keeps
its own list of the tokens it swaps (`web/src/chip/tokens.ts`, generated from SODAX's list) and refuses any
other, works out the 0.1% partner fee and 0.1% solver fee itself, always sends the bought coins to its own
address on the destination chain, and signs
`sha256("kagiboy-swap-v2|srcChain|sellToken|decimals|amount|dstChain|buyToken|decimals|min|fees|partnerBps|partnerWallet|deadline|recipient")`
with the key of the chain the coins leave from (chains are SODAX's mainnet names). This is a preview: SODAX
doesn't check this signature, so before swaps go live the cartridge must decode and sign the real SODAX
intent transaction instead.
