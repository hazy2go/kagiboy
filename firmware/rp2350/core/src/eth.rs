//! Ethereum pieces the chip needs: addresses (EIP-55), RLP, EIP-1559 transactions and EIP-191 messages,
//! byte-for-byte what viem produces in the browser chip.

use alloc::string::String;
use alloc::vec::Vec;

use k256::ecdsa::{RecoveryId, Signature, SigningKey};
use sha3::{Digest, Keccak256};

pub fn keccak(data: &[u8]) -> [u8; 32] {
    Keccak256::digest(data).into()
}

pub fn address_of(secret: &[u8; 32]) -> [u8; 20] {
    let sk = SigningKey::from_slice(secret).expect("valid secp256k1 key");
    let point = sk.verifying_key().to_encoded_point(false);
    let h = keccak(&point.as_bytes()[1..]);
    let mut a = [0u8; 20];
    a.copy_from_slice(&h[12..]);
    a
}

const HEX: &[u8; 16] = b"0123456789abcdef";

pub fn hex_lower(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push(HEX[(x >> 4) as usize] as char);
        s.push(HEX[(x & 15) as usize] as char);
    }
    s
}

/// EIP-55 mixed-case checksum address, "0x" prefixed (viem `getAddress`).
pub fn checksum_address(a: &[u8; 20]) -> String {
    let lower = hex_lower(a);
    let h = keccak(lower.as_bytes());
    let mut out = String::from("0x");
    for (i, c) in lower.chars().enumerate() {
        let nib = if i % 2 == 0 { h[i / 2] >> 4 } else { h[i / 2] & 15 };
        out.push(if c.is_ascii_alphabetic() && nib >= 8 { c.to_ascii_uppercase() } else { c });
    }
    out
}

// ---------------------------------------------------------------- RLP

#[derive(Debug, Clone, PartialEq)]
pub enum Rlp {
    Bytes(Vec<u8>),
    List(Vec<Rlp>),
}

fn be_len(n: usize) -> Vec<u8> {
    let b = (n as u64).to_be_bytes();
    let first = b.iter().position(|&x| x != 0).unwrap_or(7);
    b[first..].to_vec()
}

pub fn rlp_encode(item: &Rlp, out: &mut Vec<u8>) {
    match item {
        Rlp::Bytes(b) if b.len() == 1 && b[0] < 0x80 => out.push(b[0]),
        Rlp::Bytes(b) => {
            header(0x80, b.len(), out);
            out.extend_from_slice(b);
        }
        Rlp::List(items) => {
            let mut body = Vec::new();
            for it in items {
                rlp_encode(it, &mut body);
            }
            header(0xc0, body.len(), out);
            out.extend_from_slice(&body);
        }
    }
}

fn header(base: u8, len: usize, out: &mut Vec<u8>) {
    if len < 56 {
        out.push(base + len as u8);
    } else {
        let l = be_len(len);
        out.push(base + 55 + l.len() as u8);
        out.extend_from_slice(&l);
    }
}

/// Strict decode of one item that must fill `data` exactly.
pub fn rlp_decode(data: &[u8]) -> Option<Rlp> {
    let (item, used) = decode_at(data)?;
    (used == data.len()).then_some(item)
}

fn decode_at(d: &[u8]) -> Option<(Rlp, usize)> {
    let b0 = *d.first()?;
    let (is_list, off, len) = match b0 {
        0x00..=0x7f => return Some((Rlp::Bytes(alloc::vec![b0]), 1)),
        0x80..=0xb7 => (false, 1, (b0 - 0x80) as usize),
        0xb8..=0xbf => {
            let n = (b0 - 0xb7) as usize;
            (false, 1 + n, read_len(d.get(1..1 + n)?)?)
        }
        0xc0..=0xf7 => (true, 1, (b0 - 0xc0) as usize),
        0xf8..=0xff => {
            let n = (b0 - 0xf7) as usize;
            (true, 1 + n, read_len(d.get(1..1 + n)?)?)
        }
    };
    let body = d.get(off..off.checked_add(len)?)?;
    if !is_list {
        return Some((Rlp::Bytes(body.to_vec()), off + len));
    }
    let mut items = Vec::new();
    let mut p = 0;
    while p < body.len() {
        let (it, used) = decode_at(&body[p..])?;
        items.push(it);
        p += used;
    }
    Some((Rlp::List(items), off + len))
}

