# kagiboy security audit #4 (2026-10-08, read-only)

**Scope:** `rom/src/main.c`, `web/src/chip/*`, `web/src/phone/phone.ts`, `web/src/app/{KagiApp.tsx,swap.ts}`, `web/src/demo/session.ts`, the site copy (`landing/`, `about/`), `web/api/waitlist.ts`, `web/vercel.json`, the live headers on kagiboy.xyz, `native/` (Capacitor), `docs/hardware.md`, `docs/protocol.md`, `README.md`, dependencies and git history. I changed no source files; this report is the only file written.

**What I ran:**
- A headless chip harness (`/tmp/audit4/t.mts`) drives `CartChip` through a fake mailbox. It covers create, PIN, pairing races, swap and EVM validation, status forgery, and wipe while locked.
- `pnpm audit --prod` in `web/` and `native/`.
- `git log -p --all` grep for secrets (81 commits).
- Read-only `GET`s of the response headers on kagiboy.xyz, www.kagiboy.xyz and kagiboy.vercel.app. I sent no POSTs.

**Bottom line:** plain sends are still sound. Every SOL and EVM transfer is decoded by the chip, shown in full, and signed only after a 1 s hold of A. Both audit-3 P1 pairing holes are fixed. The weak spot is now **swaps**:
- The token decimals come from the phone, and nothing binds the token identity. A compromised phone can make the Game Boy show amounts that are wrong by orders of magnitude.
- The signature is over a kagiboy-only digest that SODAX never checks.

Nothing is broadcast today, so no funds are at risk. It does contradict "SIGNS EXACTLY WHAT IT SHOWS" and "protects against a compromised phone". Several site claims overstate what the demo and the planned hardware do.

---

## Critical

None. Nothing can be signed without a full hold of A over a screen the chip decoded (re-verified for sol, evm and swap).

## High

### H1. Swap screen amounts come from phone-supplied decimals and symbols, so a compromised phone can misstate them by orders of magnitude
**Where:**
- `web/src/chip/chip.ts:785-819` (`decodeSwap`). Line 788 only checks that `sellDecimals` and `buyDecimals` are integers from 0 to 36. Lines 798 and 814 format the amounts with them. Line 787 accepts any `[A-Za-z0-9.]{1,8}` symbol.
- `web/src/app/swap.ts:114-127` (`intentFor`) passes the token's `decimals` and `symbol` straight through.

**Exploit:** a malicious app or SDK swaps USDC (6 decimals) for an intent that says `buyDecimals: 0, minReceive: 100`. The Game Boy shows `GET AT LEAST 100 USDC`, but the real minimum is 0.0001 USDC, so the solver (or the attacker) keeps the difference. On the sell side, `sellDecimals: 12` with `sellAmount: 10^12` shows `1 SOL` for 1000 SOL of lamports.

My harness reproduced this: `sellDecimals 36, sellAmount 10^40` was accepted and showed `10000 SOL`. `USDC.E` and any other look-alike symbol is accepted, and `fees: 0` is accepted and shown as `FEE 0 SOL`.

**Why it is High although nothing is sent today:**
- The site promises "SIGNS EXACTLY WHAT IT SHOWS" and "REFUSES WHAT IT CAN'T SHOW".
- The README promises protection against "a compromised phone".
- The swap path is the business model.

**Related (still open from audit-3 P2-7):**
- The digest (`chip.ts:802-807`) covers symbols only. It names no token contract or mint.
- It uses testnet chain ids for **mainnet** quotes. `swap.ts:17-25` maps SODAX `0x2105.base` to `evm:84532`.
- The signature is EIP-191 or raw ed25519 over a kagiboy string. SODAX never verifies it. A live swap needs the chip to decode SODAX's real source-chain transaction: the EVM `createIntent` calldata plus approve, or the Solana program instruction. Today the chip refuses both, because EVM `data` must be empty and Solana allows only one System Transfer.

**Fix:**
- Before swaps go live, give the chip a token registry: chain id, contract or mint, symbol and decimals. Derive decimals and symbol on the chip from the contract address, and refuse unknown tokens.
- Bind token addresses, real chain ids, the partner-fee recipient and bps, and the recipient into what gets signed. Better still, sign the actual SODAX intent or transaction, decoded on the chip.
- Until then, label swaps on the site as a UI preview whose signature can't execute.

