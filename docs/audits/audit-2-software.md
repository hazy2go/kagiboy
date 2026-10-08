# kagiboy software audit #2 (2026-10-08, read-only)

**Scope:** the multi-EVM change (`networks.ts`, chip, phone, ROM `draw_account`), the waitlist API, session/emulator lifecycle, test coverage, and whether the repo is ready to go public. Source files were not changed. Scratch scripts and screenshots are in `scratchpad/audit2-sw/`.

**What was run:** `make` and `make demo` both build (warnings are benign; ROM is about 17 KB of 32 KB, the demo ROM about 19 KB). `tsc -b` is clean. `pnpm build` passes. oxlint gives 7 warnings and no errors. `pnpm smoke` passes every check. Extra headless ROM tests rendered Robinhood/HYPE screens and switched networks while a request was pending. A Chrome e2e on `/demo` sent a real request on all five networks and rejected each one; no funds were spent. A route-churn test went `/`→`/demo`→`/about` ×12. Live RPC probes covered all five networks. Full git history was scanned for secrets.

---

## P0: must fix before submission

**P0-1. There is no LICENSE file.** Open source is a judging criterion, and the repo has no license. `TODO.md` plans MIT.
- **Fix:** add `LICENSE` (MIT) at the root.
- **Note:** the web demo bundles `serverboy`, which is **GPL-2.0** (`node_modules/serverboy/LICENSE`, shipped in the `gameboy-*.js` chunk). Add a NOTICE saying `/demo` includes GPL-2.0 code, so that bundle is distributed under GPL-2 terms (a public repo satisfies the source offer). The Pixel Operator font license (CC0) is already included. GSAP uses its own "standard no-charge" license, which is fine for this project.

## P1: should fix

**P1-1. HyperEVM explorer links open a blank or wrong page.** `web/src/chip/networks.ts:52` uses `https://app.hyperliquid-testnet.xyz/explorer`. That explorer only indexes HyperCore.
- **Repro:** open `…/explorer/tx/0x07220feb…d57c`, a live HyperEVM testnet tx taken from the RPC. The page is empty. `/explorer/address/0x…` shows HyperCore activity, not the EVM balance.
- **Also:** the "Get test HYPE" faucet (`/drip`) gives HyperCore mock USDC (and, as I understand it, only to addresses with mainnet history). It does not give HyperEVM HYPE. Please verify by hand.
- **Fix:** I couldn't find a working testnet EVM explorer. `testnet.purrsec.com` returns 404, `testnet.hyperevmscan.io` doesn't resolve, and the hypurrscan testnet gives a server error. Either hide "View"/"Explorer" when `id === 998` and show a copyable hash instead, or point to one you confirm. Reword the faucet hint to say "bridge HYPE to HyperEVM".

**P1-2. WebGL contexts leak across route changes, and the GameBoyShell throws.**
- **Repro:** 12 SPA cycles `/`↔`/demo`↔`/about` created **25 WebGL contexts**. Chrome logged `Too many active WebGL contexts. Oldest context will be lost`, the JS heap went from 13 to 28 MB, and there was a pageerror `Cannot read properties of null (reading 'getBoundingClientRect')`.
- **Causes:**
  - (a) `scene.ts:343` `dispose()` neither calls `renderer.forceContextLoss()` nor frees the GLB geometries and materials.
  - (b) `GameBoyShell.tsx:101-128` and `Landing.tsx:166-228` only assign `cleanup` after `await scene.load()`. Leaving during the load returns early (`if (disposed) return`) without disposing the scene or disconnecting the `ResizeObserver`. The RO then calls `fit()` with `canvas.current === null` (`GameBoyShell.tsx:102`).
  - (c) `Landing.tsx:188-189` calls `scene.setScreen` after `await startAttract()` without re-checking `disposed`.
- **Fix:** create the cleanup right after the scene is constructed, dispose on the early-return path, null-guard `fit`, and add `forceContextLoss()` plus a scene traverse that disposes everything.
- The rAF loops themselves do stop correctly: `/about` runs about 64 rAF/s whether loaded fresh or after leaving `/demo`.

