//! The phone link: the messages the companion app sends over Bluetooth and the cartridge's replies.
//!
//! Spec: docs/phone-link.md. The ESP32-C3 passes messages through unchanged; this answers them. It is the twin of
//! `ChipServer` in `web/src/chip/link.ts` and must match it byte for byte (the recorded sessions hold both sides).
//!
//! Request `[op] [tag] [body]`, reply `[op | 0x80] [tag] [status] [body]`, at most 240 bytes each way. Status 0 ok,
//! 1 refused (the body is the reason as text, the browser chip's wording), 2 malformed.

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

use crate::chip::{Chip, Platform, SignRequest, SignResult, Store, SwapRequest};
use crate::vault::Vault;
use crate::{Chain, Error};

pub const LINK_MAX: usize = 240;
pub const CHUNK: usize = 232;
pub const STAGE: usize = 2048;

pub mod op {
    pub const STATUS: u8 = 0x01;
    pub const PAIR: u8 = 0x02;
    pub const UNPAIR: u8 = 0x03;
    pub const NETWORK: u8 = 0x04;
    pub const BALANCE: u8 = 0x05;
    pub const TXSTATUS: u8 = 0x06;
    pub const PUT: u8 = 0x07;
    pub const SIGN: u8 = 0x08;
    pub const RESULT: u8 = 0x09;
    pub const GET: u8 = 0x0a;
}

pub mod st {
    pub const OK: u8 = 0;
    pub const REFUSED: u8 = 1;
    pub const MALFORMED: u8 = 2;
}

mod kind {
    pub const WAIT: u8 = 0;
    pub const SOL: u8 = 1;
    pub const EVM: u8 = 2;
    pub const SWAP: u8 = 3;
    pub const REFUSED: u8 = 4;
}

enum Fail {
    Malformed,
    Refused(String),
}

impl From<Error> for Fail {
    fn from(e: Error) -> Fail {
        Fail::Refused(e.0)
    }
}

struct Rd<'a> {
    b: &'a [u8],
    p: usize,
}

impl<'a> Rd<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], Fail> {
        let s = self.b.get(self.p..self.p + n).ok_or(Fail::Malformed)?;
        self.p += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, Fail> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, Fail> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }
    fn u32(&mut self) -> Result<u32, Fail> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn u64(&mut self) -> Result<u64, Fail> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn u128(&mut self) -> Result<u128, Fail> {
        Ok(u128::from_le_bytes(self.take(16)?.try_into().unwrap()))
    }
    fn rest(&mut self) -> &'a [u8] {
        let s = &self.b[self.p..];
        self.p = self.b.len();
        s
    }
    /// A length-prefixed UTF-8 string; length 0xFF is "none".
    fn str(&mut self) -> Result<Option<&'a str>, Fail> {
        let n = self.u8()?;
        if n == 0xff {
            return Ok(None);
        }
        core::str::from_utf8(self.take(n as usize)?).map(Some).map_err(|_| Fail::Malformed)
    }
    fn end(&self) -> Result<(), Fail> {
        if self.p == self.b.len() {
            Ok(())
        } else {
            Err(Fail::Malformed)
        }
    }
}

fn put_str(out: &mut Vec<u8>, s: &str) {
    out.push(s.len() as u8);
    out.extend_from_slice(s.as_bytes());
}

/// The cartridge's end of the phone link: staging for long transactions and the last reply, kept beside the chip.
pub struct PhoneServer {
    stage_in: Vec<u8>,
    stage_out: Vec<u8>,
    /// the last result handed out, so a phone that lost the reply can ask again
    last_result: Option<(u32, Vec<u8>, Vec<u8>)>,
    /// the last request and its reply: the same message again (same tag) gets the same reply, not a second effect
    last: Option<(Vec<u8>, Vec<u8>)>,
}

impl Default for PhoneServer {
    fn default() -> Self {
        Self::new()
    }
}

impl PhoneServer {
    pub fn new() -> PhoneServer {
        PhoneServer { stage_in: vec![0; STAGE], stage_out: Vec::new(), last_result: None, last: None }
    }

    pub fn handle<S: Store, V: Vault>(&mut self, chip: &mut Chip<S, V>, req: &[u8], p: &mut impl Platform) -> Vec<u8> {
        if let Some((q, r)) = &self.last {
            if q.as_slice() == req && req.len() >= 2 && req[1] != 0 {
                return r.clone();
            }
        }
        let head = |status: u8| vec![req.first().copied().unwrap_or(0) | 0x80, req.get(1).copied().unwrap_or(0), status];
        let rep = match self.serve(chip, req, p) {
            Ok(body) => {
                let mut r = head(st::OK);
                r.extend_from_slice(&body);
                r
            }
            Err(Fail::Malformed) => head(st::MALFORMED),
            Err(Fail::Refused(text)) => {
                let mut r = head(st::REFUSED);
                r.extend_from_slice(text.as_bytes());
                r
            }
        };
        self.last = Some((req.to_vec(), rep.clone()));
        rep
    }

