import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createPublicClient, formatUnits, http, isAddress, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import type { CartChip, FailReason, SignResult } from "../chip/chip";
import type { Chain } from "../chip/protocol";

/**
 * The companion app. It has the network connection the Game Boy lacks, so it
 * fetches balances, builds transactions and broadcasts them, but it can only
 * *ask* the cartridge to sign. On real hardware this side talks Bluetooth.
 */

const SOL_RPC = import.meta.env?.VITE_SOLANA_RPC ?? "https://api.devnet.solana.com";
const EVM_RPC = import.meta.env?.VITE_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const DECIMALS: Record<Chain, number> = { sol: 9, evm: 18 };
export const SYMBOL: Record<Chain, string> = { sol: "SOL", evm: "ETH" };

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
  /** "unknown": broadcast, but we lost track of it. It may still land, so don't resend blindly. */
  state: "waiting" | "rejected" | "broadcast" | "confirmed" | "failed" | "unknown";
  hash?: string;
  error?: string;
}

export class Phone {
  readonly sol = new Connection(SOL_RPC, "confirmed");
  readonly evm = createPublicClient({ chain: sepolia, transport: http(EVM_RPC) });
  /** Base units (lamports / wei); null until fetched. */
  balances: Record<Chain, bigint | null> = { sol: null, evm: null };
  activity: Activity[] = [];
  sending = false;
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

  /** Forget everything tied to the previous wallet (power cycle, lock, wipe). */
  clearBalances() {
    this.balances = { sol: null, evm: null };
    this.emit();
  }

