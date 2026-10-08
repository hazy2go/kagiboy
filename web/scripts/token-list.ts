// Dumps the swappable tokens on kagiboy's chains (used by scripts/fetch_token_icons.py).
import { Sodax } from "@sodax/sdk";
import { SWAP_CHAINS } from "../src/app/swap";
const s = new Sodax();
await s.initialize();
const all = (s as unknown as { config: { getSupportedSwapTokens(): Record<string, { symbol: string; address: string }[]> } }).config.getSupportedSwapTokens();
const out = SWAP_CHAINS.flatMap((c) => (all[c.key] ?? []).map((t) => ({ chain: c.key, symbol: t.symbol, address: t.address })));
console.log(JSON.stringify(out));
