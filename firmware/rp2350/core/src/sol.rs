//! Solana legacy messages: just enough to recognise one plain System transfer and sign it
//! (web3.js `Message.from`, `Transaction.populate`, `SystemInstruction.decodeTransfer`).

use alloc::vec::Vec;

use crate::Error;

pub const SYSTEM_PROGRAM: [u8; 32] = [0; 32];

pub struct Message {
    pub num_required_signatures: u8,
    pub account_keys: Vec<[u8; 32]>,
    pub instructions: Vec<Instruction>,
}

pub struct Instruction {
    pub program_id_index: u8,
    pub accounts: Vec<u8>,
    pub data: Vec<u8>,
}

fn compact_u16(b: &[u8], p: &mut usize) -> Option<usize> {
    let mut v = 0usize;
    for shift in [0, 7, 14] {
        let x = *b.get(*p)?;
        *p += 1;
        v |= ((x & 0x7f) as usize) << shift;
        if x & 0x80 == 0 {
            return Some(v);
        }
    }
    None
}

pub fn put_compact_u16(mut v: usize, out: &mut Vec<u8>) {
    loop {
        let mut x = (v & 0x7f) as u8;
        v >>= 7;
        if v != 0 {
            x |= 0x80;
        }
        out.push(x);
        if v == 0 {
            break;
        }
    }
}

impl Message {
    pub fn parse(b: &[u8]) -> Result<Message, Error> {
        if b.first().is_some_and(|x| x & 0x80 != 0) {
            return Err(Error::from("Versioned messages must be deserialized with VersionedMessage.deserialize()"));
        }
        Self::parse_legacy(b).ok_or_else(|| Error::from("could not read the Solana message"))
    }

    fn parse_legacy(b: &[u8]) -> Option<Message> {
        let mut p = 0;
        let header = b.get(0..3)?;
        p += 3;
        let n_keys = compact_u16(b, &mut p)?;
        let mut account_keys = Vec::with_capacity(n_keys);
        for _ in 0..n_keys {
            account_keys.push(<[u8; 32]>::try_from(b.get(p..p + 32)?).ok()?);
            p += 32;
        }
        b.get(p..p + 32)?; // recent blockhash
        p += 32;
        let n_ix = compact_u16(b, &mut p)?;
        let mut instructions = Vec::with_capacity(n_ix);
        for _ in 0..n_ix {
            let program_id_index = *b.get(p)?;
            p += 1;
            let n_acc = compact_u16(b, &mut p)?;
            let accounts = b.get(p..p + n_acc)?.to_vec();
            p += n_acc;
            let n_data = compact_u16(b, &mut p)?;
            let data = b.get(p..p + n_data)?.to_vec();
            p += n_data;
            instructions.push(Instruction { program_id_index, accounts, data });
        }
        if p != b.len() {
            return None;
        }
        Some(Message { num_required_signatures: header[0], account_keys, instructions })
    }

    fn key(&self, i: u8) -> Option<&[u8; 32]> {
        self.account_keys.get(i as usize)
    }
}

/// The checks the browser chip makes before it will show a Solana request, in the same order and with the same
/// messages. Returns (to, lamports).
pub fn plain_transfer(m: &Message, me: &[u8; 32]) -> Result<([u8; 32], u64), Error> {
    let payer = if m.num_required_signatures > 0 { m.account_keys.first() } else { None };
    if payer != Some(me) {
        return Err(Error::from("the fee payer must be this cartridge's wallet"));
    }
    if m.instructions.len() != 1 || m.key(m.instructions[0].program_id_index) != Some(&SYSTEM_PROGRAM) {
        return Err(Error::from("only plain SOL transfers can be shown on the Game Boy yet"));
    }
    let ix = &m.instructions[0];
    let ty = ix.data.get(0..4).map(|t| u32::from_le_bytes(t.try_into().unwrap()));
    if ty != Some(2) || ix.data.len() < 12 {
        return Err(Error::from("only plain SOL transfers are supported"));
    }
    if ix.accounts.len() < 2 {
        return Err(Error::from("keys length 1 < 2"));
    }
    let from = m.key(ix.accounts[0]).ok_or("bad account index")?;
    let to = *m.key(ix.accounts[1]).ok_or("bad account index")?;
    let lamports = u64::from_le_bytes(ix.data[4..12].try_into().unwrap());
    if from != me {
        return Err(Error::from("the transfer must come from this cartridge's wallet"));
    }
    Ok((to, lamports))
}

/// Signed transaction wire bytes: signature count, signatures (ours first, fee payer), then the message.
pub fn signed_transaction(num_signers: u8, signature: &[u8; 64], message: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    put_compact_u16(num_signers as usize, &mut out);
    out.extend_from_slice(signature);
    for _ in 1..num_signers {
        out.extend_from_slice(&[0u8; 64]);
    }
    out.extend_from_slice(message);
    out
}
