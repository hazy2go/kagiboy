//! BIP-39 words and the two account keys (`web/src/chip/keys.ts`):
//! Solana `m/44'/501'/0'/0'` by SLIP-0010 ed25519, EVM `m/44'/60'/0'/0/0` by BIP-32 secp256k1.

use alloc::string::String;
use alloc::vec::Vec;

use hmac::{Hmac, Mac};
use k256::elliptic_curve::sec1::ToEncodedPoint;
use sha2::{Digest, Sha256, Sha512};
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::eth;

static WORDS_TXT: &str = include_str!("english.txt");

/// The 2048 BIP-39 English words (SHA-256 of the list: 2f5eed53...b24dbda, the official file).
pub fn wordlist() -> impl Iterator<Item = &'static str> {
    WORDS_TXT.lines()
}

pub fn word(i: usize) -> &'static str {
    wordlist().nth(i).unwrap_or("")
}

/// 12 words from 16 bytes of entropy: 128 bits plus a 4-bit SHA-256 checksum, 11 bits per word.
pub fn entropy_to_mnemonic(entropy: &[u8; 16]) -> String {
    let cs = Sha256::digest(entropy)[0] >> 4;
    let mut bits: u128 = u128::from_be_bytes(*entropy);
    let mut idx = [0usize; 12];
    // 132 bits: the 128 entropy bits then the 4 checksum bits
    for (k, slot) in idx.iter_mut().enumerate().rev() {
        let v = if k == 11 {
            ((bits & 0x7f) as usize) << 4 | cs as usize
        } else {
            let shift = 7 + 11 * (10 - k) as u32;
            ((bits >> shift) & 0x7ff) as usize
        };
        *slot = v;
    }
    bits.zeroize();
    join(&idx)
}

fn join(idx: &[usize]) -> String {
    let mut out = String::new();
    for (k, &i) in idx.iter().enumerate() {
        if k > 0 {
            out.push(' ');
        }
        out.push_str(word(i));
    }
    out
}

/// Rebuilds a mnemonic from 12 word indices; None if an index is out of range or the checksum is wrong.
pub fn mnemonic_from_indices(indices: &[u16]) -> Option<String> {
    if indices.len() != 12 || indices.iter().any(|&i| i >= 2048) {
        return None;
    }
    let mut bits: u128 = 0;
    for &i in &indices[..11] {
        bits = bits << 11 | i as u128;
    }
    let last = indices[11] as u128;
    bits = bits << 7 | last >> 4;
    let entropy = bits.to_be_bytes();
    let ok = (Sha256::digest(entropy)[0] >> 4) as u128 == last & 0xf;
    let idx: Vec<usize> = indices.iter().map(|&i| i as usize).collect();
    ok.then(|| join(&idx))
}

/// Up to four words starting with `prefix`, an exact match first, otherwise in list order.
pub fn suggest_words(prefix: &str) -> Vec<(u16, &'static str)> {
    let mut hits: Vec<(u16, &'static str)> =
        wordlist().enumerate().filter(|(_, w)| w.starts_with(prefix)).map(|(i, w)| (i as u16, w)).collect();
    if let Some(pos) = hits.iter().position(|(_, w)| *w == prefix) {
        let exact = hits.remove(pos);
        hits.insert(0, exact);
    }
    hits.truncate(4);
    hits
}

/// The wallet's keys, held in RAM only while unlocked; wiped when dropped.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Wallet {
    pub mnemonic: String,
    pub sol_secret: [u8; 32],
    #[zeroize(skip)]
    pub sol_public: [u8; 32],
    pub evm_secret: [u8; 32],
    #[zeroize(skip)]
    pub evm_address: [u8; 20],
}

