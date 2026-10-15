//! A behavioural model of the NXP SE050 for host tests: T=1 over I2C and the IoT-applet subset kagiboy uses, with
//! real cryptography, the policy rules of AN12413 3.7 and the UserID attempt limit. It also misbehaves on purpose
//! (busy NACKs, WTX requests, chained responses, a damaged frame) so the driver's recovery paths run.
//!
//! Written from AN12413 Rev 2.12 and NXP's Plug & Trust middleware (frame layer), not from the driver.
#![allow(dead_code)]

use std::collections::HashMap;

use ed25519_dalek::Signer;
use k256::ecdsa::SigningKey;
use kagiboy_core::se050::I2c;

#[derive(Clone)]
pub enum Obj {
    UserId { value: Vec<u8>, max: u16, failures: u16, policy: Vec<(u32, u32)> },
    Key { curve: u8, private: Vec<u8>, policy: Vec<(u32, u32)> },
}

/// Behaviour switches for the transport tests.
#[derive(Default, Clone)]
pub struct Quirks {
    /// reads NACKed before each response frame is available
    pub busy_reads: u32,
    /// send a WTX request before every response
    pub wtx: bool,
    /// split responses into blocks of this many bytes (default 254)
    pub resp_ifs: Option<usize>,
    /// damage the next response frame once
    pub corrupt_next: bool,
}

pub struct Model {
    pub quirks: Quirks,
    // frame layer
    out: Vec<u8>,
    busy_left: u32,
    exp_ns: u8,
    my_ns: u8,
    rx: Vec<u8>,
    pending_resp: Vec<Vec<u8>>, // response blocks not yet sent (chaining)
    last_sent: Vec<u8>,
    // applet
    selected: bool,
    pub objects: HashMap<u32, Obj>,
    curve_k1: u8, // bitmask of the five SetECCurveParam values seen correct (0x1F = ready)
    curve_k1_created: bool,
    sessions: HashMap<[u8; 8], (u32, bool)>,
    next_session: u64,
    pub log: Vec<String>,
    pub flip_high_s: bool,
    pub frames_in: usize,
}

fn crc(d: &[u8]) -> [u8; 2] {
    // reference: NXP phNxpEseProto7816_ComputeCRC, T1oI2C_UM11225 (wire order: low byte first)
    let mut c: u16 = 0xffff;
    for &b in d {
        c ^= b as u16;
        for _ in 0..8 {
            c = if c & 1 == 1 { (c >> 1) ^ 0x8408 } else { c >> 1 };
        }
    }
    c ^= 0xffff;
    [c as u8, (c >> 8) as u8]
}

fn frame(pcb: u8, inf: &[u8]) -> Vec<u8> {
    let mut f = vec![0xa5, pcb, inf.len() as u8];
    f.extend_from_slice(inf);
    let c = crc(&f);
    f.extend_from_slice(&c);
    f
}

const SECP_A: [u8; 32] = [0; 32];
fn secp_param(id: u8) -> Vec<u8> {
    let h = |s: &str| hex::decode(s).unwrap();
    match id {
        0x01 => SECP_A.to_vec(),
        0x02 => {
            let mut b = vec![0u8; 32];
            b[31] = 7;
            b
        }
        0x04 => h("0479BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8"),
        0x08 => h("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"),
        0x10 => h("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F"),
        _ => vec![],
    }
}

fn tlvs(mut b: &[u8]) -> Option<Vec<(u8, Vec<u8>)>> {
    let mut out = Vec::new();
    while !b.is_empty() {
        let tag = b[0];
        let (len, hdr) = match *b.get(1)? {
            n if n < 0x80 => (n as usize, 2),
            0x81 => (*b.get(2)? as usize, 3),
            0x82 => (((*b.get(2)? as usize) << 8) | *b.get(3)? as usize, 4),
            _ => return None,
        };
        out.push((tag, b.get(hdr..hdr + len)?.to_vec()));
        b = &b[hdr + len..];
    }
    Some(out)
}

fn tlv(tag: u8, v: &[u8]) -> Vec<u8> {
    let mut o = vec![tag];
    if v.len() < 0x80 {
        o.push(v.len() as u8);
    } else if v.len() < 0x100 {
        o.extend_from_slice(&[0x81, v.len() as u8]);
    } else {
        o.extend_from_slice(&[0x82, (v.len() >> 8) as u8, v.len() as u8]);
    }
    o.extend_from_slice(v);
    o
}

