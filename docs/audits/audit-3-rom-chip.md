# kagiboy audit #3: ROM + simulated chip (2026-10-08, read-only)

Scope: `rom/src/main.c` (both builds), `web/src/chip/*`, `web/src/phone/phone.ts`, `web/src/app/swap.ts`, `docs/protocol.md`, `docs/hardware.md`, `README.md`, and the fixes claimed in the earlier audits. No source file was changed.

Scratch: `/private/tmp/claude-501/-Users-hazy/b648df4f-4071-4982-b6e9-ee85bb53598d/scratchpad/audit3-rom/`
- `full.mts`: the new headless test (GameBoy + CartChip). It covers 119 screens on both ROMs and writes 39 recorded checks.
- `out/`: the PNGs, `results.txt` and `run.log`.
- `smoke/`: smoke output.

## Build and smoke

- `make` builds cleanly. The only warnings are two benign `gfx.c:97/114 warning 110` (optimizer).
- `make demo` builds cleanly. On top of the same two, `main.c:609-612 warning 126 unreachable code` is expected, because `chip_present()` is the constant 1 in DEMO_CHIP.
- The main ROM uses 18.5 KB of code out of 32 KB. The demo ROM is about 21 KB.
- `wallet.gb` was copied to `web/public` (sha1 `0c920d4c…`), and `kagiboy-demo.gb` to `~/Desktop`.
- `tsx scripts/smoke.ts`: **all checks passed** (37 PNGs).

---

## P0

None. Every path that signs still needs a full hold of A on the Game Boy over a chip-decoded screen. The smoke test and my run confirmed this for sol, evm on all 5 networks, and swaps.

## P1

**P1-1. A second phone can take over a pairing while the Game Boy still shows the first phone's code.**
- **Where:** `chip.ts:206-212` (`requestPairing` replaces `this.pairing` with a new code); `chip.ts:462-479` (`PAIR arg 1` accepts whatever pairing is current); `main.c:1235,1253` (the ROM reads the code once and never checks it again).
- **Repro (`full.mts`, shots 023→025):**
  1. On an unpaired wallet, or with the window open, call `requestPairing("OWNER PHONE")`. The Game Boy shows `441885`.
  2. Call `requestPairing("ATTACKER")`. The chip now holds a new code, but the Game Boy still shows `441885` (shot 024), which matches the owner's phone.
  3. The owner presses A. **Result:** owner gets `false`, attacker gets `true`, and `phone.name = "ATTACKER"`.

  This defeats the numeric comparison that the screen asks the user to make.
- **Fix:**
  - (a) While a pairing is waiting, refuse a new `requestPairing` instead of replacing the first one.
  - (b) Make `PAIR arg 1` carry the 6 code bytes the ROM displayed, and have the chip refuse on a mismatch. This is the same idea as the open "SIGN digest" item (L1).

**P1-2. Forgetting the phone doesn't drop its pending request, so the forgotten phone still gets a signature.**
- **Where:**
  - `chip.ts:490-498` (`PHONE arg 1`) and `chip.ts:217-225` (`unpair()`) clear `paired` but never call `dropPending`.
  - `CMD.SIGN` (`chip.ts:536-546`) doesn't check `paired`.
  - The "Forget phone?" dialog uses plain `wait_press` (`main.c:1454-1456`), so a request can arrive while it is up.
- **Repro (shots 069→072):**
  1. Open Phone, then press SELECT (the "Forget phone?" dialog).
  2. The phone calls `requestSignature`.
  3. Press A to forget. The Game Boy says "IT CAN'T ASK FOR ANYTHING AFTER THIS".
  4. `PENDING` stays at 1, and the approve screen for the forgotten phone's 0.000004 SOL appears (shot 070).
  5. Hold A. **Result:** `approved:true` with `paired:false`, and the screen says "SENT TO YOUR PHONE".