## Medium

### M1. An unpaired or "forgotten" cartridge takes a pairing prompt from any phone at any time, and the phone API has no caller identity (audit-3 P2-4, still open)
**Where:**
- `chip.ts:204` requires the pairing window only when `this.paired`.
- `chip.ts:224-234` `unpair()` is callable by any phone-side caller.
- `main.c:1588-1589` shows a pairing prompt from the unpaired home screen.
- `main.c:1465` tells the user "PAIR A PHONE AGAIN FROM THIS SCREEN".

**Exploit (harness):** with no phone paired, `requestPairing("ATTACKER")` puts a code on the Game Boy. The owner's own `pair()` then fails with "another phone is already asking to pair", so the owner's phone shows **no** code to compare. Their sign requests are refused for up to 60 s. They can be refused indefinitely if the attacker re-asks every minute.

The attacker picks a name such as `IPHONE`, which `cleanName` keeps. An owner who expects to pair presses A, and `phone = {name:"ATTACKER"}` is stored. On hardware, an attacker in BLE range who can call the equivalent of `unpair()` forces this state on a paired cartridge.

Also, the 6-digit code is just read from the chip by whoever asks (`chip.pairingCode`). In the demo it isn't derived from any key exchange, so "numeric comparison" only proves that the owner pressed A.

**Fix:**
- After a forget, and for a never-paired wallet, require the Game Boy's pairing window (PHONE 2).
- Make `unpair` from the phone require the bonded link.
- On hardware, derive the code from LE Secure Connections and bond requests to that link.
- Show "NOT YOUR PHONE? PRESS B" while the owner's phone has no code.

### M2. The recovery words stay in the mailbox RESP area after setup (audit-3 P2-5 / audit-1 L2, still open on the chip side)
**Where:** `chip.ts:394-403`. `writeReply` writes only `n` bytes and never clears the rest.

**Repro (harness):** after CREATE → SET_PIN, `0xD844..` still holds all 12 words. After a later PAIR reply it still holds about 11. The ROM side is fixed (`forget_resp`, `forget_pin`, `clear_req`). The chip side is not.

On hardware this RESP area is MCU RAM mapped to the cartridge bus. Anything that can read the bus after setup reads the seed: a cartridge reader, a pass-through adapter, or a later ROM path that dumps the mailbox.

**Fix:** zero `RESP[0..RESP_MAX]` before every reply, or at least after CREATE, WORDS and RESTORE. Also zero `REQ` from the chip side after secret commands.

### M3. The native shell has no CSP and backs up the plaintext mnemonic
**Where:**
- `native/capacitor.config.ts`. `web/index.html` has no `<meta http-equiv="Content-Security-Policy">`, and the `vercel.json` headers don't apply inside Capacitor.
- `native/android/app/src/main/AndroidManifest.xml:4` has `android:allowBackup="true"`.
- `web/src/demo/session.ts:6-32` keeps the "secure element" (mnemonic, PIN hash, tries) in `localStorage`.

**Impact:**
- In the app, the large `@sodax/sdk` tree, its 48 advisories (M4) and remote Google Fonts all run with no `connect-src` limit. Any injected or compromised script can exfiltrate the mnemonic freely. On the web, the CSP at least limits exfiltration to the listed RPC and SODAX hosts.
- Android Auto Backup and `adb backup` copy the WebView `localStorage`, mnemonic included, off the device.
- `triesLeft` lives in the same store, so the PIN limit is resettable. The PIN is also about 10⁴ offline guesses, although the mnemonic is plaintext anyway.

**Fix:**
- Add a meta CSP to `index.html` that mirrors `vercel.json`.
- Set `allowBackup="false"`, or exclude the WebView data with `dataExtractionRules`.
- Self-host the fonts.
- Don't ship the shell to the stores while the "chip" is `localStorage`. If you must, keep the demo seed in memory only.