  async refreshBalances() {
    const a = this.chip.addresses;
    if (!a) return;
    const [sol, evm] = await Promise.allSettled([
      this.sol.getBalance(new PublicKey(a.sol)),
      this.evm.getBalance({ address: a.evm as `0x${string}` }),
    ]);
    // the wallet may have changed while we waited; don't pin its balance on another one
    const now = this.chip.addresses;
    if (!now || now.sol !== a.sol || now.evm !== a.evm) return;
    if (sol.status === "fulfilled") {
      this.balances.sol = BigInt(sol.value);
      this.chip.setBalance("sol", this.balances.sol);
    }
    if (evm.status === "fulfilled") {
      this.balances.evm = evm.value;
      this.chip.setBalance("evm", this.balances.evm);
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

  /** Throws (before anything reaches the Game Boy) if the input is invalid. */
  async send(chain: Chain, to: string, amountText: string) {
    if (this.sending) throw new Error("A send is already in progress.");
    const a = this.chip.addresses;
    if (!a) throw new Error("Unlock the cartridge first.");
    const units = parseAmount(amountText, DECIMALS[chain]);
    if (chain === "sol" && !isSolAddress(to)) throw new Error("That isn't a Solana address.");
    if (chain === "evm" && !isAddress(to)) throw new Error("That isn't an EVM address (0x…).");
    const balance = this.balances[chain];
    if (balance != null && units > balance) {
      throw new Error(`You only have ${formatUnits(balance, DECIMALS[chain])} ${SYMBOL[chain]}.`);
    }

    this.sending = true;
    const item: Activity = {
      id: crypto.randomUUID(),
      chain,
      to,
      amount: `${formatUnits(units, DECIMALS[chain])} ${SYMBOL[chain]}`,
      state: "waiting",
    };
    this.activity.unshift(item);
    this.emit();
    const update = (patch: Partial<Activity>) => {
      Object.assign(item, patch);
      this.emit();
    };

    try {
      if (chain === "sol") await this.sendSol(a.sol, to, units, update);
      else await this.sendEth(a.evm as `0x${string}`, to as `0x${string}`, units, update);
    } catch (e) {
      update({ state: "failed", error: explainError(e).long });
    } finally {
      this.sending = false;
      this.emit();
    }
    this.refreshBalances();
  }

  /** After the cartridge signs: broadcast, then follow it to confirmation. */
  private async track(
    id: number,
    update: (p: Partial<Activity>) => void,
    broadcast: () => Promise<string>,
    confirm: (hash: string) => Promise<void>,
  ) {
    let hash: string;
    try {
      hash = await broadcast();
    } catch (e) {
      // the network refused it, so it can't land; safe to call it failed
      const { short, long } = explainError(e);
      update({ state: "failed", error: long });
      this.chip.setTxStatus(id, "FAILED", { reason: short });
      return;
    }
    update({ state: "broadcast", hash });
    this.chip.setTxStatus(id, "BROADCAST", { hash });
    try {
      await confirm(hash);
      update({ state: "confirmed" });
      this.chip.setTxStatus(id, "CONFIRMED", { hash });
    } catch (e) {
      if (e instanceof OnChainError) {
        update({ state: "failed", error: e.message });
        this.chip.setTxStatus(id, "FAILED", { reason: "REJECTED" });
        return;
      }
      // lost track after broadcast: it may still land, so never say "failed" here
      update({ state: "unknown", error: "Sent, but we couldn't confirm it. Check the explorer before trying again." });
      this.chip.setTxStatus(id, "UNKNOWN", { reason: "CHECK_EXPLORER" });
    }
  }

  private async sendSol(from: string, to: string, lamports: bigint, update: (p: Partial<Activity>) => void) {
    const fromKey = new PublicKey(from);
    const { blockhash, lastValidBlockHeight } = await this.sol.getLatestBlockhash();
    const tx = new Transaction({ feePayer: fromKey, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: fromKey, toPubkey: new PublicKey(to), lamports }),
    );
    const { id, result } = this.chip.requestSignature({ chain: "sol", tx });
    const signed = await result;
    if (!signed.approved || signed.chain !== "sol") return update(rejection(signed));
    await this.track(
      id,
      update,
      () => this.sol.sendRawTransaction(signed.signed.serialize()),
      async (sig) => {
        const conf = await this.sol.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
        if (conf.value.err) throw new OnChainError(`Failed on-chain: ${JSON.stringify(conf.value.err)}`);
      },
    );
  }

  private async sendEth(from: `0x${string}`, to: `0x${string}`, wei: bigint, update: (p: Partial<Activity>) => void) {
    const [nonce, fees] = await Promise.all([
      this.evm.getTransactionCount({ address: from, blockTag: "pending" }),
      this.evm.estimateFeesPerGas(),
    ]);
    const { id, result } = this.chip.requestSignature({
      chain: "evm",
      tx: {
        type: "eip1559",
        chainId: sepolia.id,
        to,
        value: wei,
        nonce,
        gas: 21000n,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      },
    });
    const signed = await result;
    if (!signed.approved || signed.chain !== "evm") return update(rejection(signed));
    await this.track(
      id,
      update,
      () => this.evm.sendRawTransaction({ serializedTransaction: signed.signed }),
      async (hash) => {
        const receipt = await this.evm.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        if (receipt.status !== "success") throw new OnChainError("Reverted on-chain.");
      },
    );
  }
}

class OnChainError extends Error {}

function rejection(r: SignResult): Partial<Activity> {
  if (r.approved) return {};
  const why = {
    rejected: undefined,
    power: "The Game Boy was switched off before you answered.",
    locked: "The cartridge was locked before you answered.",
    error: "The cartridge couldn't sign this.",
  }[r.reason];
  return { state: r.reason === "error" ? "failed" : "rejected", error: why };
}

/** Plain decimal only ("0.5", ".25", "3"), exact to the chain's decimals, above zero. */
export function parseAmount(text: string, decimals: number): bigint {
  const s = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) throw new Error("Enter an amount like 0.01.");
  const frac = s.split(".")[1] ?? "";
  if (frac.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const units = parseUnits(s.endsWith(".") ? s.slice(0, -1) : s, decimals);
  if (units <= 0n) throw new Error("Enter an amount above zero.");
  return units;
}

function isSolAddress(a: string) {
  try {
    new PublicKey(a);
    return true;
  } catch {
    return false;
  }
}

/** Turns RPC errors into a fixed reason for the Game Boy and a sentence for the phone. */
export function explainError(e: unknown): { short: FailReason; long: string } {
  const raw = e instanceof Error ? e.message : String(e);
  const msg = raw.toLowerCase();
  if (msg.includes("prior credit") || msg.includes("insufficient")) {
    return { short: "NO_FUNDS", long: "Not enough funds to cover the amount and the fee." };
  }
  if (msg.includes("blockhash") || msg.includes("expired")) {
    return { short: "EXPIRED", long: "The transaction expired before it landed. Try again." };
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("429")) {
    return { short: "NETWORK", long: "Couldn't reach the network. Check your connection and try again." };
  }
  return { short: "REJECTED", long: raw.split("\n")[0] };
}