- **Fix:** call `this.dropPending("locked")` (or a new `"unpaired"` reason) in both forget paths. Also refuse `SIGN` and `PENDING` when `!paired`.

## P2

**P2-1. The phone can make a swap that was never broadcast show `CONFIRMED`.**
- **Where:** `chip.ts:268-283`. `setTxStatus` accepts a state with neither hash nor reason, and it doesn't treat `DEMO` as final.
- **Repro (shot 055):** in `result.then`, call `setTxStatus(id,"CONFIRMED")`. That handler runs right after `sign()` sets `DEMO` and before the Game Boy's first poll, so the Game Boy shows "Signed / CONFIRMED" for a demo swap. The same call with no hash also works for sol and evm.
- **Fix:**
  - Refuse any update once `state === "DEMO"`.
  - Require the hash the chip already knows for `BROADCAST` and `CONFIRMED`.
  - Accept `SIGNED` and `DEMO` only from the chip itself.

**P2-2. A new sign request wipes the status of the previous one while the Game Boy is showing it.**
- **Where:** `chip.ts:298` resets `txStatus` in `requestSignature`; `main.c:1203` polls a single global status.
- **Repro (shots 060-061):** approve request N, then the phone sends N+1 right away. `TXSTATUS` returns `"\0\0"`, so the screen goes blank. `setTxStatus(N, CONFIRMED)` is ignored because the ids differ. After 60 s the Game Boy falls back to "STILL CONFIRMING". The phone's own `sending` lock doesn't cover swaps or other callers.
- **Fix:** keep the last *signed* request's status apart from the pending request's id. `TXSTATUS` should report the signed one, and `setTxStatus` should accept updates for that id.

**P2-3. The pairing window can stay open after the Game Boy stops showing it.** The chip window lasts 60 s and the ROM only closes it with `PHONE 3`.
- **Cases:**
  - A sign request cuts into the window: `main.c:1382-1385` returns without `PHONE 3`. Shot 076→077: afterwards a stranger's `requestPairing` is accepted from the home screen.
  - The owner refuses a phone inside the window: `chip.ts:467-478` clears the window only on accept. Shot 080: another phone can ask again at once.
  - `LOCK` (`chip.ts:557-563`) and `reset()` (`chip.ts:309-321`) don't clear `pairWindowUntil`. My test checks LOCK: FAIL.
- **Impact:** the owner still has to press A, but strangers can keep pushing pairing prompts, and every prompt carries P1-1.
- **Fix:**
  - Set `pairWindowUntil = 0` on any `PAIR` answer, on `LOCK`, `reset` and `wipe`, and whenever a sign request is created.
  - In the ROM, send `PHONE 3` on every exit from `pair_window`.

**P2-4. An unpaired cartridge accepts pairing requests from anyone at any time.**
- **Where:** `chip.ts:203`. The window is only required once a phone is paired.
- **Why it matters:**
  - After "Forget phone" the screen says "PAIR A PHONE AGAIN FROM THIS SCREEN", but any phone in range can already prompt.
  - While a stranger's prompt is waiting, the owner's own sign requests are refused (`chip.ts:292`). Also, `requestPairing` never times out, so that prompt waits indefinitely.
- **Fix:**
  - After a forget, require the window, or keep the open-to-anyone mode for a never-paired wallet only.
  - Expire a pairing that has been waiting for more than about 60 s.

**P2-5. The recovery words stay in the mailbox `RESP` area after setup.** This is earlier audit L2, still half open.
- **Where:** `chip.ts:379-388` writes only `n` bytes and never clears the rest. CREATE (`chip.ts:399-406`) and WORDS replies are longer than every later reply.
- **Repro:** after setup, home and pairing, **10 of the 12 words** were still readable at `0xD844..` (results.txt).
- **Fix:** zero `RESP[0..170]` after each reply to a SECRET command, or before every reply.