**Also (not security):** the committed `android/.../assets/capacitor.config.json` and `ios/App/App/capacitor.config.json` still have `appStartPath: "/app"`, and `ios-start-path.mjs` creates `public/app`. The `/app` route was removed (`App.tsx:13-25`), so the native app opens on NotFound until you run `cap sync`.

### M4. Dependencies: 48 advisories (18 high), all through `@sodax/sdk`; the README still says "4 moderate"
**Where:**
- `pnpm audit --prod` in `web/` shows 2 low, 28 moderate and 18 high. The high ones are axios <1.20 (×13: prototype-pollution gadgets, proxy credential leaks, ReDoS), `ws` <8.21, `bigint-buffer` ≤1.1.5 (buffer overflow), and `toml` <4.2 (prototype pollution).
- The paths are `@sodax/sdk` > `@stellar/stellar-sdk`, `@pancakeswap/*`, `@coral-xyz/anchor`, `@injectivelabs` and `@cosmjs`.
- `native/` is clean.

**Reachability:**
- Most of these are Node-side (proxy, HTTP/2, `ws` server). They need a prototype-pollution source to matter in the browser.
- The real risk is supply chain: about 1000 transitive packages from the SDK load lazily into the same origin as the plaintext seed (M3).
- `README.md:151-153` and `docs/audit-security.md` L8 understate this.

**Fix:**
- Add `pnpm.overrides` for `axios >=1.20`, `ws >=8.21`, `toml >=4.2`, `bn.js >=5.2.3`, `stream-json >=3.6`, `uuid >=11.1.1` and `valibot >=1.4.2`, then re-test swaps.
- Better: call the SODAX REST quote API (`api.sodax.com`, already in the CSP) instead of bundling the whole SDK.
- Update the README.
- `allowBuilds` is tight: only `esbuild` in web and `sharp` in native. Keep it that way.

### M5. Site and app copy overstate the security
| Claim | Where | Reality |
|---|---|---|
| "KEYS · NEVER LEAVE THE CHIP"; "Your keys are made inside the cartridge and never leave it" | `Landing.tsx:43`, `:390`; `hardware.md:34` "(never leave)" | The 12 words cross the cartridge bus in plaintext and sit in the mailbox afterwards (M2). The SE050 can't do BIP-32/SLIP-10, so the seed and keys exist in MCU RAM at setup (`README.md:162`, `hardware.md:51`). |
| "SIGNS · EXACTLY WHAT IT SHOWS"; "What the Game Boy shows you is exactly what gets signed" | `Landing.tsx:45`, `:505` | False for swaps (H1): decimals and token come from the phone, and the signed digest is not what SODAX would execute. |
| "The Game Boy shows what you pay, the least you'll get and the fees before you sign" | `Landing.tsx` FAQ `swaps` | The fees are a phone-reported number; nothing checks them, and the partner-fee recipient isn't shown. `SEND x` / `FEE y` reads as if the fee comes on top, but it is included (audit-3 P2-7). |
| "Keys are made and kept inside the cartridge. This phone only ever sees public addresses." | `KagiApp.tsx:821` | In the demo the "cartridge" is JavaScript in the same page, and the seed is in this browser's `localStorage`. |
| "What the design protects against: … a compromised phone" | `README.md:118-121` | Not for swaps (H1). Pairing hijack is possible while unpaired (M1). |
| "The same ROM as the live demo, on my own Game Boy … The keys in this test build live in the ROM's stand-in chip" | `AboutPage.tsx:178` | The flash-cart photos run `make demo` (`DEMO_CHIP`). It has no keys and no signing, uses a canned mnemonic, and accepts **PIN 0000 regardless of the PIN you chose** (`main.c:242`). |
| "Can my phone move my money? No … signs only when you hold A" | `Landing.tsx:89` | True of the software policy. On the planned hardware, a BLE-stack compromise of the RP2350 can forge SIGN (audit-1 D1), and the 1 s hold exists only in the ROM (`main.c:1321-1340`); the chip doesn't enforce it. The "Known limits" box covers glitching, but not this. |
| "BLUETOOTH · PUBLIC DATA ONLY" | `Landing.tsx` PROMISES | Fine as a design goal, but pairing is unspecified (README admits this). |

