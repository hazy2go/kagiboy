/**
 * Swaps through SODAX, from inside the kagiboy app. Quotes are live (SODAX runs on mainnets);
 * the cartridge shows and signs the intent, and this demo build stops there.
 *
 * Business model: a 0.1% partner fee on every swap, paid in the sell token to kagiboy's
 * SODAX partner wallet (on top of SODAX's own 0.1% solver fee). The quote already nets both out.
 */
import type { Sodax } from "@sodax/sdk";
import type { SwapIntent, SwapSide } from "../chip/chip";
import { EVM_NETWORKS } from "../chip/networks";

export const PARTNER_FEE_BPS = 10; // 0.1%
export const PARTNER_WALLET = "0x95A8E0BcF616f7eF630b0D923667fbF52AA721AD";
export const SLIPPAGE_BPS = 50; // 0.5%: the least you accept is the quote minus this
const QUOTE_TTL_S = 300;

/** The chains a kagiboy cartridge has keys for, as SODAX names them (mainnet; ids map to our test networks). */
export const SWAP_CHAINS = [
  { key: "solana", name: "Solana", side: { chain: "sol" } as SwapSide, color: "#9b87f5" },
  { key: "ethereum", name: "Ethereum", side: { chain: "evm", net: 11155111 } as SwapSide, color: "#7a8cd6" },
  { key: "0x2105.base", name: "Base", side: { chain: "evm", net: 84532 } as SwapSide, color: "#4f7cff" },
  { key: "0xa4b1.arbitrum", name: "Arbitrum", side: { chain: "evm", net: 421614 } as SwapSide, color: "#4aa3df" },
  { key: "hyper", name: "HyperEVM", side: { chain: "evm", net: 998 } as SwapSide, color: "#5fc9b0" },
  { key: "robinhood", name: "Robinhood", side: { chain: "evm", net: 46630 } as SwapSide, color: "#8ccf5f" },
] as const;
export type ChainKey = (typeof SWAP_CHAINS)[number]["key"];

export interface Token {
  chain: ChainKey;
  symbol: string;
  name: string;
  decimals: number;
  address: string;
}

export interface Quote {
  sell: Token;
  buy: Token;
  sellAmount: bigint;
  /** net of every fee, what lands in your wallet */
  out: bigint;
  minOut: bigint;
  partnerFee: bigint;
  solverFee: bigint;
  at: number;
}

let client: Promise<Sodax> | null = null;

/** The SDK is large, so it loads the first time the swap screen asks for it. */
function sodax(): Promise<Sodax> {
  client ??= import("@sodax/sdk").then(async ({ Sodax }) => {
    const s = new Sodax({
      swaps: { partnerFee: { address: PARTNER_WALLET, percentage: PARTNER_FEE_BPS } },
    } as ConstructorParameters<typeof Sodax>[0]);
    await s.initialize();
    return s;
  });
  client.catch(() => (client = null));
  return client;
}

export const chainOf = (key: ChainKey) => SWAP_CHAINS.find((c) => c.key === key)!;

/** Every token SODAX can swap on the cartridge's chains, majors first. */
export async function loadTokens(): Promise<Token[]> {
  const s = await sodax();
  const all = (s as unknown as { config: { getSupportedSwapTokens(): Record<string, { symbol: string; name: string; decimals: number; address: string }[]> } }).config.getSupportedSwapTokens();
  const order = ["SOL", "ETH", "USDC", "USDT", "HYPE", "SODA"];
  const rank = (sym: string) => (order.includes(sym) ? order.indexOf(sym) : 50);
  const out: Token[] = [];
  for (const c of SWAP_CHAINS) {
    for (const t of all[c.key] ?? []) {
      // the Game Boy can only show plain symbols; skip anything it would refuse
      if (!/^[A-Za-z0-9.]{1,8}$/.test(t.symbol)) continue;
      out.push({ chain: c.key, symbol: t.symbol, name: t.name, decimals: t.decimals, address: t.address });
    }
  }
  return out.sort((a, b) => rank(a.symbol) - rank(b.symbol) || SWAP_CHAINS.findIndex((c) => c.key === a.chain) - SWAP_CHAINS.findIndex((c) => c.key === b.chain));
}

export async function quote(sell: Token, buy: Token, sellAmount: bigint): Promise<Quote> {
  const s = await sodax();
  const res = await s.swaps.getQuote({
    token_src: sell.address,
    token_src_blockchain_id: sell.chain,
    token_dst: buy.address,
    token_dst_blockchain_id: buy.chain,
    amount: sellAmount,
    quote_type: "exact_input",
  } as Parameters<Sodax["swaps"]["getQuote"]>[0]);
  if (!res.ok) throw new Error(explainQuoteError(res.error));
  const out = BigInt(res.value.quoted_amount);
  return {
    sell,
    buy,
    sellAmount,
    out,
    minOut: (out * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n,
    partnerFee: s.swaps.getPartnerFee(sellAmount),
    solverFee: s.swaps.getSolverFee(sellAmount),
    at: Date.now(),
  };
}

function explainQuoteError(e: unknown): string {
  const text = JSON.stringify(e ?? "").toLowerCase();
  if (text.includes("liquid")) return "Not enough liquidity for this pair right now.";
  if (text.includes("amount")) return "Try a different amount.";
  return "SODAX couldn't quote this pair right now.";
}

/** What the cartridge is asked to sign for a quote: shown in full on the Game Boy. */
export function intentFor(q: Quote): SwapIntent {
  return {
    src: chainOf(q.sell.chain).side,
    dst: chainOf(q.buy.chain).side,
    sellSymbol: q.sell.symbol,
    sellDecimals: q.sell.decimals,
    sellAmount: q.sellAmount,
    buySymbol: q.buy.symbol,
    buyDecimals: q.buy.decimals,
    minReceive: q.minOut,
    fees: q.partnerFee + q.solverFee,
    deadline: Math.floor(Date.now() / 1000) + QUOTE_TTL_S,
  };
}

/** The cartridge has keys on these networks; the swap screen only offers what it can sign. */
export const SUPPORTED_EVM = EVM_NETWORKS.map((n) => n.id);
