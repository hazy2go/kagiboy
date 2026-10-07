import { Keypair } from "@solana/web3.js";
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

export interface Wallet {
  mnemonic: string;
  sol: Keypair;
  evm: HDAccount;
}

/** 128 bits from the hardware RNG, hashed together with the user's pool. */
export function newMnemonic(pool: Uint8Array): string {
  const trng = crypto.getRandomValues(new Uint8Array(32));
  const mixed = sha256(concat(pool, trng));
  return entropyToMnemonic(mixed.slice(0, 16), wordlist);
}

/** Up to `max` BIP-39 words starting with `prefix`, an exact match first. */
export function suggestWords(prefix: string, max = 4): { index: number; word: string }[] {
  const hits = wordlist.flatMap((word, index) => (word.startsWith(prefix) ? [{ index, word }] : []));
  hits.sort((a, b) => Number(b.word === prefix) - Number(a.word === prefix));
  return hits.slice(0, max);
}

/** Rebuilds a mnemonic from word indices; null if the checksum is wrong. */
export function mnemonicFromIndices(indices: number[]): string | null {
  if (indices.length !== 12 || indices.some((i) => !(i >= 0 && i < 2048))) return null;
  const mnemonic = indices.map((i) => wordlist[i]).join(" ");
  return validateMnemonic(mnemonic, wordlist) ? mnemonic : null;
}

export function walletFromMnemonic(mnemonic: string): Wallet {
  const seed = mnemonicToSeedSync(mnemonic);
  return {
    mnemonic,
    // m/44'/501'/0'/0' is what Phantom and Solflare use
    sol: Keypair.fromSeed(slip10Ed25519(seed, [44, 501, 0, 0])),
    // m/44'/60'/0'/0/0, the MetaMask default
    evm: mnemonicToAccount(mnemonic),
  };
}

/** SLIP-0010 ed25519 derivation (hardened-only). */
function slip10Ed25519(seed: Uint8Array, path: number[]): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const index of path) {
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (index | 0x80000000) >>> 0);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