**Fix:**
- "Keys never leave the cartridge."
- "Sends: signs exactly what it shows. Swaps: preview only in this demo."
- Demo-qualify the KagiApp line ("in this demo the cartridge is simulated in your browser").
- Correct the About caption (demo ROM, no keys).
- Add "hold-to-sign is enforced by the Game Boy ROM; firmware will enforce a minimum delay too" to Known limits.
- Fix `hardware.md:34`.

## Low

**L1. SIGN still isn't bound to what was shown, and the chip doesn't enforce a hold time** (audit-1 L1/D3/D6, open). `chip.ts:556-571` signs whatever is pending; `main.c:1345` sends `SIGN 1` with no digest. PAIR is now bound to its code, which is good.
- The README says this "can't be exploited because the phone can't … cancel a pending request". The phone *can* cancel now: `unpair()` → `dropPending` (`chip.ts:232`). I checked whether that opens a gap. It doesn't, because a new pending request needs `paired`, and pairing needs the Game Boy to send PAIR 1 from the pairing screen. So it is still not exploitable, but the stated reason is wrong.
- **Fix:** PENDING returns 8 digest bytes and SIGN echoes them. The chip refuses SIGN less than about 1 s after PENDING.

**L2. Long amounts wrap in the middle of a number** (audit-3 P2-8, open). `main.c:1288-1295`. The harness accepted value `123456789012345678` wei, which shows as `0.1234567890123456` / `78 ETH`; 1 wei shows as `0.0000000000000000` / `01 ETH`. The unit can also be clipped at column 19 for 8-character swap symbols (`txt(2 + w, 6, unit + 1)`). **Fix:** refuse amounts whose number is wider than 14 columns, or show them with fewer decimals rounded **up**, plus a "+".

**L3. The phone can mislabel a broadcast transaction.** `chip.ts:279-297`. After `BROADCAST`, the phone may set `FAILED` + `NO_FUNDS`; the harness shows `FAILED NOT ENOUGH FUNDS` on the Game Boy. That invites the user to send again, which double-spends. The phone can also set `BROADCAST` with no hash (a blank detail line). `requestSignature` still wipes the previous request's status (`chip.ts:312`, audit-3 P2-2, open). **Fix:** once the state is BROADCAST, allow only CONFIRMED (with the hash) or UNKNOWN. Require the hash for BROADCAST. Keep the last *signed* status apart from the pending request.

**L4. No auto-lock** (audit-1 L7, open). The `home()` loop (`main.c:1580-1631`) has no inactivity timer, and the chip stays unlocked while powered. **Fix:** lock after N minutes idle, from the ROM (LOCK) and as a chip-side timer.

**L5. Waitlist API** (`web/api/waitlist.ts`):
- **Membership oracle (audit-1 M3, still open):** a new email gets `{position}` and a known one gets `{already:true}` (lines 45-51). Anyone can test whether an address is on the list, 8 tries per IP per 10 min. **Fix:** always answer `{ok:true}` and show the position only in an email.
- **Non-atomic rate limit:** `INCR` then `EXPIRE` (lines 40-41). If EXPIRE fails, that IP is locked out forever. Use `SET key 0 EX 600 NX` and then `INCR`, or a pipeline.
- **Order:** the regex runs before the 254-character check (line 34). Bodies are capped at 4.5 MB by Vercel, so this is low.
- **Limits:** the limit is per IP from `x-forwarded-for` (line 38). Vercel overwrites that header, but prefer `ipAddress()` from `@vercel/functions`. Nothing stops distributed fills (IPv6, botnets); consider Vercel BotID or Firewall.
- **Privacy:** emails are stored in plaintext in Upstash. There is no privacy note and no way to delete an entry.
- **OK:** the JSON-only content type blocks cross-site form posts, and the Upstash arguments are a JSON array (no injection).

**L6. The chip accepts commands it should refuse:**
- `WIPE` works while locked with no PIN; the harness confirmed it.
- `SET_PIN` takes any 4 bytes, not just the digits 0-9 (`chip.ts:442-455`).
- `TXSTATUS` needs no unlock.