fn get(t: &[(u8, Vec<u8>)], tag: u8) -> Option<Vec<u8>> {
    t.iter().find(|x| x.0 == tag).map(|x| x.1.clone())
}

fn parse_policy(p: &[u8]) -> Option<Vec<(u32, u32)>> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < p.len() {
        let n = p[i] as usize;
        if n < 8 || i + 1 + n > p.len() {
            return None;
        }
        let auth = u32::from_be_bytes(p[i + 1..i + 5].try_into().ok()?);
        let ar = u32::from_be_bytes(p[i + 5..i + 9].try_into().ok()?);
        out.push((auth, ar));
        i += 1 + n;
    }
    Some(out)
}

/// AN12413 3.7: a policy for this user wins; otherwise the "all other users" (0) policy; no policy = default (all).
fn allowed(policy: &[(u32, u32)], user: u32, rule: u32) -> bool {
    if policy.is_empty() {
        return true;
    }
    let ar = policy.iter().find(|p| p.0 == user && user != 0).or_else(|| policy.iter().find(|p| p.0 == 0)).map(|p| p.1);
    match ar {
        Some(ar) => ar & 0x2000_0000 == 0 && ar & rule != 0,
        None => false,
    }
}

const SIGN: u32 = 0x1000_0000;
const WRITE: u32 = 0x0010_0000;
const DELETE: u32 = 0x0004_0000;

fn sw(body: Vec<u8>, sw: u16) -> Vec<u8> {
    let mut r = body;
    r.extend_from_slice(&sw.to_be_bytes());
    r
}

impl Model {
    pub fn new() -> Model {
        Model {
            quirks: Quirks::default(),
            out: Vec::new(),
            busy_left: 0,
            exp_ns: 0,
            my_ns: 0,
            rx: Vec::new(),
            pending_resp: Vec::new(),
            last_sent: Vec::new(),
            selected: false,
            objects: HashMap::new(),
            curve_k1: 0,
            curve_k1_created: false,
            sessions: HashMap::new(),
            next_session: 0x1122_3344_5566_7700,
            log: Vec::new(),
            flip_high_s: true,
            frames_in: 0,
        }
    }

    /// Power cycle: transient state (sessions, selection, the frame layer) goes; objects stay.
    pub fn power_cycle(&mut self) {
        self.sessions.clear();
        self.selected = false;
        self.out.clear();
        self.rx.clear();
        self.pending_resp.clear();
        self.exp_ns = 0;
        self.my_ns = 0;
    }

    fn emit(&mut self, f: Vec<u8>) {
        self.last_sent = f.clone();
        let mut f = f;
        if self.quirks.corrupt_next {
            self.quirks.corrupt_next = false;
            let n = f.len();
            f[n - 1] ^= 0x55;
        }
        self.out = f;
        self.busy_left = self.quirks.busy_reads;
    }

    fn send_response(&mut self, resp: Vec<u8>) {
        let ifs = self.quirks.resp_ifs.unwrap_or(254);
        let mut blocks: Vec<Vec<u8>> = resp.chunks(ifs).map(|c| c.to_vec()).collect();
        if blocks.is_empty() {
            blocks.push(Vec::new());
        }
        blocks.reverse();
        self.pending_resp = blocks;
        if self.quirks.wtx {
            self.emit(frame(0xc3, &[0x01]));
            return;
        }
        self.next_block();
    }

    fn next_block(&mut self) {
        let Some(b) = self.pending_resp.pop() else { return };
        let more = if self.pending_resp.is_empty() { 0 } else { 0x20 };
        let f = frame(self.my_ns << 6 | more, &b);
        self.my_ns ^= 1;
        self.emit(f);
    }

