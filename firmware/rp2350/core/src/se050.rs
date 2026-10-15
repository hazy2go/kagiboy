//! NXP SE050 driver: T=1 over I2C (the UM11225 variant NXP's Plug & Trust middleware implements) and the IoT applet
//! APDUs the wallet needs (AN12413 Rev 2.12). Written for kagiboy from those documents (MIT); no NXP code is linked.
//!
//! Transport (cross-checked against the middleware's phNxpEseProto7816_3.c / phNxpEse_Api.c, BSD-3-Clause):
//! - frame = NAD | PCB | LEN | INF | CRC16; NAD 0x5A host -> SE, 0xA5 SE -> host; INF <= 254 bytes.
//! - CRC: reflected CRC-16 (poly 0x8408, init 0xFFFF, xorout 0xFFFF), sent with the low byte first.
//! - I-block PCB = N(S) << 6 | 0x20 if more follows; R-block = 0x80 | N(R) << 4; S-block request 0xC0 | type,
//!   response 0xE0 | type (RESYNCH 0, WTX 3, END_OF_APDU 5, CHIP_RESET 6, ATR 7). A WTX request is answered with
//!   INF 0x01.
//! - Reading: the SE NACKs its address while busy; poll 2 bytes until NAD 0xA5, then LEN, then LEN + 2.

use alloc::vec;
use alloc::vec::Vec;

/// 7-bit I2C address of the SE050.
pub const ADDR: u8 = 0x48;
pub const IFS: usize = 254;

pub trait I2c {
    /// Err when the SE050 NACKs (busy) or the bus fails.
    fn write(&mut self, addr: u8, bytes: &[u8]) -> Result<(), ()>;
    fn read(&mut self, addr: u8, buf: &mut [u8]) -> Result<(), ()>;
    fn delay_ms(&mut self, ms: u32);
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SeError {
    /// no frame within the polling budget, or the bus failed
    Bus,
    /// a frame failed its CRC or was malformed, even after retries
    Protocol,
    /// the applet answered with this status word
    Status(u16),
    /// the response body wasn't what the command promises
    BadResponse,
}

pub fn crc16(data: &[u8]) -> [u8; 2] {
    let mut c: u16 = 0xffff;
    for &b in data {
        c ^= b as u16;
        for _ in 0..8 {
            c = if c & 1 != 0 { (c >> 1) ^ 0x8408 } else { c >> 1 };
        }
    }
    c ^= 0xffff;
    [c as u8, (c >> 8) as u8]
}

pub fn frame(pcb: u8, inf: &[u8]) -> Vec<u8> {
    let mut f = Vec::with_capacity(inf.len() + 5);
    f.extend_from_slice(&[0x5a, pcb, inf.len() as u8]);
    f.extend_from_slice(inf);
    let crc = crc16(&f);
    f.extend_from_slice(&crc);
    f
}

/// A received frame: (PCB, INF).
fn parse(f: &[u8]) -> Option<(u8, Vec<u8>)> {
    if f.len() < 5 || f[0] != 0xa5 || f[2] as usize + 5 != f.len() {
        return None;
    }
    let n = f.len();
    (crc16(&f[..n - 2]) == [f[n - 2], f[n - 1]]).then(|| (f[1], f[3..n - 2].to_vec()))
}

const S_REQ: u8 = 0xc0;
const S_RSP: u8 = 0xe0;
const S_RESYNCH: u8 = 0x00;
const S_WTX: u8 = 0x03;
const S_END_OF_APDU: u8 = 0x05;
const S_ATR: u8 = 0x07;

pub struct T1<B: I2c> {
    pub bus: B,
    /// our next I-block sequence number
    ns: u8,
    /// the SE's next I-block sequence number
    nr: u8,
    /// polls of 1 ms before a read gives up (WTX resets it)
    pub poll_budget: u32,
}

impl<B: I2c> T1<B> {
    pub fn new(bus: B) -> Self {
        T1 { bus, ns: 0, nr: 0, poll_budget: 2000 }
    }

    fn send(&mut self, f: &[u8]) -> Result<(), SeError> {
        for _ in 0..self.poll_budget {
            if self.bus.write(ADDR, f).is_ok() {
                return Ok(());
            }
            self.bus.delay_ms(1);
        }
        Err(SeError::Bus)
    }