On hardware a cartridge reader can wipe or burn the PIN tries (denial of service; audit-1 D7). **Fix:** require unlock or the PIN for WIPE (keep the 5-wrong-PIN wipe), and validate the digits.

**L7. ROM robustness** (audit-3 P2-9/P2-10, open):
- `unlock()` treats status 3 as "Wrong PIN" (`main.c:1012-1033`).
- `new_wallet` ignores a non-zero `SET_PIN` status (`main.c:1006-1008`).
- There is no PIN confirmation step.
- `home_redraw(paired)` uses a stale value after the menu (`main.c:1606`).

**L8. Solana cluster binding** (audit-1 M1, mitigated, not fixed). The ROM shows "Test words only" before restore, and the receive screen says "SEND TESTNET FUNDS ONLY". The derivation path is still Phantom's, and the screen now just says `SOLANA`. On the web, the CSP blocks mainnet RPCs, which helps. In the native shell (no CSP, M3) nothing stops a mainnet blockhash. **Fix (for the hardware builds):** testnet builds derive `m/44'/501'/1'/0'`.

**L9. Swap intent input hygiene:** `deadline` accepts floats and strings (the harness accepted both), `dst` may equal `src`, and `fees` may be 0 (`chip.ts:785-791`). These are cosmetic today. Add `typeof === "bigint"` / `Number.isSafeInteger` checks. Use EIP-712 typed data instead of EIP-191 over a raw sha256, so wallets and verifiers get domain separation.

## Info

- **Live headers (www.kagiboy.xyz, kagiboy.vercel.app):**
  - **Present:** the CSP from `vercel.json`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS with includeSubDomains.
  - **Apex:** `kagiboy.xyz` 308-redirects with `strict-transport-security: max-age=63072000`, without includeSubDomains or preload. Consider preload once you're sure.
  - **CSP:** `style-src 'unsafe-inline'` plus Google Fonts is acceptable, because `img-src 'self' data: blob:` blocks CSS exfiltration. `'wasm-unsafe-eval'` is needed by the emulator and crypto.
  - **CORS:** Vercel adds `access-control-allow-origin: *` on static files, which is harmless.
- **XSS sinks:**
  - **Only one:** `KagiApp.tsx:914` `dangerouslySetInnerHTML`, rendering a QR SVG that `qrcode-generator` builds from the chip's own address. Safe.
  - **Not present:** `innerHTML`, `eval` and `new Function`.
  - **Explorer links:** they are always `https://…` + hash, so no `javascript:` scheme is possible. External links use `rel="noreferrer"`.
- **Secrets:** git history (81 commits) is clean. No Upstash, Vercel, RPC or private keys; no PEMs; no 64-hex or base58 secrets. `web/.env.local` holds only `VERCEL_OIDC_TOKEN` and is git-ignored, never committed. No `VITE_*` secrets are in the bundle (`VITE_SOLANA_RPC` is unset).
- **Entropy:** `keys.ts:15-19` uses sha256(pool from the Game Boy ‖ 32 bytes of `crypto.getRandomValues`), so attacker-controlled button or shake input can't weaken it. The pairing code uses `getRandomValues % 10⁶`; the bias is negligible.
- **PIN logic:** a try is spent and saved before the compare (`chip.ts:461-462`). After 5 wrong tries the chip wipes and the ROM shows "Cartridge wiped".
- **ROM mailbox parsing** is bounded throughout:
  - `resp_len` is clamped to 171 into a 172-byte buffer.
  - `next_field` stops at `RESP_END`.
  - `words_count` is capped at 4.
  - `qr_dark` checks `resp_len`.
  - REQ is 60 bytes on both sides.
  - The pairing `code` copy is 6 bytes into `code[7]`.

  I found no overflow.
- **Partner fee:** 10 bps to `0x95A8…21AD` is set in client config (`swap.ts:12-13, 54`). It isn't shown or bound on the Game Boy (see H1). Anyone running the app locally can strip it; that's a business consideration, not a security one.

---

## Prior findings status