    fn on_frame(&mut self, f: &[u8]) {
        self.frames_in += 1;
        assert!(f.len() >= 5 && f[0] == 0x5a, "host frame must start with NAD 0x5A");
        assert_eq!(f[2] as usize + 5, f.len(), "LEN must match");
        assert_eq!(crc(&f[..f.len() - 2]), [f[f.len() - 2], f[f.len() - 1]], "host CRC");
        let (pcb, inf) = (f[1], &f[3..f.len() - 2]);
        match pcb {
            0xc0 => {
                self.exp_ns = 0;
                self.my_ns = 0;
                self.rx.clear();
                self.emit(frame(0xe0, &[]));
            }
            0xc7 => self.emit(frame(0xe7, &[0x00, 0xa0, 0x00, 0x00, 0x03, 0x96, 0x04, 0x03, 0xe8, 0x00, 0xfe])),
            0xc5 => self.emit(frame(0xe5, &[])),
            0xe3 => {
                assert_eq!(inf, &[0x01], "WTX response INF");
                self.next_block();
            }
            p if p & 0x80 == 0 => {
                let ns = (p >> 6) & 1;
                if ns != self.exp_ns {
                    // a repeated block (our acknowledgement was lost): acknowledge again, don't append
                    self.emit(frame(0x80 | self.exp_ns << 4, &[]));
                    return;
                }
                self.exp_ns ^= 1;
                self.rx.extend_from_slice(inf);
                if p & 0x20 != 0 {
                    self.emit(frame(0x80 | self.exp_ns << 4, &[]));
                    return;
                }
                let apdu = std::mem::take(&mut self.rx);
                let resp = self.process(&apdu);
                self.send_response(resp);
            }
            p if p & 0xc0 == 0x80 => {
                if p & 0x0f != 0 {
                    // retransmission request
                    let last = self.last_sent.clone();
                    self.emit(last);
                } else {
                    self.next_block();
                }
            }
            other => panic!("unexpected PCB {other:02x}"),
        }
    }

    fn process(&mut self, a: &[u8]) -> Vec<u8> {
        self.process_as(a, 0)
    }