**P2-6. The EVM fee isn't checked for zero.** This is the audit-2 P2, still open, at `chip.ts:692-695`.
- `maxFeePerGas: 0n` is accepted, and the screen shows "MAX 0 ETH" (shot 058).
- A missing `chainId` is refused only through the error "Cannot convert undefined to a BigInt".
- **Fix:** require `maxFeePerGas > 0`, `maxPriorityFeePerGas <= maxFeePerGas`, and `typeof chainId === "number"` before calling `serializeTransaction`.

**P2-7. The swap intent doesn't bind tokens or the chains SODAX actually uses.** This is a design item for real swaps.
- **Where:** `chip.ts:774-779`. The canonical digest covers only symbol text (`/^[A-Za-z0-9.]{1,8}$/`) and testnet chain ids. SODAX quotes mainnet (`swap.ts:17-25`). A malicious phone can name any token "USDC".
- **Today:** harmless, because the demo signs and doesn't broadcast. Before real swaps, add the token contracts or mints and the real chain ids to the intent and the digest, and check them against a token allowlist on the chip.
- **Also:** the Game Boy shows `SEND x` and `FEE y` (`main.c:1283-1293`). The fee is already inside x (`swap.ts:5-6`: "the quote nets both out"), but the screen reads as if it comes on top. Label it `FEE (INCL.)`.

**P2-8. Long amounts wrap in the middle of a number.**
- **Where:** `main.c:1285-1291` (`wrap(1,5,18,amount,2)`) cuts every 18 columns.
- **Example:** `0.123456789012345678 ETH` shows as `0.1234567890123456` / `78 ETH`, and 5 wei shows as `0.0000000000000000` / `05 ETH` (shots 047, 059). The first line alone reads as a different amount.
- **Fix:** have the chip refuse amounts that need more than 14 big columns plus the unit, or else break at the unit and put a visible continuation mark (`…`) on the first line.

**P2-9. ROM robustness.**
- `unlock()` (`main.c:1016-1032`) treats status 3 ("no wallet") and 0xFF as "Wrong PIN" and shows "0 TRIES LEFT" in a loop. Handle `st == 3` by returning to PING.
- `new_wallet` (`main.c:1006-1008`) ignores a non-zero `SET_PIN` status and goes on to an empty home screen.
- There's no PIN confirmation step (`main.c:1005`), so a slip at setup locks the owner out until they restore from the 12 words. Ask for the PIN twice.

**P2-10. The home screen redraws with a stale `paired` value after the menu.** `main.c:1599-1601` calls `home_redraw(paired)` with the value from before `menu()`. After a forget or pair inside the menu, the wrong screen flashes for one frame (demo shot 115) before line 1591 corrects it. Fix: recompute `PHONE_PAIRED()` before the redraw.

**P2-11. Demo ROM differences.**
- START-hold raises sign requests while no phone is paired (`main.c:345-349`, shot 119).
- After a refusal the pretend phone asks again every 4 s, forever (`main.c:546`).
- `CMD_LOCK` doesn't clear `demo_pairing`.
- `REQ_KIND` gives pairing priority, while the real chip gives the sign request priority.
- Fix: gate `demo_raise` on `!demo_phone_gone`.

**P2-12. Info.**
- Pairing is a single boolean. Sign requests aren't tied to the paired phone's identity: there's no per-phone key, so the API can't tell phones apart. Hardware must bind requests to the bonded LE Secure Connections link.
- `WIPE` and `TXSTATUS` need no unlock (`chip.ts:554-567`).
- If the power is cut after the ROM has sent `SIGN 1`, the phone still receives the signature (`approved:true`). That's acceptable, because the user had already approved, but the docs only say the *reply* is dropped.

## Docs drift (`docs/protocol.md`)