    fn receive(&mut self) -> Result<Option<(u8, Vec<u8>)>, SeError> {
        let mut head = [0u8; 2];
        for _ in 0..self.poll_budget {
            if self.bus.read(ADDR, &mut head).is_ok() && head[0] == 0xa5 {
                let mut len = [0u8; 1];
                self.bus.read(ADDR, &mut len).map_err(|_| SeError::Bus)?;
                let mut rest = vec![0u8; len[0] as usize + 2];
                self.bus.read(ADDR, &mut rest).map_err(|_| SeError::Bus)?;
                let mut f = vec![head[0], head[1], len[0]];
                f.extend_from_slice(&rest);
                return Ok(parse(&f));
            }
            self.bus.delay_ms(1);
        }
        Err(SeError::Bus)
    }

    /// One S-block exchange; returns the response INF.
    fn s_block(&mut self, ty: u8) -> Result<Vec<u8>, SeError> {
        for _ in 0..3 {
            self.send(&frame(S_REQ | ty, &[]))?;
            match self.receive()? {
                Some((pcb, inf)) if pcb == S_RSP | ty => return Ok(inf),
                _ => continue,
            }
        }
        Err(SeError::Protocol)
    }

    /// Resynchronise and read the ATR (what the middleware does on open).
    pub fn open(&mut self) -> Result<Vec<u8>, SeError> {
        self.s_block(S_RESYNCH)?;
        self.ns = 0;
        self.nr = 0;
        self.s_block(S_ATR)
    }

    /// Ends the APDU session so the SE050 may enter power-down (applet sessions are kept).
    pub fn end_of_apdu(&mut self) -> Result<(), SeError> {
        self.s_block(S_END_OF_APDU).map(|_| ())
    }

    /// Sends one APDU (chained into I-blocks of at most 254 bytes) and returns the whole response.
    ///
    /// Errors are recovered the T=1 way: a chained block whose acknowledgement arrives damaged is sent again (the
    /// SE recognises the repeated N(S)), and a damaged response block is asked for again with an R-block carrying
    /// the error bit.
    pub fn transceive(&mut self, apdu: &[u8]) -> Result<Vec<u8>, SeError> {
        let chunks: Vec<&[u8]> = if apdu.is_empty() { vec![apdu] } else { apdu.chunks(IFS).collect() };
        let last = chunks.len() - 1;
        let mut first: Option<(u8, Vec<u8>)> = None;
        for (k, chunk) in chunks.iter().enumerate() {
            let more = if k < last { 0x20 } else { 0 };
            let f = frame(self.ns << 6 | more, chunk);
            self.send(&f)?;
            let mut tries = 0;
            loop {
                let r = self.receive_skipping_wtx()?;
                match (&r, more) {
                    // chained block acknowledged: R-block asking for our next sequence number
                    (Some((pcb, _)), 0x20) if pcb & 0xc0 == 0x80 && (pcb >> 4) & 1 == self.ns ^ 1 => break,
                    // the first block of the response
                    (Some((pcb, _)), 0) if pcb & 0x80 == 0 => {
                        first = r;
                        break;
                    }
                    (None, 0) => {
                        // damaged response block: ask for it again
                        tries += 1;
                        if tries > 3 {
                            return Err(SeError::Protocol);
                        }
                        self.send(&frame(0x80 | self.nr << 4 | 0x01, &[]))?;
                    }
                    _ => {
                        tries += 1;
                        if tries > 3 {
                            return Err(SeError::Protocol);
                        }
                        self.send(&f)?;
                    }
                }
            }
            self.ns ^= 1;
        }
        let (mut pcb, mut out) = first.ok_or(SeError::Protocol)?;
        if (pcb >> 6) & 1 != self.nr {
            return Err(SeError::Protocol);
        }
        self.nr ^= 1;
        // a chained response: acknowledge each block by asking for the next
        while pcb & 0x20 != 0 {
            let mut tries = 0;
            loop {
                self.send(&frame(0x80 | self.nr << 4, &[]))?;
                match self.receive_skipping_wtx()? {
                    Some((p, inf)) if p & 0x80 == 0 && (p >> 6) & 1 == self.nr => {
                        out.extend_from_slice(&inf);
                        pcb = p;
                        self.nr ^= 1;
                        break;
                    }
                    _ => {
                        tries += 1;
                        if tries > 3 {
                            return Err(SeError::Protocol);
                        }
                    }
                }
            }
        }
        Ok(out)
    }

