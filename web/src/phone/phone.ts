import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createPublicClient, formatEther, http, isAddress, parseEther } from "viem";
import { sepolia } from "viem/chains";
import type { CartChip } from "../chip/chip";
import type { Chain } from "../chip/protocol";

/**
 * The companion app. It has the network connection the Game Boy lacks, so it
 * fetches balances, builds transactions and broadcasts them, but it can only
 * *ask* the cartridge to sign. On real hardware this side talks Bluetooth.
 */

const SOL_RPC = import.meta.env?.VITE_SOLANA_RPC ?? "https://api.devnet.solana.com";
const EVM_RPC = import.meta.env?.VITE_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const explorer = {
  sol: (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  evm: (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
  solAddr: (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`,
  evmAddr: (a: string) => `https://sepolia.etherscan.io/address/${a}`,
};

export interface Activity {
  id: string;
  chain: Chain;
  to: string;
  amount: string;
  state: "waiting" | "rejected" | "broadcast" | "confirmed" | "failed";
  hash?: string;
  error?: string;
}

export class Phone {
  readonly sol = new Connection(SOL_RPC, "confirmed");
  readonly evm = createPublicClient({ chain: sepolia, transport: http(EVM_RPC) });
  balances: Record<Chain, number | null> = { sol: null, evm: null };
  activity: Activity[] = [];
  private listeners = new Set<() => void>();

  private chip: CartChip;

  constructor(chip: CartChip) {
    this.chip = chip;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  async refreshBalances() {
    const a = this.chip.addresses;
    if (!a) return;
    const [sol, evm] = await Promise.allSettled([
      this.sol.getBalance(new PublicKey(a.sol)),
      this.evm.getBalance({ address: a.evm as `0x${string}` }),
    ]);
    if (sol.status === "fulfilled") {
      this.balances.sol = sol.value / LAMPORTS_PER_SOL;
      this.chip.setBalance("sol", `${this.balances.sol.toFixed(4)} SOL`);
    }
    if (evm.status === "fulfilled") {
      this.balances.evm = Number(formatEther(evm.value));
      this.chip.setBalance("evm", `${this.balances.evm.toFixed(4)} ETH`);
    }
    this.emit();
  }

  /** Devnet faucet; it is rate limited, so callers should offer faucet.solana.com as a fallback. */
  async airdrop() {
    const a = this.chip.addresses;
    if (!a) throw new Error("unlock the cartridge first");
    const sig = await this.sol.requestAirdrop(new PublicKey(a.sol), LAMPORTS_PER_SOL);
    const bh = await this.sol.getLatestBlockhash();
    await this.sol.confirmTransaction({ signature: sig, ...bh });
    await this.refreshBalances();
  }

  async send(chain: Chain, to: string, amount: string) {
    const a = this.chip.addresses;
    if (!a) throw new Error("unlock the cartridge first");
    const value = Number(amount);
    if (!(value > 0)) throw new Error("enter an amount");

    const item: Activity = { id: crypto.randomUUID(), chain, to, amount: `${amount} ${chain === "sol" ? "SOL" : "ETH"}`, state: "waiting" };
    this.activity.unshift(item);
    this.emit();
    const update = (patch: Partial<Activity>) => {
      Object.assign(item, patch);
      this.emit();
    };

    try {
      if (chain === "sol") await this.sendSol(a.sol, to, value, update);
      else await this.sendEth(a.evm as `0x${string}`, to, amount, update);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      update({ state: "failed", error });
      this.chip.setTxStatus("FAILED");
    }
    this.refreshBalances();
  }

  private async sendSol(from: string, to: string, sol: number, update: (p: Partial<Activity>) => void) {
    let toKey: PublicKey;
    try {
      toKey = new PublicKey(to);
    } catch {
      throw new Error("that is not a Solana address");
    }
    const fromKey = new PublicKey(from);
    const { blockhash, lastValidBlockHeight } = await this.sol.getLatestBlockhash();
    const tx = new Transaction({ feePayer: fromKey, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: fromKey, toPubkey: toKey, lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
    );

    const result = await this.chip.requestSignature({ chain: "sol", tx });
    if (!result.approved || result.chain !== "sol") {
      update({ state: "rejected" });
      return;
    }
    const sig = await this.sol.sendRawTransaction(result.signed.serialize());
    update({ state: "broadcast", hash: sig });
    this.chip.setTxStatus("BROADCAST", sig);
    const conf = await this.sol.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    if (conf.value.err) throw new Error(JSON.stringify(conf.value.err));
    update({ state: "confirmed" });
    this.chip.setTxStatus("CONFIRMED", sig);
  }

  private async sendEth(from: `0x${string}`, to: string, amount: string, update: (p: Partial<Activity>) => void) {
    if (!isAddress(to)) throw new Error("that is not an EVM address");
    const [nonce, fees] = await Promise.all([
      this.evm.getTransactionCount({ address: from, blockTag: "pending" }),
      this.evm.estimateFeesPerGas(),
    ]);
    const result = await this.chip.requestSignature({
      chain: "evm",
      tx: {
        type: "eip1559",
        chainId: sepolia.id,
        to,
        value: parseEther(amount),
        nonce,
        gas: 21000n,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      },
    });
    if (!result.approved || result.chain !== "evm") {
      update({ state: "rejected" });
      return;
    }
    const hash = await this.evm.sendRawTransaction({ serializedTransaction: result.signed });
    update({ state: "broadcast", hash });
    this.chip.setTxStatus("BROADCAST", hash);
    const receipt = await this.evm.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("reverted");
    update({ state: "confirmed" });
    this.chip.setTxStatus("CONFIRMED", hash);
  }
}