impl Wallet {
    pub fn from_mnemonic(mnemonic: &str) -> Wallet {
        let mut seed = [0u8; 64];
        pbkdf2::pbkdf2_hmac::<Sha512>(mnemonic.as_bytes(), b"mnemonic", 2048, &mut seed);
        let sol_secret = slip10_ed25519(&seed, &[44, 501, 0, 0]);
        let sol_public = ed25519_dalek::SigningKey::from_bytes(&sol_secret).verifying_key().to_bytes();
        let evm_secret = bip32_secp256k1(&seed, &[44 | HARD, 60 | HARD, HARD, 0, 0]);
        seed.zeroize();
        let evm_address = eth::address_of(&evm_secret);
        Wallet { mnemonic: String::from(mnemonic), sol_secret, sol_public, evm_secret, evm_address }
    }

    pub fn sol_address(&self) -> String {
        bs58::encode(self.sol_public).into_string()
    }

    pub fn evm_address_text(&self) -> String {
        eth::checksum_address(&self.evm_address)
    }
}

const HARD: u32 = 0x8000_0000;

fn hmac512(key: &[u8], parts: &[&[u8]]) -> [u8; 64] {
    let mut m = <Hmac<Sha512> as Mac>::new_from_slice(key).expect("any key length");
    for p in parts {
        m.update(p);
    }
    m.finalize().into_bytes().into()
}

/// SLIP-0010 ed25519 derivation (every level hardened).
fn slip10_ed25519(seed: &[u8; 64], path: &[u32]) -> [u8; 32] {
    let mut i = hmac512(b"ed25519 seed", &[seed]);
    for &index in path {
        let mut data = [0u8; 37];
        data[1..33].copy_from_slice(&i[..32]);
        data[33..].copy_from_slice(&(index | HARD).to_be_bytes());
        let next = hmac512(&i[32..], &[&data]);
        data.zeroize();
        i.zeroize();
        i = next;
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&i[..32]);
    i.zeroize();
    key
}

/// BIP-32 private derivation on secp256k1.
fn bip32_secp256k1(seed: &[u8; 64], path: &[u32]) -> [u8; 32] {
    use k256::elliptic_curve::PrimeField;
    use k256::{NonZeroScalar, Scalar, SecretKey};
    let mut i = hmac512(b"Bitcoin seed", &[seed]);
    for &index in path {
        let mut data = [0u8; 37];
        if index & HARD != 0 {
            data[1..33].copy_from_slice(&i[..32]);
        } else {
            let sk = SecretKey::from_slice(&i[..32]).expect("valid parent key");
            data[..33].copy_from_slice(sk.public_key().to_encoded_point(true).as_bytes());
        }
        data[33..].copy_from_slice(&index.to_be_bytes());
        let next = hmac512(&i[32..], &[&data]);
        data.zeroize();
        let field = |b: &[u8]| k256::FieldBytes::from(<[u8; 32]>::try_from(b).expect("32 bytes"));
        let parent = Scalar::from_repr(field(&i[..32])).unwrap();
        let tweak = Scalar::from_repr(field(&next[..32])).unwrap();
        let child: NonZeroScalar = Option::from(NonZeroScalar::new(parent + tweak)).expect("BIP-32: invalid child key");
        i.zeroize();
        i = next;
        i[..32].copy_from_slice(&child.to_repr());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&i[..32]);
    i.zeroize();
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bip39_vectors() {
        // Trezor reference vectors (bip39 vectors.json)
        assert_eq!(entropy_to_mnemonic(&[0; 16]), "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
        assert_eq!(entropy_to_mnemonic(&[0x7f; 16]), "legal winner thank year wave sausage worth useful legal winner thank yellow");
        assert_eq!(entropy_to_mnemonic(&[0xff; 16]), "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong");
        let idx: Vec<u16> = "legal winner thank year wave sausage worth useful legal winner thank yellow"
            .split(' ')
            .map(|w| wordlist().position(|x| x == w).unwrap() as u16)
            .collect();
        assert!(mnemonic_from_indices(&idx).is_some());
        let mut bad = idx.clone();
        bad[11] ^= 1;
        assert!(mnemonic_from_indices(&bad).is_none());
    }

    #[test]
    fn known_addresses() {
        // the well-known test mnemonic: MetaMask's first account and Phantom's first Solana account
        let w = Wallet::from_mnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
        assert_eq!(w.evm_address_text(), "0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
        assert_eq!(w.sol_address(), "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
    }
}