fn read_len(b: &[u8]) -> Option<usize> {
    if b.is_empty() || b.len() > 4 || b[0] == 0 {
        return None;
    }
    Some(b.iter().fold(0usize, |a, &x| a << 8 | x as usize))
}

fn uint(v: u128) -> Rlp {
    let b = v.to_be_bytes();
    let first = b.iter().position(|&x| x != 0).unwrap_or(16);
    Rlp::Bytes(b[first..].to_vec())
}

fn as_uint(r: &Rlp) -> Option<u128> {
    let Rlp::Bytes(b) = r else { return None };
    if b.len() > 16 || (b.len() > 1 && b[0] == 0) {
        return None;
    }
    Some(b.iter().fold(0u128, |a, &x| a << 8 | x as u128))
}

// ---------------------------------------------------------------- EIP-1559

/// An EIP-1559 transaction as the chip snapshots it. Amounts that don't fit 128 bits are refused when parsed.
#[derive(Debug, Clone, PartialEq)]
pub struct Tx1559 {
    pub chain_id: u64,
    pub nonce: u64,
    pub max_priority_fee_per_gas: u128,
    pub max_fee_per_gas: u128,
    pub gas: u128,
    pub to: Option<[u8; 20]>,
    pub value: u128,
    pub data: Vec<u8>,
    pub access_list_len: usize,
    access_list: Rlp,
}

impl Tx1559 {
    /// The phone's request: `0x02 || rlp([chainId, nonce, tip, maxFee, gas, to, value, data, accessList])`, unsigned.
    pub fn parse_unsigned(wire: &[u8]) -> Option<Tx1559> {
        let (&ty, rest) = wire.split_first()?;
        if ty != 0x02 {
            return None;
        }
        let Rlp::List(f) = rlp_decode(rest)? else { return None };
        if f.len() != 9 {
            return None;
        }
        let to = match &f[5] {
            Rlp::Bytes(b) if b.is_empty() => None,
            Rlp::Bytes(b) if b.len() == 20 => Some(<[u8; 20]>::try_from(b.as_slice()).ok()?),
            _ => return None,
        };
        let Rlp::Bytes(data) = &f[7] else { return None };
        let Rlp::List(al) = &f[8] else { return None };
        Some(Tx1559 {
            chain_id: u64::try_from(as_uint(&f[0])?).ok()?,
            nonce: u64::try_from(as_uint(&f[1])?).ok()?,
            max_priority_fee_per_gas: as_uint(&f[2])?,
            max_fee_per_gas: as_uint(&f[3])?,
            gas: as_uint(&f[4])?,
            to,
            value: as_uint(&f[6])?,
            data: data.clone(),
            access_list_len: al.len(),
            access_list: f[8].clone(),
        })
    }

    fn fields(&self) -> Vec<Rlp> {
        alloc::vec![
            uint(self.chain_id as u128),
            uint(self.nonce as u128),
            uint(self.max_priority_fee_per_gas),
            uint(self.max_fee_per_gas),
            uint(self.gas),
            Rlp::Bytes(self.to.map(|a| a.to_vec()).unwrap_or_default()),
            uint(self.value),
            Rlp::Bytes(self.data.clone()),
            self.access_list.clone(),
        ]
    }

    fn encode(fields: Vec<Rlp>) -> Vec<u8> {
        let mut out = alloc::vec![0x02];
        rlp_encode(&Rlp::List(fields), &mut out);
        out
    }

    /// The digest that gets signed: keccak256(0x02 || rlp(unsigned fields)).
    pub fn signing_hash(&self) -> [u8; 32] {
        keccak(&Self::encode(self.fields()))
    }

