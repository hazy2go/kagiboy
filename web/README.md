# kagiboy web

The website and browser demo for kagiboy, deployed at
https://kagiboy.xyz (Vercel root directory: `web`). See the
[root README](../README.md) for what kagiboy is and how the pieces fit.

## What's here

| Path | What it is |
|---|---|
| `/` (`src/landing/`) | Landing page with the 3D Game Boy (three.js + GSAP) and the waitlist form |
| `/demo` (`src/demo/`) | The real ROM (`public/wallet.gb`) running in an emulator, next to a phone app and a bus monitor |
| `/about` (`src/about/`) | The story behind the project |
| `src/chip/` | The simulated cartridge chip: keys, PIN, network allowlist, transaction decoding and signing |
| `src/phone/` | The phone side: balances, building and broadcasting transactions (Solana devnet + 5 EVM testnets) |
| `src/emu/` | Thin wrapper over the GameBoy-Online core from `serverboy` (GPL-2.0, see [NOTICE](../NOTICE)) |
| `api/waitlist.ts` | Vercel Function for the waitlist (Upstash Redis, rate limited) |
| `scripts/smoke.ts` | Headless end-to-end test: the real ROM against the chip |

## Run

```sh
pnpm i
pnpm dev               # http://localhost:5173, open /demo
pnpm build             # tsc -b && vite build, output in dist/
pnpm smoke smoke-out   # headless ROM + chip test, saves a PNG of every screen to smoke-out/
pnpm lint              # oxlint
```

`public/wallet.gb` is the ROM built from `../rom` (`make` copies it here).
The waitlist API needs `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Upstash, via `vercel env pull`);
everything else runs without any keys.