**P1-3. Prior-audit M1 is still open: the demo will take a real seed.** The ROM restore flow (`main.c:759-936`) gives no "test words only" warning. Keys use the Phantom and MetaMask paths (`keys.ts:39-41`), and the demo stores the mnemonic in plaintext in `localStorage` (`session.ts:6`). The only warning is one line on the phone in the "none" state.
- **Fix:** add a ROM screen before restore ("TEST WORDS ONLY / NEVER YOUR REAL ONES"), and the same text in the README.
- **Also:** `TODO.md` says the audits are "all fixed", which overstates it. Still open are:
  - M1;
  - M3's membership oracle (`{already:true}`);
  - L1 (no SIGN digest);
  - L7 (no auto-lock);
  - L8 (`pnpm audit --prod`: 4 moderate, stream-json via jayson);
  - D5 (`chip.ts:338-352` compares the PIN *before* spending a try, while the demo ROM chip correctly decrements first).
  
  Either fix these or list them as known limits.

**P1-4. Public docs are stale after the multi-EVM change.**
- `README.md:46` still says "Solana devnet and Ethereum Sepolia". Step 3 mentions an "Airdrop 1 SOL" button, but the UI now says "Get test SOL". There is no live URL and no license section.
- `docs/hardware.md:61-62` says "Sepolia… only 21000-gas… 0.01 ETH".
- `docs/protocol.md:53` gives ACCOUNT as `address\0balance\0`; it is now `address\0balance\0name\0`.
- `web/README.md` is the unedited Vite template, which looks careless to judges. Delete it or replace it.

## P2: nice to have

- **"MAX" fee on Base isn't a strict cap.** On OP-stack chains the L1 data fee is charged outside `gas × maxFeePerGas`. The comment at `chip.ts:88` covers Arbitrum and Robinhood only. Today it is negligible: the measured Base Sepolia L1 fee upper bound is 2×10⁻¹⁶ ETH. Add a word to the docs, or add the oracle's upper bound to the shown fee on Base.
- **Chip accepts `maxFeePerGas` of 0 or missing.** A `type:"legacy"` input is coerced to 1559 with no fee, so the Game Boy shows "MAX 0 ETH". The node rejects it, so no funds are at risk. A missing `chainId` throws "Cannot convert undefined to a BigInt". Refuse `maxFeePerGas == 0` and require `chainId` explicitly (`chip.ts:470-480`).
- **`phone.ts:238` can check the wrong network's balance.** The balance check runs after the `await` of nonce, fees and estimate. If the user switches network in that window, it compares against the new network's balance. Snapshot `balances.evm` alongside `net`.
- **Waitlist (`api/waitlist.ts`):**
  - The regex runs on an unbounded body before the length check and the rate limit. A 4 MB body costs about 0.7 s CPU, with no limit. Check `email.length` first.
  - `INCR` then `EXPIRE` is not atomic. If EXPIRE fails, that IP is blocked forever. Use `SET key 0 EX 600 NX` and then `INCR`.
  - `{already:true}` still confirms whether an email is on the list.
  - There is no privacy or deletion note next to the form.
- **`session.ts:107-109`:** `powerOn` doesn't check `res.ok` and has no `.catch`, so a failed `/wallet.gb` fails silently. There is also no guard against a double tap.
- **ROM:**
  - The EVM card always shows the ETH diamond icon, also for HyperEVM and Robinhood (`main.c:991`).
  - The comment at `main.c:969` still mentions "address".
  - There is a const-qualifier warning at `main.c:982`.
- **Audio:** `navigator.audioSession.type = "playback"` (`session.ts:102`) will pause the user's music on iOS when they switch on. This is acceptable, but be aware of it.
- **Lint and dead code:**
  - 7 oxlint warnings (DemoPage set-state-in-effect ×2, GameBoyShell immutability ×4, refs ×1).
  - `CHAIN_CODE` (`protocol.ts:46`) is unused.
  - `useMedia` (`DemoPage.tsx:205`) re-subscribes on every render.
  - No TODO/FIXME, `console.log` or `debugger` was found in source.