    /// One command APDU from `user` (0 = session-less, "all other users").
    fn process_as(&mut self, a: &[u8], user: u32) -> Vec<u8> {
        let (cla, ins, p1, p2) = (a[0], a[1], a[2], a[3]);
        // Lc / data (short or extended)
        let data: Vec<u8> = if a.len() > 5 && a[4] == 0 && a.len() >= 7 && (a.len() == 7 + ((a[5] as usize) << 8 | a[6] as usize) || a.len() == 9 + ((a[5] as usize) << 8 | a[6] as usize)) {
            let n = (a[5] as usize) << 8 | a[6] as usize;
            a[7..7 + n].to_vec()
        } else if a.len() > 5 {
            let n = a[4] as usize;
            a[5..5 + n].to_vec()
        } else {
            vec![]
        };
        if cla == 0x00 && ins == 0xa4 {
            let aid = hex::decode("A0000003965453000000010300000000").unwrap();
            if data == aid {
                self.selected = true;
                return sw(vec![0x07, 0x02, 0x00, 0xff, 0xff, 0xff, 0xff], 0x9000);
            }
            return sw(vec![], 0x6a82);
        }
        assert!(self.selected, "applet not selected");
        assert_eq!(cla, 0x80, "CLA");
        let Some(t) = tlvs(&data) else { return sw(vec![], 0x6a80) };
        self.log.push(format!("{ins:02x} {p1:02x} {p2:02x} user {user:08x}"));
        match (ins & 0x1f, p1, p2) {
            // ProcessSessionCmd
            (0x05, 0x00, 0x00) => {
                let (Some(sid), Some(inner)) = (get(&t, 0x10), get(&t, 0x41)) else { return sw(vec![], 0x6a80) };
                let sid: [u8; 8] = sid.try_into().unwrap();
                let Some(&(auth, verified)) = self.sessions.get(&sid) else { return sw(vec![], 0x6985) };
                let (iins, ip2) = (inner[1], inner[3]);
                if !verified {
                    // only VerifySessionUserID is accepted before the session is set up
                    if (iins, ip2) != (0x04, 0x2c) {
                        return sw(vec![], 0x6985);
                    }
                    let id = tlvs(&inner[5..5 + inner[4] as usize]).and_then(|x| get(&x, 0x41)).unwrap_or_default();
                    let Some(Obj::UserId { value, max, failures, .. }) = self.objects.get_mut(&auth) else { return sw(vec![], 0x6985) };
                    if *max > 0 && *failures >= *max {
                        return sw(vec![], 0x6985); // blocked
                    }
                    if id == *value {
                        *failures = 0;
                        self.sessions.insert(sid, (auth, true));
                        return sw(vec![], 0x9000);
                    }
                    *failures += 1;
                    return sw(vec![], 0x6985);
                }
                if (iins, ip2) == (0x04, 0x1c) {
                    self.sessions.remove(&sid);
                    return sw(vec![], 0x9000);
                }
                self.process_as(&inner, auth)
            }
            // CreateSession
            (0x04, 0x00, 0x1b) => {
                let id = u32::from_be_bytes(get(&t, 0x41).unwrap_or_default().try_into().unwrap_or([0; 4]));
                if !matches!(self.objects.get(&id), Some(Obj::UserId { .. })) {
                    return sw(vec![], 0x6985);
                }
                self.next_session += 1;
                let sid = self.next_session.to_be_bytes();
                self.sessions.insert(sid, (id, false));
                sw(tlv(0x41, &sid), 0x9000)
            }
            // GetRandom
            (0x04, 0x00, 0x49) => {
                let n = u16::from_be_bytes(get(&t, 0x41).unwrap().try_into().unwrap()) as usize;
                sw(tlv(0x41, &vec![0x5a; n]), 0x9000)
            }
            // CheckObjectExists
            (0x04, 0x00, 0x27) => {
                let id = u32::from_be_bytes(get(&t, 0x41).unwrap().try_into().unwrap());
                sw(tlv(0x41, &[if self.objects.contains_key(&id) { 0x01 } else { 0x02 }]), 0x9000)
            }
            // DeleteSecureObject
            (0x04, 0x00, 0x28) => {
                let id = u32::from_be_bytes(get(&t, 0x41).unwrap().try_into().unwrap());
                let Some(o) = self.objects.get(&id) else { return sw(vec![], 0x6985) };
                let pol = match o {
                    Obj::UserId { policy, .. } | Obj::Key { policy, .. } => policy,
                };
                if !allowed(pol, user, DELETE) {
                    return sw(vec![], 0x6986);
                }
                self.objects.remove(&id);
                self.sessions.retain(|_, s| s.0 != id);
                sw(vec![], 0x9000)
            }
            // ReadECCurveList
            (0x02, 0x0b, 0x25) => {
                let mut list = vec![0x01u8; 0x11];
                if self.curve_k1 == 0x1f {
                    list[0x10 - 1] = 0x02;
                }
                sw(tlv(0x41, &list), 0x9000)
            }
            // CreateECCurve
            (0x01, 0x0b, 0x04) => {
                if get(&t, 0x41) != Some(vec![0x10]) {
                    return sw(vec![], 0x6a80);
                }
                if self.curve_k1_created {
                    return sw(vec![], 0x6a89);
                }
                self.curve_k1_created = true;
                sw(vec![], 0x9000)
            }
            // SetECCurveParam
            (0x01, 0x0b, 0x40) => {
                if !self.curve_k1_created || get(&t, 0x41) != Some(vec![0x10]) {
                    return sw(vec![], 0x6985);
                }
                let param = get(&t, 0x42).unwrap()[0];
                if get(&t, 0x43).unwrap() != secp_param(param) {
                    return sw(vec![], 0x6a80);
                }
                self.curve_k1 |= match param {
                    0x01 => 1,
                    0x02 => 2,
                    0x04 => 4,
                    0x08 => 8,
                    0x10 => 16,
                    _ => 0,
                };
                sw(vec![], 0x9000)
            }
            // WriteUserID (INS_WRITE | INS_AUTH_OBJECT)
            (0x01, 0x07, 0x00) => {
                assert!(ins & 0x40 != 0, "a UserID must be created as an authentication object");
                let id = u32::from_be_bytes(get(&t, 0x41).unwrap().try_into().unwrap());
                let value = get(&t, 0x42).unwrap();
                if !(4..=16).contains(&value.len()) {
                    return sw(vec![], 0x6a80);
                }
                if let Some(Obj::UserId { policy, .. }) = self.objects.get(&id) {
                    if !allowed(policy, user, WRITE) {
                        return sw(vec![], 0x6986);
                    }
                }
                let max = get(&t, 0x12).map(|m| u16::from_be_bytes(m.try_into().unwrap())).unwrap_or(0);
                if max >= 256 {
                    return sw(vec![], 0x6a80);
                }
                let policy = get(&t, 0x11).map(|p| parse_policy(&p).unwrap()).unwrap_or_default();
                self.objects.insert(id, Obj::UserId { value, max, failures: 0, policy });
                sw(vec![], 0x9000)
            }
            // WriteECKey, key pair
            (0x01, 0x61, 0x00) => {
                let id = u32::from_be_bytes(get(&t, 0x41).unwrap().try_into().unwrap());
                if self.objects.contains_key(&id) {
                    return sw(vec![], 0x6986); // our keys don't allow WRITE: never overwritten in place
                }
                let curve = get(&t, 0x42).unwrap()[0];
                let (private, public) = (get(&t, 0x43).unwrap(), get(&t, 0x44).unwrap());
                match curve {
                    0x40 => {
                        let mut want = ed25519_dalek::SigningKey::from_bytes(&private.clone().try_into().unwrap()).verifying_key().to_bytes();
                        want.reverse(); // the SE050 takes Edwards public keys big-endian
                        if public != want {
                            return sw(vec![], 0x6a80);
                        }
                    }
                    0x10 => {
                        if self.curve_k1 != 0x1f {
                            return sw(vec![], 0x6985); // curve not instantiated
                        }
                        let want = SigningKey::from_slice(&private).unwrap().verifying_key().to_encoded_point(false);
                        if public != want.as_bytes() {
                            return sw(vec![], 0x6a80);
                        }
                    }
                    _ => return sw(vec![], 0x6a80),
                }
                let policy = get(&t, 0x11).map(|p| parse_policy(&p).unwrap()).unwrap_or_default();
                self.objects.insert(id, Obj::Key { curve, private, policy });
                sw(vec![], 0x9000)
            }
            // ECDSASign / EdDSASign
            (0x03, 0x0c, 0x09) => {
                let id = u32::from_be_bytes(get(&t, 0x41).unwrap().try_into().unwrap());
                let algo = get(&t, 0x42).unwrap()[0];
                let input = get(&t, 0x43).unwrap();
                let Some(Obj::Key { curve, private, policy }) = self.objects.get(&id) else { return sw(vec![], 0x6985) };
                if !allowed(policy, user, SIGN) {
                    return sw(vec![], 0x6986);
                }
                match (curve, algo) {
                    (0x40, 0xa3) => {
                        let sk = ed25519_dalek::SigningKey::from_bytes(&private.clone().try_into().unwrap());
                        let mut sig = sk.sign(&input).to_bytes();
                        sig[..32].reverse();
                        sig[32..].reverse();
                        sw(tlv(0x41, &sig), 0x9000)
                    }
                    (0x10, 0x21) => {
                        if input.len() != 32 {
                            return sw(vec![], 0x6a80);
                        }
                        let sk = SigningKey::from_slice(private).unwrap();
                        let (sig, _) = sk.sign_prehash_recoverable(&input).unwrap();
                        // a real SE050 uses a random nonce and doesn't normalise S: hand back the high-S twin
                        // whenever the digest's first bit is set, so the host's normalisation is exercised
                        let sig = if self.flip_high_s && input[0] & 0x80 != 0 {
                            let n = k256::Scalar::ZERO - sig.s().as_ref();
                            k256::ecdsa::Signature::from_scalars(sig.r().to_bytes(), n.to_bytes()).unwrap()
                        } else {
                            sig
                        };
                        sw(tlv(0x41, sig.to_der().as_bytes()), 0x9000)
                    }
                    _ => sw(vec![], 0x6a80),
                }
            }
            _ => sw(vec![], 0x6d00),
        }
    }

    /// Whether a key object exists.
    pub fn has(&self, id: u32) -> bool {
        self.objects.contains_key(&id)
    }
}

impl I2c for Model {
    fn write(&mut self, addr: u8, bytes: &[u8]) -> Result<(), ()> {
        assert_eq!(addr, 0x48);
        self.on_frame(bytes);
        Ok(())
    }
    fn read(&mut self, addr: u8, buf: &mut [u8]) -> Result<(), ()> {
        assert_eq!(addr, 0x48);
        if self.out.is_empty() {
            return Err(()); // nothing to say: NACK
        }
        if self.busy_left > 0 {
            self.busy_left -= 1;
            return Err(());
        }
        let n = buf.len().min(self.out.len());
        buf[..n].copy_from_slice(&self.out[..n]);
        self.out.drain(..n);
        Ok(())
    }
    fn delay_ms(&mut self, _ms: u32) {}
}