- **The mailbox table leaves out `0xF4` PAIRED** (chip writes `1` while a phone is paired).
- **`0xF3` (line 30)** says "`1` while the phone has a transaction waiting". It is actually 1 for a sign request and 2 for a pairing request, and 0 while locked. The correct values appear only at line 97.
- **The Commands table leaves out `0x11 PHONE`:**
  - arg 0 returns `name\0id\0date\0` (status 1 if none);
  - arg 1 forgets the phone;
  - arg 2 opens the 60 s window;
  - arg 3 closes it and drops a waiting pairing;
  - status 1 when locked.
- **`0x10 PAIR` (line 91)** doesn't say that a paired wallet accepts new pair requests only inside the window, that accepting replaces the old phone, or that arg 0 returns `code\0`.
- **`0x0A TXSTATUS` (line 85)** leaves out the `DEMO` state and its fixed detail "SWAPS GO LIVE WITH THE CARTRIDGE".
- **`0x07 PENDING` (line 82):** `chain` is 0 for sol and 1 for both evm and **swap**. Swap requests aren't documented at all: the fields, the chip's checks, the canonical string `kagiboy-swap-v1|src|dst|SYM|dec|amt|BUY|dec|min|fees|deadline|recipient` hashed with sha256, the ed25519 or EIP-191 signature, and the 3×16 layout of the "to" box.
- **`0x0F NETWORK`:** correct.
- **README.md:106 and hardware.md:64** say the chip signs only plain transfers. It also signs swap intents now.
- **README's "SIGN isn't tied to a digest… can't be exploited"** still holds for SIGN, but the same pattern on PAIR is exploitable (P1-1).

## Verified OK

- **Earlier audit fixes that still hold:**
  - M2: the phone can't put a forged hash or free text on the screen (smoke).
  - D5: a PIN try is spent before the check (`chip.ts:446`).
  - L3: the ROM parses replies with a cursor that can't leave `resp_len` (`next_field`, `words_count` capped at 4, `qr_dark` bounds).
  - L2 on the Game Boy side: `forget_resp` after the words, and `forget_pin`/`clear_req` after PIN and RESTORE.
  - P1-3: the "Test words only" screen appears, and B goes back without calling WORDS.
  - Per-network EVM icons on the home card.
  - `ACCOUNT` returns a third `name` field.
- **WYSIWYS:**
  - sol, evm (all 5 networks) and swap shown fields match `pendingShown`.
  - Every field fits its box: `ROBINHOOD CHAIN`, `SWAP ARBITRUM`, `MAX 0.00005 HYPE`, a 3×16 swap "to" box.
  - A swap with a min that can't be shown is refused.
  - Swap type confusion (a float or string for amounts or fees) is refused.
  - A number `value` on EVM shows and signs the same 5 wei.
- **Holding A:** a 30-frame hold, then release, resets the bar and doesn't sign. A full hold signs. B rejects and nothing is signed.
- **Requests that arrive during other screens** are handled correctly during Receive (QR and text), Menu, Phone, the pair window and the Wipe confirm. A pairing that arrives during the window shows the code, and accepting it closes the window.
- **Pairing basics:**
  - An unpaired phone gets no balances and no signing.
  - A second phone is refused while a phone is paired and the window is closed.
  - Pairing and signing are refused while locked.
  - B refuses a pairing.
  - The "Expired" path renders.
  - The window counts down from 60, and B or a timeout closes it on the chip.
  - Phone names are cleaned (`"Pixel 9 Pro!!"` becomes `PIXEL 9 PRO`).