    /// Reads a frame, answering any WTX requests on the way.
    fn receive_skipping_wtx(&mut self) -> Result<Option<(u8, Vec<u8>)>, SeError> {
        loop {
            match self.receive()? {
                Some((pcb, _)) if pcb == S_REQ | S_WTX => self.send(&frame(S_RSP | S_WTX, &[0x01]))?,
                other => return Ok(other),
            }
        }
    }
}

// ---------------------------------------------------------------- APDUs and TLVs (AN12413 chapter 4)

pub const INS_WRITE: u8 = 0x01;
pub const INS_READ: u8 = 0x02;
pub const INS_CRYPTO: u8 = 0x03;
pub const INS_MGMT: u8 = 0x04;
pub const INS_PROCESS: u8 = 0x05;
pub const INS_AUTH_OBJECT: u8 = 0x40;
pub const P1_DEFAULT: u8 = 0x00;
pub const P1_EC: u8 = 0x01;
pub const P1_KEY_PAIR: u8 = 0x60;
pub const P1_USERID: u8 = 0x07;
pub const P1_CURVE: u8 = 0x0b;
pub const P1_SIGNATURE: u8 = 0x0c;
pub const P2_DEFAULT: u8 = 0x00;
pub const P2_CREATE: u8 = 0x04;
pub const P2_SIGN: u8 = 0x09;
pub const P2_SESSION_CREATE: u8 = 0x1b;
pub const P2_SESSION_CLOSE: u8 = 0x1c;
pub const P2_LIST: u8 = 0x25;
pub const P2_EXIST: u8 = 0x27;
pub const P2_DELETE_OBJECT: u8 = 0x28;
pub const P2_SESSION_USERID: u8 = 0x2c;
pub const P2_PARAM: u8 = 0x40;
pub const P2_RANDOM: u8 = 0x49;
pub const TAG_SESSION_ID: u8 = 0x10;
pub const TAG_POLICY: u8 = 0x11;
pub const TAG_MAX_ATTEMPTS: u8 = 0x12;
pub const TAG_1: u8 = 0x41;
pub const TAG_2: u8 = 0x42;
pub const TAG_3: u8 = 0x43;
pub const TAG_4: u8 = 0x44;
pub const CURVE_SECP256K1: u8 = 0x10;
pub const CURVE_ED25519: u8 = 0x40;
pub const SIG_ECDSA_SHA_256: u8 = 0x21;
pub const SIG_ED25519_PURE: u8 = 0xa3;
pub const POLICY_ALLOW_SIGN: u32 = 0x1000_0000;
pub const POLICY_ALLOW_READ: u32 = 0x0020_0000;
pub const POLICY_ALLOW_WRITE: u32 = 0x0010_0000;
pub const POLICY_ALLOW_DELETE: u32 = 0x0004_0000;
pub const SW_OK: u16 = 0x9000;
pub const SW_CONDITIONS_NOT_SATISFIED: u16 = 0x6985;

pub const AID: [u8; 16] = [0xa0, 0x00, 0x00, 0x03, 0x96, 0x54, 0x53, 0x00, 0x00, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00, 0x00];

pub fn tlv(tag: u8, value: &[u8], out: &mut Vec<u8>) {
    out.push(tag);
    let n = value.len();
    if n < 0x80 {
        out.push(n as u8);
    } else if n <= 0xff {
        out.extend_from_slice(&[0x81, n as u8]);
    } else {
        out.extend_from_slice(&[0x82, (n >> 8) as u8, n as u8]);
    }
    out.extend_from_slice(value);
}

/// TLVs of a response body, in order.
pub fn tlvs(mut b: &[u8]) -> Option<Vec<(u8, &[u8])>> {
    let mut out = Vec::new();
    while !b.is_empty() {
        let tag = b[0];
        let (len, hdr) = match *b.get(1)? {
            n if n < 0x80 => (n as usize, 2),
            0x81 => (*b.get(2)? as usize, 3),
            0x82 => (((*b.get(2)? as usize) << 8) | *b.get(3)? as usize, 4),
            _ => return None,
        };
        out.push((tag, b.get(hdr..hdr + len)?));
        b = &b[hdr + len..];
    }
    Some(out)
}

/// ISO 7816-4 command APDU; extended length when the payload doesn't fit one byte.
pub fn apdu(cla: u8, ins: u8, p1: u8, p2: u8, data: &[u8], le: bool) -> Vec<u8> {
    let mut a = vec![cla, ins, p1, p2];
    let ext = data.len() > 0xff;
    if !data.is_empty() {
        if ext {
            a.extend_from_slice(&[0x00, (data.len() >> 8) as u8, data.len() as u8]);
        } else {
            a.push(data.len() as u8);
        }
        a.extend_from_slice(data);
    }
    if le {
        if ext {
            a.extend_from_slice(&[0x00, 0x00]);
        } else {
            a.push(0x00);
        }
    }
    a
}

/// An object policy: (authentication object id, access-rule header) pairs; id 0 means "all other users".
pub fn policy(rules: &[(u32, u32)]) -> Vec<u8> {
    let mut p = Vec::new();
    for &(auth, ar) in rules {
        p.push(8);
        p.extend_from_slice(&auth.to_be_bytes());
        p.extend_from_slice(&ar.to_be_bytes());
    }
    p
}

pub struct Se050<B: I2c> {
    pub t1: T1<B>,
}

pub type Session = [u8; 8];

impl<B: I2c> Se050<B> {
    pub fn new(bus: B) -> Self {
        Se050 { t1: T1::new(bus) }
    }