    /// Signed wire bytes, as viem's `signTransaction` returns them, from a low-S signature and its parity.
    pub fn encode_signed(&self, sig: &[u8; 64], y_odd: bool) -> Vec<u8> {
        let mut f = self.fields();
        f.push(uint(y_odd as u128));
        f.push(Rlp::Bytes(strip(&sig[..32])));
        f.push(Rlp::Bytes(strip(&sig[32..])));
        Self::encode(f)
    }

    /// Signed with a key held here (tests and the software vault).
    pub fn sign(&self, secret: &[u8; 32]) -> Vec<u8> {
        let (sig, rec) = sign_prehash(secret, &self.signing_hash());
        self.encode_signed(&sig.to_bytes().into(), rec.is_y_odd())
    }
}

/// Any (r, s) for `digest` made with the key behind `address` (a secure element signs with a random nonce and may
/// return a high S): normalised to low S as Ethereum requires, with the y parity found by recovering the address.
pub fn normalize(digest: &[u8; 32], r: &[u8; 32], s: &[u8; 32], address: &[u8; 20]) -> Option<([u8; 64], bool)> {
    use k256::ecdsa::VerifyingKey;
    let mut rs = [0u8; 64];
    rs[..32].copy_from_slice(r);
    rs[32..].copy_from_slice(s);
    let mut sig = Signature::from_slice(&rs).ok()?;
    if let Some(low) = sig.normalize_s() {
        sig = low;
    }
    for odd in [false, true] {
        let rec = RecoveryId::new(odd, false);
        if let Ok(vk) = VerifyingKey::recover_from_prehash(digest, &sig, rec) {
            let point = vk.to_encoded_point(false);
            if keccak(&point.as_bytes()[1..])[12..] == address[..] {
                return Some((sig.to_bytes().into(), odd));
            }
        }
    }
    None
}

/// The EIP-191 digest of raw bytes: keccak256("\x19Ethereum Signed Message:\n" || len || raw).
pub fn personal_hash(raw: &[u8]) -> [u8; 32] {
    let mut m = Vec::from(&b"\x19Ethereum Signed Message:\n"[..]);
    m.extend_from_slice(alloc::format!("{}", raw.len()).as_bytes());
    m.extend_from_slice(raw);
    keccak(&m)
}

fn strip(b: &[u8]) -> Vec<u8> {
    let first = b.iter().position(|&x| x != 0).unwrap_or(b.len());
    b[first..].to_vec()
}

/// Deterministic (RFC 6979) secp256k1 signature with low S, the way viem / noble sign.
pub fn sign_prehash(secret: &[u8; 32], digest: &[u8; 32]) -> (Signature, RecoveryId) {
    let sk = SigningKey::from_slice(secret).expect("valid secp256k1 key");
    sk.sign_prehash_recoverable(digest).expect("signing a 32-byte digest")
}

/// EIP-191 `personal_sign` of raw bytes (viem `signMessage({ message: { raw } })`): r || s || v, v = 27 / 28.
pub fn sign_message(secret: &[u8; 32], raw: &[u8]) -> [u8; 65] {
    let (sig, rec) = sign_prehash(secret, &personal_hash(raw));
    let mut out = [0u8; 65];
    out[..64].copy_from_slice(&sig.to_bytes());
    out[64] = 27 + rec.is_y_odd() as u8;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eip55() {
        // EIP-55 reference vectors
        for a in ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB"] {
            let mut b = [0u8; 20];
            for i in 0..20 {
                b[i] = u8::from_str_radix(&a[2 + 2 * i..4 + 2 * i], 16).unwrap();
            }
            assert_eq!(checksum_address(&b), a);
        }
    }

    #[test]
    fn rlp_roundtrip() {
        let item = Rlp::List(alloc::vec![uint(0), uint(1024), Rlp::Bytes(alloc::vec![0xaa; 60]), Rlp::List(alloc::vec![])]);
        let mut enc = Vec::new();
        rlp_encode(&item, &mut enc);
        assert_eq!(rlp_decode(&enc).unwrap(), item);
        assert!(rlp_decode(&[0x81, 0x00, 0x00]).is_none()); // trailing byte
    }
}