- **Forget phone:** clears balances (`-- SOL`). "Keep" keeps the phone.
- **Networks:** RIGHT cycles Base→Arbitrum→HyperEVM→Robinhood→Ethereum and wraps, LEFT wraps back, and the phone follows through `onNetwork`. The EVM balance is nulled on every switch. `NETWORK` is refused while locked or with a bad arg.
- **Status screens:** SIGNED, BROADCAST and CONFIRMED with the shortened hash, FAILED with "NOT ENOUGH FUNDS", UNKNOWN with "CHECK THE EXPLORER", DEMO with its note, and "STILL CONFIRMING" after about 60 s all render correctly.
- **Power cut while the approve screen is up:** the phone gets `power`, and the PIN is asked again.
- **Wrong PINs:** the count goes 4→3→2→"1 TRY LEFT", then "Cartridge wiped". Storage is erased and the start menu returns.
- **Wipe:** the confirm needs SELECT+A, B cancels, and the menu "Back" item works.
- **Demo ROM:**
  - create, PIN, then home;
  - all 5 networks;
  - START-hold produces sol and evm requests;
  - the status goes SIGNED→BROADCAST→CONFIRMED;
  - forget phone, then the pretend phone asks with code 246810 about 4 s later; B refuses, A pairs;
  - SRAM saves `KG 01 | locked | PIN 1234 | tries 5 | sum`.

## Screens tested

All paths are under `…/scratchpad/audit3-rom/out/`.

| # | Screen | Shot |
|---|---|---|
| 1 | Boot / press start | 001-boot.png |
| 2 | Start menu | 002-start-menu.png |
| 3 | Restore warning "Test words only"; B goes back | 003-restore-warning.png, 004-start-menu-after-B.png |
| 4 | Mash (progress, done + POOL) | 006-mash-mid.png, 007-mash-done-pool.png (005 is the warning again, a test artifact) |
| 5 | Shake | 008-shake-start.png |
| 6 | Backup words | 010-words.png |
| 7 | Choose PIN | 011/012-choose-pin*.png |
| 8 | Home, unpaired ("Pair your phone!" + waves) | 013, 014 |
| 9 | Menu (unpaired) / Receive while unpaired | 015, 016 |
| 10 | Phone: none / paired | 017 / 066 |
| 11 | Pair window: listening, countdown, B stop, near timeout, timed out | 018, 019, 020, 081, 082 |
| 12 | Pair request: refuse / accept / **replace race** / expired | 021-022 / 025 / 023-024 / 083 |
| 13 | Home, paired, all 5 networks + big balance | 026-032 |
| 14 | Receive: SOL QR, SOL text, EVM text, EVM QR, chain switch | 033-037 |
| 15 | Sign sol (cut into receive), half hold, bar reset, signing | 038-041 |
| 16 | Status SIGNED / BROADCAST / CONFIRMED | 042-044 |
| 17 | Sign evm Base → FAILED | 045, 046 |
| 18 | Sign evm Robinhood (long amount wrap) → UNKNOWN | 047, 048 |
| 19 | Sign HyperEVM → Rejected | 049, 050 |
| 20 | Sign Ethereum → "STILL CONFIRMING" timeout | 051, 052 |
| 21 | Swap sign → DEMO; phone forces CONFIRMED | 053, 054, 055 |
| 22 | EVM MAX 0 fee; 5-wei wrap | 058, 059 |
| 23 | Status wiped by the next request | 060, 061, 062 |
| 24 | Menu; request arriving in the menu | 063, 064, 065 |
| 25 | Forget confirm / keep / forget with a request pending → signed | 067, 068, 069-071 |
| 26 | Pair window cut by a sign request; stranger prompt afterwards | 075, 076, 077 |
| 27 | Pair request inside the window; retry after refuse | 078, 079, 080 |
| 28 | Lock → PIN → home | 084, 085 |
| 29 | Wipe confirm / cancel / request during confirm | 086, 087, 088 |
| 30 | Menu "Back" | 089, 090 |
| 31 | Power cycle → PIN | 091 |
| 32 | Wrong PIN 1-4 → wiped → start menu | 092-097 |
| 33 | DEMO: boot, menu, shake, words, home, 5 networks | 098-107 |
| 34 | DEMO: sign sol → status → CONFIRMED; sign evm | 108-111 |
| 35 | DEMO: phone paired → forget → pretend pair → refuse → again → paired | 112-117 |
| 36 | DEMO: unpaired home; START-hold still raises a request | 118, 119 |
