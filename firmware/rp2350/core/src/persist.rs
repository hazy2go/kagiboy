//! The stored wallet as bytes, for the cartridge's flash: a magic, the fields length-prefixed, and a CRC-32 so a
//! torn or blank sector reads as "no wallet" instead of garbage.
//!
//! With the software vault this keeps the recovery words in flash (development only). With the SE050 vault the record
//! holds no secret: the salt, the try counter, the pairing and the public keys; keys and PIN live in the SE050.

use alloc::string::String;
use alloc::vec::Vec;

use crate::chip::{Persisted, Phone};

const MAGIC: &[u8; 4] = b"KGB2"; // 2: public keys added

fn crc32(data: &[u8]) -> u32 {
    let mut c = !0u32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { (c >> 1) ^ 0xedb8_8320 } else { c >> 1 };
        }
    }
    !c
}

fn put(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u16).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

struct Reader<'a> {
    b: &'a [u8],
    p: usize,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Option<&[u8]> {
        let s = self.b.get(self.p..self.p.checked_add(n)?)?;
        self.p += n;
        Some(s)
    }
    fn str(&mut self) -> Option<String> {
        let n = u16::from_le_bytes(self.take(2)?.try_into().ok()?) as usize;
        String::from_utf8(self.take(n)?.to_vec()).ok()
    }
}

pub fn encode(p: &Persisted) -> Vec<u8> {
    let mut body = Vec::new();
    put(&mut body, &p.mnemonic);
    put(&mut body, &p.pin_salt);
    put(&mut body, &p.pin_hash);
    body.extend_from_slice(&p.tries_left.to_le_bytes());
    body.push(p.paired as u8);
    match &p.phone {
        Some(ph) => {
            body.push(1);
            put(&mut body, &ph.name);
            put(&mut body, &ph.id);
            body.extend_from_slice(&ph.since_ms.to_le_bytes());
        }
        None => body.push(0),
    }
    body.extend_from_slice(&p.sol_public);
    body.extend_from_slice(&p.evm_address);
    let mut out = Vec::from(&MAGIC[..]);
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out.extend_from_slice(&crc32(&body).to_le_bytes());
    out
}

pub fn decode(b: &[u8]) -> Option<Persisted> {
    if b.get(..4)? != MAGIC {
        return None;
    }
    let len = u32::from_le_bytes(b.get(4..8)?.try_into().ok()?) as usize;
    let body = b.get(8..8usize.checked_add(len)?)?;
    let crc = u32::from_le_bytes(b.get(8 + len..12 + len)?.try_into().ok()?);
    if crc32(body) != crc {
        return None;
    }
    let mut r = Reader { b: body, p: 0 };
    let mnemonic = r.str()?;
    let pin_salt = r.str()?;
    let pin_hash = r.str()?;
    let tries_left = i32::from_le_bytes(r.take(4)?.try_into().ok()?);
    let paired = r.take(1)?[0] != 0;
    let phone = match r.take(1)?[0] {
        0 => None,
        _ => Some(Phone { name: r.str()?, id: r.str()?, since_ms: u64::from_le_bytes(r.take(8)?.try_into().ok()?) }),
    };
    let sol_public = r.take(32)?.try_into().ok()?;
    let evm_address = r.take(20)?.try_into().ok()?;
    Some(Persisted { mnemonic, pin_salt, pin_hash, tries_left, paired, phone, sol_public, evm_address })
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::string::ToString;

    #[test]
    fn roundtrip_and_damage() {
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926); // the CRC-32 check value
        let p = Persisted {
            mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow".to_string(),
            pin_salt: "aa bb".to_string(),
            pin_hash: "cc dd".to_string(),
            tries_left: 3,
            paired: true,
            phone: Some(Phone { name: "PIXEL".to_string(), id: "735E".to_string(), since_ms: 1_792_056_600_000 }),
            sol_public: [7; 32],
            evm_address: [9; 20],
        };
        let b = encode(&p);
        assert_eq!(decode(&b), Some(p.clone()));
        let mut torn = b.clone();
        torn[10] ^= 1;
        assert_eq!(decode(&torn), None);
        assert_eq!(decode(&[0xff; 64]), None); // an erased sector
        assert_eq!(decode(&b[..b.len() - 1]), None);
        let none = Persisted { phone: None, paired: false, ..p };
        assert_eq!(decode(&encode(&none)), Some(none));
    }
}
