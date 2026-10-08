// The tokens the cartridge will swap, with decimals it trusts. Generated from the SODAX token list
// (pnpm exec tsx scripts/token-list.ts prints it); the phone names a token
// only by its address, so it can't change what the Game Boy shows.

export interface ChipToken {
  symbol: string;
  decimals: number;
}

export const SWAP_TOKENS: Record<string, Record<string, ChipToken>> = {
  "solana": {
    "11111111111111111111111111111111": { symbol: "SOL", decimals: 9 },
    "3rSPCLNEF7Quw4wX8S1NyKivELoyij8eYA2gJwBgt4V5": { symbol: "bnUSD", decimals: 9 },
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", decimals: 6 },
    "8Bj8gSbga8My8qRkT1RrvgxFBExiGFgdRNHFaR9o2T3Q": { symbol: "SODA", decimals: 9 },
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", decimals: 6 },
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK", decimals: 5 },
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": { symbol: "JUP", decimals: 6 },
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": { symbol: "JitoSOL", decimals: 9 },
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL", decimals: 9 },
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY", decimals: 6 },
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": { symbol: "PYTH", decimals: 6 },
    "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": { symbol: "JTO", decimals: 9 },
    "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": { symbol: "WBTC", decimals: 8 },
    "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1": { symbol: "CRCLx", decimals: 8 },
    "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB": { symbol: "TSLAx", decimals: 8 },
    "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W": { symbol: "SPYx", decimals: 8 },
    "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh": { symbol: "NVDAx", decimals: 8 },
    "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ": { symbol: "QQQx", decimals: 8 },
    "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ": { symbol: "MSTRx", decimals: 8 },
    "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu": { symbol: "COINx", decimals: 8 },
    "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN": { symbol: "GOOGLx", decimals: 8 },
  },
  "ethereum": {
    "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 },
    "0x1f22279c89b213944b7ea41dacb0a868ddcdfd13": { symbol: "bnUSD", decimals: 18 },
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
    "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
    "0x4a1c82744cddee675a255fb289cb0917a482e7c7": { symbol: "SODA", decimals: 18 },
    "0x0921799cb1d702148131024d18fcde022129dc73": { symbol: "LL", decimals: 18 },
    "0xd166337499e176bbc38a1fbd113ab144e5bd2df7": { symbol: "sUSDat", decimals: 18 },
    "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { symbol: "AAVE", decimals: 18 },
    "0x514910771af9ca656af840dff83e8264ecf986ca": { symbol: "LINK", decimals: 18 },
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
    "0x6982508145454ce325ddbe47a25d4ec3d2311933": { symbol: "PEPE", decimals: 18 },
    "0x57e114b691db790c35207b2e685d4a43181e6061": { symbol: "ENA", decimals: 18 },
    "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": { symbol: "USDe", decimals: 18 },
    "0x9d39a5de30e57443bff2a8307a4256c8797a3497": { symbol: "sUSDe", decimals: 18 },
    "0x6c3ea9036406852006290770bedfcaba0e23a0e8": { symbol: "PYUSD", decimals: 6 },
    "0x6985884c4392d348587b19cb9eaaf157f13271cd": { symbol: "ZRO", decimals: 18 },
    "0x45804880de22913dafe09f4980848ece6ecbaf78": { symbol: "PAXG", decimals: 18 },
    "0x68749665ff8d2d112fa859aa293f07a622782f38": { symbol: "XAUt", decimals: 6 },
    "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": { symbol: "USD1", decimals: 18 },
    "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { symbol: "cbBTC", decimals: 8 },
    "0xae78736cd615f374d3085123a210448e74fc6393": { symbol: "rETH", decimals: 18 },
  },
  "0x2105.base": {
    "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 },
    "0x04c0599ae5a44757c0af6f9ec3b93da8976c150a": { symbol: "weETH", decimals: 18 },
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
    "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": { symbol: "wstETH", decimals: 18 },
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { symbol: "cbBTC", decimals: 8 },
    "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b": { symbol: "VIRTUAL", decimals: 18 },
    "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": { symbol: "cbETH", decimals: 18 },
    "0xdc5b4b00f98347e95b9f94911213dab4c687e1e3": { symbol: "SODA", decimals: 18 },
  },
  "0xa4b1.arbitrum": {
    "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 },
    "0xa256dd181c3f6e5ec68c6869f5d50a712d47212e": { symbol: "bnUSD", decimals: 18 },
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { symbol: "WBTC", decimals: 8 },
    "0x35751007a407ca6feffe80b3cb397736d2cf4dbe": { symbol: "weETH", decimals: 18 },
    "0x5979d7b546e38e414f7e9822514be443a4800529": { symbol: "wstETH", decimals: 18 },
    "0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40": { symbol: "tBTC", decimals: 18 },
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
    "0x912ce59144191c1204e64559fe8253a0e49e6548": { symbol: "ARB", decimals: 18 },
    "0xba5ddd1f9d7f570dc94a51479a000e3bce967196": { symbol: "AAVE", decimals: 18 },
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": { symbol: "LINK", decimals: 18 },
    "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0": { symbol: "UNI", decimals: 18 },
    "0x11cdb42b0eb46d95f990bedd4695a6e3fa034978": { symbol: "CRV", decimals: 18 },
    "0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8": { symbol: "PENDLE", decimals: 18 },
    "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8": { symbol: "rETH", decimals: 18 },
    "0x5bda87f18109ca85fa7addf1d48b97734e9dc6f5": { symbol: "SODA", decimals: 18 },
  },
  "hyper": {
    "0x0000000000000000000000000000000000000000": { symbol: "HYPE", decimals: 18 },
    "0x506ba7c8d91dadf7a91ee677a205d9687b751579": { symbol: "bnUSD", decimals: 18 },
    "0xa28c70f92a1b2513edcddd29c2e5195a4b785ab2": { symbol: "SODA", decimals: 18 },
    "0xb88339cb7199b77e23db6e890353e22632ba630f": { symbol: "USDC", decimals: 6 },
    "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb": { symbol: "USDT0", decimals: 6 },
    "0x9fdbda0a5e284c32744d2f17ee5c74b284993463": { symbol: "UBTC", decimals: 8 },
    "0xbe6727b535545c67d5caa73dea54865b92cf7907": { symbol: "UETH", decimals: 18 },
    "0xfd739d4e423301ce9385c1fb8850539d657c296d": { symbol: "kHYPE", decimals: 18 },
    "0x111111a1a0667d36bd57c0a9f569b98057111111": { symbol: "USDH", decimals: 6 },
  },
  "robinhood": {
    "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 },
    "0x3cd95c469be0edfd12bd4f3a4436b132b7908df4": { symbol: "bnUSD", decimals: 18 },
    "0xa256dd181c3f6e5ec68c6869f5d50a712d47212e": { symbol: "SODA", decimals: 18 },
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { symbol: "USDG", decimals: 6 },
  },
};

/** SODAX's name for each chain the cartridge has keys on (SODAX quotes mainnets; the demo signs on testnets). */
export function sodaxChain(side: { chain: "sol" } | { chain: "evm"; net: number }): string | null {
  if (side.chain === "sol") return "solana";
  return { 11155111: "ethereum", 84532: "0x2105.base", 421614: "0xa4b1.arbitrum", 998: "hyper", 46630: "robinhood" }[side.net] ?? null;
}

/** kagiboy's SODAX partner fee; the cartridge works the fees out itself and signs this recipient. */
export const PARTNER_FEE = { bps: 10, wallet: "0x95A8E0BcF616f7eF630b0D923667fbF52AA721AD" } as const;
/** SODAX's fixed solver fee */
export const SOLVER_FEE_BPS = 10;

/** The token on that chain, if the cartridge knows it (EVM addresses compare lower-case). */
export function chipToken(chain: string, address: string): ChipToken | null {
  const list = SWAP_TOKENS[chain];
  if (!list || typeof address !== "string") return null;
  return list[address.startsWith("0x") ? address.toLowerCase() : address] ?? null;
}