    /// Sends a command, inside `session` if given; returns the response body after checking SW 9000.
    pub fn cmd(&mut self, session: Option<&Session>, ins: u8, p1: u8, p2: u8, data: &[u8], le: bool) -> Result<Vec<u8>, SeError> {
        let inner = apdu(0x80, ins, p1, p2, data, le);
        let wire = match session {
            None => inner,
            Some(s) => {
                let mut d = Vec::new();
                tlv(TAG_SESSION_ID, s, &mut d);
                tlv(TAG_1, &inner, &mut d);
                apdu(0x80, INS_PROCESS, P1_DEFAULT, P2_DEFAULT, &d, true)
            }
        };
        let mut r = self.t1.transceive(&wire)?;
        if r.len() < 2 {
            return Err(SeError::BadResponse);
        }
        let sw = u16::from_be_bytes([r[r.len() - 2], r[r.len() - 1]]);
        r.truncate(r.len() - 2);
        if sw != SW_OK {
            return Err(SeError::Status(sw));
        }
        Ok(r)
    }

    fn tag1(body: &[u8]) -> Result<Vec<u8>, SeError> {
        tlvs(body).and_then(|t| t.into_iter().find(|x| x.0 == TAG_1).map(|x| x.1.to_vec())).ok_or(SeError::BadResponse)
    }

    /// Opens T=1 and selects the IoT applet; returns the applet version bytes.
    pub fn init(&mut self) -> Result<Vec<u8>, SeError> {
        self.t1.open()?;
        let mut r = self.t1.transceive(&apdu(0x00, 0xa4, 0x04, 0x00, &AID, true))?;
        if r.len() < 2 || r[r.len() - 2..] != [0x90, 0x00] {
            return Err(SeError::Status(r.last().copied().unwrap_or(0) as u16));
        }
        r.truncate(r.len() - 2);
        Ok(r)
    }

