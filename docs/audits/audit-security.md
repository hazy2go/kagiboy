# kagiboy security audit (read-only)

Date: 2026-10-07. Scope: `web/src/chip/*`, `rom/src/main.c`, `rom/src/gfx.c`, `web/src/phone/phone.ts`, `web/src/demo/*`, `web/api/waitlist.ts`, docs, deps, git history. Nothing was modified apart from writing this file.

**Overall:** the simulated chip's what-you-see-is-what-you-sign (WYSIWYS) core holds up. It snapshots the request and re-serializes it (`chip.ts:450-496`). It refuses anything other than one System `Transfer` from the cartridge's key, which also blocks durable nonces, compute-budget instructions and SPL/ATA transfers. On EVM it requires Sepolia, 21000 gas, empty `data` and no access list, and caps the fee. It re-checks the Solana message bytes before signing (`chip.ts:389`). There is only one pending request, and the phone can't replace or cancel it. On the Game Boy, every field fits the screen in full: amount up to 2×18 characters, fee 16, address 3×16. No phone free-text reaches the screen except the tx hash (M2). The serious risks are in the **hardware design**, not this code.

---

## A. Bugs in current software

### Medium

**M1. A devnet-labelled cartridge will sign mainnet Solana transactions.** `chip.ts:471-472`, `chip.ts:285-292`
The screen always says `SOLANA DEVNET`, but the cluster is set only by the blockhash the phone picks. RESTORE accepts any BIP-39 seed on Phantom's path (`m/44'/501'/0'/0'`).
*Exploit:* a user restores their real Phantom words "to try the demo". A malicious phone app builds a transfer with a **mainnet** blockhash. The Game Boy shows "SOLANA DEVNET". The user approves "test" SOL and real SOL leaves. (EVM is safe: chainId 11155111 is enforced.)
*Fix:* warn hard on RESTORE in testnet builds. Better, make testnet builds derive from a different path or account (e.g. `m/44'/501'/1'/0'`) so a real seed never maps to the user's mainnet key. Long term, label the screen "ANY SOLANA CLUSTER" unless the firmware can bind the cluster.

**M2. The phone can put tx hashes on the "trusted" screen.** `chip.ts:140-155`, `phone.ts:166,170`
`setTxStatus` accepts any well-formed hash from the phone and shows it next to `CONFIRMED`. This breaks the rule that the chip writes every string. A malicious phone can show "CONFIRMED 0xdead..beef" for a transaction it never broadcast, or one that differs from what was signed.
*Fix:* the chip already has the signed bytes. It should compute the id itself (the Solana signature, or keccak of the signed EVM tx) and accept only state codes from the phone.

**M3. Waitlist: no rate limit, and it reveals who has signed up.** `api/waitlist.ts:21-40`
- Any caller can submit any number of emails. That inflates the count, burns the Upstash quota and pollutes the list. Add a per-IP limit (Upstash `INCR` + `EXPIRE`, or Vercel Firewall).
- `POST {email: victim@x}` returns `{position, already:true}`. That confirms membership and the join order of anyone's email. Return the same generic response either way, or send the position only by email.

### Low

**L1. SIGN is not tied to what was shown.** `chip.ts:346-356`, `main.c:741,808`
`SIGN arg=1` approves "whatever is pending now". It can't be exploited today, because only GB-side LOCK, WIPE or power can clear a pending request. Any future cancel, timeout or replace path would create a gap between what was shown and what gets signed (a TOCTOU). Fix: PENDING returns a 4–8 byte digest of the snapshot, SIGN echoes it, and the chip refuses on mismatch.

**L2. Secrets linger in Game Boy RAM and the mailbox.** `main.c:56,60,80-83,570-574`
`chip_call` only NUL-terminates `resp` at `resp_len`. After CREATE, the 12 words stay in `resp[]` (and in the mailbox RESP area) until a later long reply overwrites them. `pin[4]` and the mailbox REQ area keep the PIN after unlock. Fix: `memset(resp,0,…)` after `show_words`, clear `pin` and `MB[REQ..]` after SET_PIN and UNLOCK, and have the chip zero RESP after secret replies.

**L3. The ROM trusts the shape of chip replies.** `main.c:461-466,495,522` (`word_at` walks `resp[0]` entries, up to 255, with no bound), `main.c:608,718,743-746` (the field walk can go past `resp_len` and `resp[172]` if NULs are missing). These are out-of-bounds reads and junk draws. On real hardware a bus glitch could trigger them. Fix: clamp `count<=4` and parse fields with a bounded cursor against `resp_len`.

**L4. Sequence-number handling across reboots.** `main.c:72-79`, `chip.ts:212-214`
The 8-bit `seq` restarts at 1 when the Game Boy reboots. On real hardware the mailbox lives in the MCU, so a stale `resp_seq==1` can be read as the answer to a new request. Also, `lastSeq==1` makes the chip ignore that request, which leads to a timeout and a fatal error. Fix: add a per-boot session nonce in PING, and have the chip clear `resp_seq` when `req_seq` goes backwards.

**L5. Demo key storage.** `session.ts:6-32`, `chip.ts:549`
The mnemonic is stored in plaintext in localStorage. The PIN is `sha256(salt||4 digits)`, about 10⁴ guesses offline. Any XSS on the origin steals the keys. The code already says "testnet only", but there is **no CSP and no security headers** (no `vercel.json`). Add `Content-Security-Policy: script-src 'self'; frame-ancestors 'none'`, `X-Content-Type-Options`, and `Referrer-Policy`.