- **Repo hygiene for going public:**
  - `.impeccable/` (questions log, design state, 20 review PNGs) is design-tool state. Consider untracking it.
  - `TODO.md` has internal "hazy:" items.
  - Commit messages include `claude.ai/code/session_…` links. They are harmless but visible.
  - The `.git` folder is 57 MB, mostly from re-committed 2-3 MB PNG renders. That's acceptable.

## Test coverage gaps

- **`phone.ts` has no tests:** `send` flows, `track` state mapping (`isDefiniteRejection`, `explainError`), `parseAmount`, the rollup gas headroom (`estimate*1.2`, falling back to 21000 when the estimate fails, e.g. on an unfunded account), and the network-switch races in `refreshBalances` and `sendEth`.
- **`api/waitlist.ts` has no tests:** a mock-Redis test for the first sign-up, a repeat, a race, the rate limit and 502 handling would be cheap to add.
- **Session lifecycle and route churn are untested;** P1-2 would have been caught.
- **The smoke test covers HyperEVM and Arbitrum gas, but not** Base, Robinhood (the longest label, 15 characters), near-cap fees, or a network switch with a request pending. I checked all of these by hand and they render and behave correctly.
- **There is no CI.** The Vercel build runs only `tsc -b && vite build`, never `pnpm smoke` or lint.

---

## Verified OK

- **Can't sign on an unshown chain.**
  - The chip enforces the allowlist on the tx's own `chainId` and refuses mainnet.
  - The approve screen's network label comes from the snapshot's chainId, not from the phone's picker.
  - Switching the picker from Arbitrum to HyperEVM while a request was pending left the Game Boy showing `ARBITRUM`. The home card switched to HyperEVM, and the activity entry kept `net: 421614`.
  - Explorer links use the per-activity `net`.
- **Live fee and gas on every network are far under the caps.**

  | Network | Sign screen showed | Base fee | Priority fee |
  |---|---|---|---|
  | Sepolia | MAX 0.000001 ETH | 17 wei | 0.001 gwei |
  | Base | MAX 0.000001 ETH | 0.005 gwei | – |
  | Arbitrum | MAX 0.000003 ETH | 0.09 gwei | – |
  | HyperEVM | MAX 0.00001 HYPE | 0.1 gwei | 0 |
  | Robinhood | MAX 0.000001 ETH | 0.01 gwei | – |

  `eth_estimateGas` for a plain transfer returned 21000 on every RPC, far under 600k and the 0.01 cap.
- **HyperEVM supports type-2 transactions.** `eth_feeHistory` returns a baseFee, `eth_maxPriorityFeePerGas` returns 0, and the chainId (998) matches. All 5 chainIds match their RPCs, and the CSP `connect-src` lists all 5.
- **Balances and labels stay correct across switches.** The chip nulls the EVM balance on a switch (the Game Boy shows `-- ETH`), and a late fetch from the old network is dropped (`phone.ts:99`).
- **ROM `draw_account` is safe.**
  - `next_field` is bounded by `RESP_END`.
  - A missing name falls back to "Solana"/"Ethereum".
  - The 14-byte cache is always NUL-terminated, and `txt_n` is clipped to 12.
  - The forced redraw on `home_draw` works.
  - The mock replies in `demo_chip.h` include the name field, and the demo pending label is now `ETHEREUM`.
  - `ROBINHOOD CHAIN` and a 33-character HYPE amount both render in full.
- **Prior fixes I confirmed in code or by test:** M2 (the phone can only show the hash the chip signed; the smoke test blocks a forged one), the `/demo` deep link (`vercel.json` rewrite, live returns 200), the emulator suspending when you leave `/demo`, the waitlist race (HEXISTS→INCR→HSETNX) and rate limit, and the "1 TRY LEFT" text.
- **Waitlist on the live site:** GET returns 405, `text/plain` returns 415, a bad email returns 400, and none of these touch Redis. The live ROM is identical to the local one.
- **Git history is clean (51 commits):**
  - no Upstash `gQAAAA`/`AX…` tokens, keys, PEMs, 64-hex private keys or base58 secret keys;
  - the only mnemonic is the documented BIP-39 test vector;
  - `.env.local` (`VERCEL_OIDC_TOKEN`) and `.vercel` were never committed;
  - all commits are by `hazy2go` noreply, with no personal email.