    pub fn get_random(&mut self, n: u16) -> Result<Vec<u8>, SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, &n.to_be_bytes(), &mut d);
        Self::tag1(&self.cmd(None, INS_MGMT, P1_DEFAULT, P2_RANDOM, &d, true)?)
    }

    pub fn exists(&mut self, id: u32) -> Result<bool, SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, &id.to_be_bytes(), &mut d);
        Ok(Self::tag1(&self.cmd(None, INS_MGMT, P1_DEFAULT, P2_EXIST, &d, true)?)? == [0x01])
    }

    pub fn delete(&mut self, id: u32) -> Result<(), SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, &id.to_be_bytes(), &mut d);
        self.cmd(None, INS_MGMT, P1_DEFAULT, P2_DELETE_OBJECT, &d, false).map(|_| ())
    }

    /// A UserID authentication object (the PIN) with its attempt limit.
    pub fn write_user_id(&mut self, id: u32, value: &[u8], max_attempts: u16, pol: &[u8]) -> Result<(), SeError> {
        let mut d = Vec::new();
        tlv(TAG_POLICY, pol, &mut d);
        tlv(TAG_MAX_ATTEMPTS, &max_attempts.to_be_bytes(), &mut d);
        tlv(TAG_1, &id.to_be_bytes(), &mut d);
        tlv(TAG_2, value, &mut d);
        self.cmd(None, INS_WRITE | INS_AUTH_OBJECT, P1_USERID, P2_DEFAULT, &d, false).map(|_| ())
    }

    /// Whether a Weierstrass curve is instantiated (ReadECCurveList: one SetIndicator per curve id 1..0x3F, where
    /// SET is 0x02 and NOT_SET 0x01).
    pub fn curve_ready(&mut self, curve: u8) -> Result<bool, SeError> {
        let list = Self::tag1(&self.cmd(None, INS_READ, P1_CURVE, P2_LIST, &[], true)?)?;
        Ok(list.get(curve as usize - 1) == Some(&0x02))
    }

    /// Creates secp256k1 and sets its five parameters, unless it is already instantiated (as NXP's middleware does).
    pub fn create_secp256k1(&mut self) -> Result<(), SeError> {
        if self.curve_ready(CURVE_SECP256K1)? {
            return Ok(());
        }
        let mut d = Vec::new();
        tlv(TAG_1, &[CURVE_SECP256K1], &mut d);
        self.cmd(None, INS_WRITE, P1_CURVE, P2_CREATE, &d, false)?;
        for (param, value) in SECP256K1_PARAMS {
            let mut d = Vec::new();
            tlv(TAG_1, &[CURVE_SECP256K1], &mut d);
            tlv(TAG_2, &[param], &mut d);
            tlv(TAG_3, &value(), &mut d);
            self.cmd(None, INS_WRITE, P1_CURVE, P2_PARAM, &d, false)?;
        }
        Ok(())
    }

    /// Imports a key pair with a policy. Ed25519: private key as in RFC 8032, public key byte-reversed (AN12413 7).
    pub fn write_ec_key_pair(&mut self, id: u32, curve: u8, private: &[u8], public: &[u8], pol: &[u8]) -> Result<(), SeError> {
        let mut d = Vec::new();
        tlv(TAG_POLICY, pol, &mut d);
        tlv(TAG_1, &id.to_be_bytes(), &mut d);
        tlv(TAG_2, &[curve], &mut d);
        tlv(TAG_3, private, &mut d);
        tlv(TAG_4, public, &mut d);
        self.cmd(None, INS_WRITE, P1_KEY_PAIR | P1_EC, P2_DEFAULT, &d, false).map(|_| ())
    }

    pub fn create_session(&mut self, auth_id: u32) -> Result<Session, SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, &auth_id.to_be_bytes(), &mut d);
        let s = Self::tag1(&self.cmd(None, INS_MGMT, P1_DEFAULT, P2_SESSION_CREATE, &d, true)?)?;
        s.try_into().map_err(|_| SeError::BadResponse)
    }

    /// Opens the session with the UserID value; `Status(0x6985)` means a wrong value.
    pub fn verify_user_id(&mut self, s: &Session, value: &[u8]) -> Result<(), SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, value, &mut d);
        self.cmd(Some(s), INS_MGMT, P1_DEFAULT, P2_SESSION_USERID, &d, false).map(|_| ())
    }

    pub fn close_session(&mut self, s: &Session) -> Result<(), SeError> {
        self.cmd(Some(s), INS_MGMT, P1_DEFAULT, P2_SESSION_CLOSE, &[], false).map(|_| ())
    }

    /// Ed25519 over `msg`; returns the RFC 8032 signature (the SE050's reversed r and s put back in order).
    pub fn eddsa_sign(&mut self, s: Option<&Session>, id: u32, msg: &[u8]) -> Result<[u8; 64], SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, &id.to_be_bytes(), &mut d);
        tlv(TAG_2, &[SIG_ED25519_PURE], &mut d);
        tlv(TAG_3, msg, &mut d);
        let raw = Self::tag1(&self.cmd(s, INS_CRYPTO, P1_SIGNATURE, P2_SIGN, &d, true)?)?;
        let mut sig: [u8; 64] = raw.try_into().map_err(|_| SeError::BadResponse)?;
        sig[..32].reverse();
        sig[32..].reverse();
        Ok(sig)
    }

    /// ECDSA over a 32-byte digest; returns (r, s) from the DER signature.
    pub fn ecdsa_sign(&mut self, s: Option<&Session>, id: u32, digest: &[u8; 32]) -> Result<([u8; 32], [u8; 32]), SeError> {
        let mut d = Vec::new();
        tlv(TAG_1, &id.to_be_bytes(), &mut d);
        tlv(TAG_2, &[SIG_ECDSA_SHA_256], &mut d);
        tlv(TAG_3, digest, &mut d);
        let der = Self::tag1(&self.cmd(s, INS_CRYPTO, P1_SIGNATURE, P2_SIGN, &d, true)?)?;
        der_rs(&der).ok_or(SeError::BadResponse)
    }
}