**L6. Waitlist minor issues.** `waitlist.ts:33-36`
- HGET→INCR→HSET is not atomic. Concurrent duplicate requests get two positions. Use `HSETNX` or a Lua script.
- `request.json()` ignores Content-Type, so cross-site `fetch(no-cors, text/plain)` can sign up victims (CSRF). Check `Content-Type: application/json` and `Origin`.
- The email regex allows `<>"'`. Sanitize before the list reaches any mailer or admin HTML.
- Upstash takes a JSON array of arguments, so there is no command injection.

**L7. No auto-lock.** The cartridge stays unlocked as long as it has power. Add an inactivity lock, and ask for the PIN again for large amounts.

**L8. Dependencies.** `pnpm audit --prod` reports 4 moderate: stream-json ×3 (via `@solana/web3.js>jayson`) and uuid. They are not meaningfully reachable in the browser; fix with `pnpm.overrides`. `serverboy@0.0.7` is unmaintained, but it only runs your own ROM.

### Info
- `SET_PIN` accepts any 4 bytes (0–255, not just digits). `WIPE` needs neither unlock nor PIN (`chip.ts:297,374`). This is only a DoS risk, but firmware should check both.
- Balances come from the phone and appear on the Game Boy as fact. Label them as from the phone, or verify them.
- The bus monitor shows ENTROPY bytes. This is fine because the TRNG is mixed in. CREATE, PIN and words are correctly hidden.
- `vite.config.ts` `fs.allow:[".."]` is dev-only. Don't run the dev server with `--host` on untrusted networks.
- Git history (26 commits) has no secrets. `.env*` is ignored. The KV token is read only from env.
- The phone's `parseAmount` and address checks are sound. `dangerouslySetInnerHTML` (`PhoneApp.tsx:149`) only renders a QR made locally from the chip's address, so it is safe.

---

## B. Design risks for the hardware

**State this trust model plainly: the Game Boy console, its screen, its buttons, AND its cartridge bus are fully trusted.** A tampered console or bus means full compromise of every unlocked session and of the PIN.

### Critical

**D1. The SE050 signs blindly; all WYSIWYS logic sits in the BLE-facing RP2350.** (`hardware.md` "Security model")
Decoding, the fee cap, chain checks, the hold-to-sign rule and the PIN session all run on the MCU. That MCU also runs the Bluetooth stack and has published glitch bypasses. If it is compromised through a BLE parser/stack RCE, a malicious update or a glitch, it can sign any transaction while unlocked. No button press is needed, because the MCU can make up the SIGN itself. The SE050 protects key *extraction*, not key *use*.
*Fix:* move the radio to a separate MCU and connect it over a narrow UART with a minimal, fuzzed parser. Keep the wallet MCU off the radio. Require firmware updates to be confirmed on the Game Boy screen, with anti-rollback. Consider a secure element that can run the decode and approval policy itself (Ledger/Keystone-style).

### High

**D2. "The seed never leaves the SE" is not achievable as specified.** The 12 words have to cross the cartridge bus to be shown. RESTORE has to bring words in. As far as I know, the SE050 has no BIP-39/BIP-32/SLIP-10 derivation, so the seed and the derived keys would exist in RP2350 RAM. *Fix:* derive on the MCU once at setup, import the child keys into the SE, then zeroize. Correct the claims in `hardware.md` and the README.

**D3. PIN and seed travel in plaintext over a sniffable bus.** The PIN crosses the bus on every unlock (`main.c:582`) and the words at setup (`main.c:569`). Anything that can watch the bus captures them: a modified DMG, an FPGA clone, a pass-through adapter, or a logic analyzer. The attacker then steals the cartridge and has full access. A modified console can also auto-approve, because SIGN is one bus write and the 1-second hold exists only in the ROM (`main.c:784-808`). *Mitigations:* tell users to use only their own unmodified console. Have the chip enforce a minimum time between PENDING and SIGN. Consider showing the seed only on a second channel, or not at all (link-cable backup).

### Medium

**D4. Bluetooth pairing is not specified.** Without authenticated pairing, any device in range can push sign requests, fake balances and status, and read addresses. It can also time a malicious request just before the user's own one, so the user approves out of habit. *Fix:* LE Secure Connections with numeric comparison shown on the Game Boy. Only a bonded phone may submit requests. Rate-limit requests.

**D5. PIN counter ordering.** The simulation compares first and then decrements and saves (`chip.ts:313-326`). If firmware copies that order, an attacker can cut power after a wrong guess and before the save, which gives unlimited tries. *Fix:* use the SE050's auth object with a hardware max-attempts counter, or persist the decrement *before* comparing. Use a constant-time compare. Allow 6+ digit PINs; a 4-digit PIN gives a thief a 0.05% chance in 5 tries.

**D6. TOCTOU once BLE is asynchronous** (see L1). Bind SIGN to a digest before firmware adds any cancel or queue logic.

### Low
- **D7.** A cartridge reader (GBxCart-class) can speak the mailbox protocol directly: WIPE a locked cartridge, or burn the 5 PIN tries. This is DoS only.
- **D8.** Entropy from button presses and the accelerometer is controlled by the attacker on a tampered console. That is harmless only while the SE TRNG is really mixed in. Malicious MCU firmware could skip the TRNG, and the user can't detect it.
- **D9.** The Solana cluster is ambiguous (already noted in the docs; see M1). Use distinct derivation paths per network build.