    fn serve<S: Store, V: Vault>(&mut self, chip: &mut Chip<S, V>, req: &[u8], p: &mut impl Platform) -> Result<Vec<u8>, Fail> {
        let mut r = Rd { b: req, p: 0 };
        let o = r.u8()?;
        r.u8()?; // tag
        match o {
            op::STATUS => {
                let now = r.u64()?;
                r.end()?;
                p.set_now_ms(now);
                chip.expire(p);
                Ok(status(chip, p))
            }
            op::PAIR => {
                let name = r.str()?.unwrap_or("PHONE");
                r.end()?;
                let code = chip.request_pairing(name, p)?;
                Ok(code.into_bytes())
            }
            op::UNPAIR => {
                r.end()?;
                chip.unpair();
                Ok(Vec::new())
            }
            op::NETWORK => {
                let id = r.u64()?;
                r.end()?;
                chip.set_evm_network(id);
                Ok(Vec::new())
            }
            op::BALANCE => {
                let chain = if r.u8()? == 0 { Chain::Sol } else { Chain::Evm };
                let has = r.u8()?;
                let units = r.u128()?;
                r.end()?;
                chip.set_balance(chain, if has != 0 { Some(units) } else { None });
                Ok(Vec::new())
            }
            op::TXSTATUS => {
                let id = r.u32()?;
                let state = r.str()?.unwrap_or("");
                let hash = r.str()?;
                let reason = r.str()?;
                r.end()?;
                chip.set_tx_status(id, state, hash, reason);
                Ok(Vec::new())
            }
            op::PUT => {
                let off = r.u16()? as usize;
                let data = r.rest();
                if off + data.len() > STAGE {
                    return Err(Fail::Malformed);
                }
                self.stage_in[off..off + data.len()].copy_from_slice(data);
                Ok(Vec::new())
            }
            op::SIGN => {
                let k = r.u8()?;
                let sreq = match k {
                    0 | 1 => {
                        let len = r.u16()? as usize;
                        r.end()?;
                        if len > STAGE {
                            return Err(Fail::Malformed);
                        }
                        let bytes = self.stage_in[..len].to_vec();
                        if k == 0 {
                            SignRequest::Sol(bytes)
                        } else {
                            SignRequest::Evm(bytes)
                        }
                    }
                    2 => {
                        let src = r.u64()?;
                        let dst = r.u64()?;
                        let sell_amount = r.u128()?;
                        let min_receive = r.u128()?;
                        let deadline = r.u64()? as i64;
                        let sell_token = r.str()?.unwrap_or("").into();
                        let buy_token = r.str()?.unwrap_or("").into();
                        r.end()?;
                        SignRequest::Swap(SwapRequest { src, dst, sell_token, sell_amount, buy_token, min_receive, deadline })
                    }
                    _ => return Err(Fail::Malformed),
                };
                let id = chip.request_signature(&sreq, p)?;
                Ok(id.to_le_bytes().to_vec())
            }
            op::RESULT => {
                let id = r.u32()?;
                r.end()?;
                if let Some((lid, body, out)) = &self.last_result {
                    if *lid == id {
                        self.stage_out = out.clone();
                        return Ok(body.clone());
                    }
                }
                let Some(res) = chip.take_result(id) else { return Ok(vec![kind::WAIT]) };
                let mut body = Vec::new();
                let mut out = Vec::new();
                match res {
                    SignResult::Refused(reason) => {
                        body.push(kind::REFUSED);
                        put_str(&mut body, reason);
                    }
                    SignResult::Swap { signature, digest } => {
                        body.push(kind::SWAP);
                        put_str(&mut body, &signature);
                        put_str(&mut body, &digest);
                    }
                    SignResult::Sol(b) => {
                        body.push(kind::SOL);
                        body.extend_from_slice(&(b.len() as u16).to_le_bytes());
                        out = b;
                    }
                    SignResult::Evm(b) => {
                        body.push(kind::EVM);
                        body.extend_from_slice(&(b.len() as u16).to_le_bytes());
                        out = b;
                    }
                }
                self.stage_out = out.clone();
                self.last_result = Some((id, body.clone(), out));
                Ok(body)
            }
            op::GET => {
                let off = r.u16()? as usize;
                r.end()?;
                if off > self.stage_out.len() {
                    return Err(Fail::Malformed);
                }
                Ok(self.stage_out[off..(off + CHUNK).min(self.stage_out.len())].to_vec())
            }
            _ => Err(Fail::Malformed),
        }
    }
}

fn status<S: Store, V: Vault>(chip: &Chip<S, V>, p: &impl Platform) -> Vec<u8> {
    let v = chip.view(p);
    let f = v.paired as u8 | (v.has_pending as u8) << 1 | (v.pair_window_open as u8) << 2 | (v.public.is_some() as u8) << 3 | (v.pairing_code.is_some() as u8) << 4;
    let mut out = vec![v.state, f, v.pairing_end];
    out.extend_from_slice(&v.evm_network.to_le_bytes());
    if let Some(code) = v.pairing_code {
        out.extend_from_slice(code.as_bytes());
    }
    if let Some(pk) = v.public {
        out.extend_from_slice(&pk.sol);
        out.extend_from_slice(&pk.evm);
    }
    if let Some(ph) = v.phone {
        put_str(&mut out, &ph.name);
        put_str(&mut out, &ph.id);
        out.extend_from_slice(&ph.since_ms.to_le_bytes());
    }
    out
}