/// r and s from an ASN.1 DER ECDSA signature, as 32-byte big-endian integers.
pub fn der_rs(der: &[u8]) -> Option<([u8; 32], [u8; 32])> {
    if der.len() < 8 || der[0] != 0x30 || der[1] as usize != der.len() - 2 {
        return None;
    }
    let mut p = 2;
    let mut int = || -> Option<[u8; 32]> {
        if *der.get(p)? != 0x02 {
            return None;
        }
        let n = *der.get(p + 1)? as usize;
        let mut v = der.get(p + 2..p + 2 + n)?;
        p += 2 + n;
        while v.len() > 32 && v[0] == 0 {
            v = &v[1..];
        }
        if v.len() > 32 {
            return None;
        }
        let mut out = [0u8; 32];
        out[32 - v.len()..].copy_from_slice(v);
        Some(out)
    };
    let r = int()?;
    let s = int()?;
    (p == der.len()).then_some((r, s))
}

/// secp256k1 (SEC 2): a, b, G (uncompressed), n, p, as CreateECCurve/SetECCurveParam want them.
#[allow(clippy::type_complexity)]
pub const SECP256K1_PARAMS: [(u8, fn() -> Vec<u8>); 5] = [
    (0x01, || vec![0u8; 32]),
    (0x02, || {
        let mut b = vec![0u8; 32];
        b[31] = 7;
        b
    }),
    (0x04, || {
        let mut g = vec![0x04];
        g.extend_from_slice(&hex32("79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798"));
        g.extend_from_slice(&hex32("483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8"));
        g
    }),
    (0x08, || hex32("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141").to_vec()),
    (0x10, || hex32("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F").to_vec()),
];

fn hex32(s: &str) -> [u8; 32] {
    let mut o = [0u8; 32];
    for (i, c) in s.as_bytes().chunks(2).enumerate() {
        let h = |x: u8| if x.is_ascii_digit() { x - b'0' } else { x.to_ascii_lowercase() - b'a' + 10 };
        o[i] = h(c[0]) << 4 | h(c[1]);
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_match_nxp_middleware() {
        // CRCs computed with phNxpEseProto7816_ComputeCRC (T1oI2C_UM11225), wire order
        assert_eq!(frame(0xc0, &[]), [0x5a, 0xc0, 0x00, 0xff, 0xfc]); // S(RESYNCH)
        assert_eq!(frame(0xc7, &[]), [0x5a, 0xc7, 0x00, 0xf7, 0xb1]); // S(ATR)
        assert_eq!(frame(0x00, &[0x00, 0xa4, 0x04, 0x00, 0x10])[8..], [0x9f, 0x2c]);
        assert_eq!(frame(0xe3, &[0x01]), [0x5a, 0xe3, 0x01, 0x01, 0xf2, 0x1b]); // S(WTX response)
    }

    #[test]
    fn tlv_and_apdu() {
        let mut d = Vec::new();
        tlv(TAG_1, &[1, 2], &mut d);
        tlv(TAG_3, &[0u8; 200], &mut d);
        tlv(TAG_4, &[0u8; 300], &mut d);
        let t = tlvs(&d).unwrap();
        assert_eq!((t[0].0, t[1].1.len(), t[2].1.len()), (TAG_1, 200, 300));
        assert_eq!(&d[4..7], &[TAG_3, 0x81, 200]);
        let a = apdu(0x80, 3, 0x0c, 0x09, &[0u8; 300], true);
        assert_eq!(&a[4..7], &[0, 1, 44]);
        assert_eq!(&a[a.len() - 2..], &[0, 0]);
        assert_eq!(policy(&[(0x4b47_0001, POLICY_ALLOW_SIGN)]), [8, 0x4b, 0x47, 0, 1, 0x10, 0, 0, 0]);
    }

    #[test]
    fn der() {
        let mut der = vec![0x30, 0x45, 0x02, 0x21, 0x00];
        der.extend_from_slice(&[0x80; 32]);
        der.extend_from_slice(&[0x02, 0x20]);
        der.extend_from_slice(&[0x11; 32]);
        let (r, s) = der_rs(&der).unwrap();
        assert_eq!((r, s), ([0x80; 32], [0x11; 32]));
    }
}
