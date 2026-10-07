/**
 * The EVM test networks kagiboy signs for. One key, one address, five networks:
 * the cartridge checks every request's chain id against this list and names the
 * network on the Game Boy, so a request can't move funds somewhere you didn't see.
 */
export interface EvmNetwork {
  id: number;
  /** short name for the Game Boy's home screen (fits the account box) */
  name: string;
  /** caption on the approve screen */
  label: string;
  symbol: string;
  rpc: string;
  explorer: string;
  faucet: string;
}

export const EVM_NETWORKS: EvmNetwork[] = [
  {
    id: 11155111,
    name: "Ethereum",
    label: "ETHEREUM",
    symbol: "ETH",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    faucet: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
  {
    id: 84532,
    name: "Base",
    label: "BASE",
    symbol: "ETH",
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    faucet: "https://www.alchemy.com/faucets/base-sepolia",
  },
  {
    id: 421614,
    name: "Arbitrum",
    label: "ARBITRUM",
    symbol: "ETH",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    faucet: "https://www.alchemy.com/faucets/arbitrum-sepolia",
  },
  {
    id: 998,
    name: "HyperEVM",
    label: "HYPEREVM",
    symbol: "HYPE",
    rpc: "https://rpc.hyperliquid-testnet.xyz/evm",
    explorer: "https://app.hyperliquid-testnet.xyz/explorer",
    faucet: "https://app.hyperliquid-testnet.xyz/drip",
  },
  {
    id: 46630,
    name: "Robinhood",
    label: "ROBINHOOD CHAIN",
    symbol: "ETH",
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    faucet: "https://faucet.testnet.chain.robinhood.com",
  },
];

export const DEFAULT_EVM = EVM_NETWORKS[0];

export function evmNetwork(id: number | undefined): EvmNetwork | undefined {
  return EVM_NETWORKS.find((n) => n.id === id);
}