| ID | Finding | Status |
|---|---|---|
| A1 M1 | Devnet-labelled cartridge signs mainnet SOL | **Mitigated** (restore warning, "testnet only" text, web CSP). Path unchanged, so still open by design (L8) |
| A1 M2 | Phone puts tx hashes on the screen | **Fixed** (the chip compares against its own hash) |
| A1 M3 | Waitlist rate limit / membership oracle | Rate limit **fixed**; oracle **open** (L5) |
| A1 L1 / D6 | SIGN not tied to a digest | **Open** (L1) |
| A1 L2 | Secrets linger in RAM and the mailbox | ROM side **fixed**; chip RESP **open** (M2) |
| A1 L3 | ROM trusts reply shape | **Fixed** |
| A1 L4 | Seq handling across reboots | Sim OK; hardware **open** |
| A1 L5 | No CSP; plaintext seed in localStorage | CSP **fixed** on the web; plaintext seed **open** and documented; native shell has no CSP (M3) |
| A1 L6 | Waitlist race / CSRF / regex | **Fixed** (HSETNX, JSON-only, stricter regex) |
| A1 L7 | No auto-lock | **Open** (L4) |
| A1 L8 | Dependency advisories | **Worse**: 48 (18 high) via `@sodax/sdk` (M4) |
| A1 D1-D5, D7-D9 | Hardware design risks | **Open** (design); D2 contradicted by site copy (M5) |
| A2 P1-1 | HyperEVM explorer links | **Fixed** (`explorer: ""` hides them) |
| A2 P1-3 | Demo takes a real seed | **Mitigated** (ROM "Test words only" screen) |
| A2 P2 | `maxFeePerGas` 0 or missing `chainId` | **Fixed** (harness: both refused; tip > max refused) |
| A2 P2 | Waitlist: regex before length, INCR/EXPIRE, oracle | **Open** (L5) |
| A3 P1-1 | Second phone swaps its pairing code in | **Fixed** (one pairing at a time, and PAIR 1 echoes the shown code) |
| A3 P1-2 | Forgotten phone's pending request still signs | **Fixed** (`dropPending` in both forget paths; SIGN and PENDING check `paired`) |
| A3 P2-1 | Phone forces CONFIRMED on a DEMO swap | **Fixed**; BROADCAST without hash and FAILED after BROADCAST still allowed (L3) |
| A3 P2-2 | Next request wipes the previous status | **Open** (L3) |
| A3 P2-3 | Pairing window outlives the screen | **Fixed** (cleared on PAIR answer, LOCK and reset; the ROM sends PHONE 3 on every exit) |
| A3 P2-4 | Unpaired cartridge accepts pairing from anyone | **Open** (M1); a 60 s lapse was added |
| A3 P2-5 | Words left in mailbox RESP | **Open** (M2, reproduced) |
| A3 P2-6 | EVM zero fee / missing chainId | **Fixed** |
| A3 P2-7 | Swap intent doesn't bind tokens or real chains | **Open**, and escalated by the decimals spoof (H1) |
| A3 P2-8 | Amounts wrap mid-number | **Open** (L2) |
| A3 P2-9 / P2-10 | ROM robustness, stale `paired` redraw | **Open** (L7) |
| A3 P2-11 | Demo ROM quirks | `demo_raise` gated on `!demo_phone_gone` **fixed**; LOCK doesn't clear `demo_pairing`, and the 4 s re-ask is **open** |
| A3 P2-12 | Pairing not tied to a phone identity | **Open** (M1) |
| A3 docs | `protocol.md` missing PHONE/PAIR/0xF4/DEMO/swap | **Fixed** (`protocol.md:31, 83, 86, 92-93, 108-113`) |

## Fix order before submission (2026-10-12)

1. **Copy (M5):** about an hour. It is the most visible to judges and costs the least.
2. **Chip quick fixes:** zero RESP on every reply (M2); require the pairing window when unpaired, and gate phone-side `unpair` (M1); refuse FAILED after BROADCAST (L3). Each is a few lines in `chip.ts`. Re-run `pnpm smoke`.
3. **Swaps:** a chip-side token registry for decimals and symbols, or else label swaps as a preview (H1).
4. **Native:** meta CSP plus `allowBackup=false`, or hold off on store builds (M3).
5. **Dependencies:** `pnpm.overrides`, and update the README numbers (M4).
