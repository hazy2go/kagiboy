//! The SPI link to the ESP32-C3, wallet profile (version 2): the RP2350 is the master.
//!
//! Spec: docs/phone-link.md, "SPI link". The wire is the WiFi cartridge's SPI link v1 (12-byte headers, magic,
//! CRC-16/CCITT-FALSE, a session byte, 4-byte multiples, state rather than messages); what flows is reversed: the ESP
//! offers the phone messages it got over Bluetooth, the master fetches one, answers it (`phone::PhoneServer`) and
//! sends the reply back. The ESP half is `firmware/esp32c3/components/wallet_link` (C); the two are tested against
//! each other on the host (`tests/spi_link.rs`).
//!
//! Master header (MOSI): 0 magic C5, 1 type (0 POLL, 1 REPLY), 2 flags (bit0: bytes 3 and 5 valid), 3 ack (seq of
//! the last message taken), 4 seq the reply answers, 5 the ESP boot id the ack belongs to, 6 reply length, 7 session,
//! 8-9 0, 10-11 CRC. REPLY: body + CRC.
//! ESP header (MISO): 0 magic 5C, 1 flags (bit0 phone connected, bit2 MSG, bit3 ACCEPTED), 2 ESP boot id, 3 seq of
//! the offered message, 4 0, 5 its length, 6-7 0, 8 seq of the last reply accepted, 9 version 2, 10-11 CRC. With MSG
//! the ESP's buffer carries the message after the header.

use alloc::vec::Vec;

pub const HDR: usize = 12;
pub const MAX_MSG: usize = 240;
pub const MAX_XFER: usize = HDR + 244;
pub const VERSION: u8 = 2;
const M_MAGIC: u8 = 0xc5;
const S_MAGIC: u8 = 0x5c;
const POLL: u8 = 0;
const REPLY: u8 = 1;
const F_CONNECTED: u8 = 1;
const F_MSG: u8 = 4;
const F_ACCEPTED: u8 = 8;
/// a reply not yet seen accepted is sent again after this long
pub const RESEND_MS: u64 = 10;
/// ...and given up after this long (the ESP is gone; the phone asks again)
pub const REPLY_TIMEOUT_MS: u64 = 2000;

pub fn crc16(p: &[u8]) -> u16 {
    let mut c: u16 = 0xffff;
    for &b in p {
        c ^= (b as u16) << 8;
        for _ in 0..8 {
            c = if c & 0x8000 != 0 { (c << 1) ^ 0x1021 } else { c << 1 };
        }
    }
    c
}

/// Bytes a body of n payload bytes takes on the wire (payload + CRC, padded to 4); 0 for n == 0.
pub fn body_len(n: usize) -> usize {
    if n == 0 {
        0
    } else {
        (n + 2 + 3) & !3
    }
}

fn crc_ok(p: &[u8], n: usize) -> bool {
    p.len() >= n + 2 && crc16(&p[..n]).to_be_bytes() == [p[n], p[n + 1]]
}

#[derive(Default, Debug, Clone, Copy)]
pub struct Stats {
    pub xfers: u32,
    pub bad_hdr: u32,
    pub bad_body: u32,
    pub resent: u32,
    pub replies_lost: u32,
}

pub struct LinkMaster {
    session: u8,
    /// the ESP's boot id from its last valid header; a new one means its message numbering started over
    boot: u8,
    /// seq of the last message taken (acknowledged in every header)
    taken: Option<u8>,
    /// a message is waiting to be fetched: (seq, length)
    fetch: Option<(u8, u8)>,
    /// the reply on its way: (seq it answers, bytes), when it was first and last sent
    reply: Option<(u8, Vec<u8>)>,
    reply_t0: u64,
    reply_sent: Option<u64>,
    /// a phone is connected to the ESP
    pub connected: bool,
    pub last_valid_ms: Option<u64>,
    pub stats: Stats,
}

impl LinkMaster {
    /// `session`: random and != 0, new on every RP2350 boot.
    pub fn new(session: u8) -> LinkMaster {
        LinkMaster {
            session: session.max(1),
            boot: 0,
            taken: None,
            fetch: None,
            reply: None,
            reply_t0: 0,
            reply_sent: None,
            connected: false,
            last_valid_ms: None,
            stats: Stats::default(),
        }
    }

    fn header(&self, tx: &mut [u8], kind: u8) {
        tx[0] = M_MAGIC;
        tx[1] = kind;
        if let Some(a) = self.taken {
            // with the boot id: an ack built before the master saw an ESP restart must not drop the new ESP's message
            tx[2] = 1;
            tx[3] = a;
            tx[5] = self.boot;
        }
        tx[7] = self.session;
    }

    /// Builds the next transaction into `tx` (MAX_XFER bytes); returns its length (a multiple of 4).
    pub fn next(&mut self, now_ms: u64, tx: &mut [u8; MAX_XFER]) -> usize {
        tx.fill(0);
        if let Some((_, t0)) = self.reply.as_ref().map(|r| (r.0, self.reply_t0)) {
            if now_ms.saturating_sub(t0) >= REPLY_TIMEOUT_MS {
                self.reply = None;
                self.stats.replies_lost += 1;
            }
        }
        let mut n = HDR;
        if let Some((_, len)) = self.fetch {
            self.header(tx, POLL);
            n += body_len(len as usize);
        } else if let Some((seq, data)) = self.reply.as_ref().filter(|_| self.reply_sent.is_none_or(|t| now_ms.saturating_sub(t) >= RESEND_MS)) {
            self.header(tx, REPLY);
            tx[4] = *seq;
            tx[6] = data.len() as u8;
            tx[HDR..HDR + data.len()].copy_from_slice(data);
            let c = crc16(data).to_be_bytes();
            tx[HDR + data.len()..HDR + data.len() + 2].copy_from_slice(&c);
            n += body_len(data.len());
            if self.reply_sent.is_some() {
                self.stats.resent += 1;
            }
            self.reply_sent = Some(now_ms);
        } else {
            self.header(tx, POLL);
        }
        let c = crc16(&tx[..10]).to_be_bytes();
        tx[10..12].copy_from_slice(&c);
        n
    }

    /// The transaction finished: `rx` holds what the ESP sent. Returns a phone message to answer (seq, bytes).
    pub fn done(&mut self, now_ms: u64, rx: &[u8]) -> Option<(u8, Vec<u8>)> {
        let was_fetch = self.fetch.take();
        self.stats.xfers += 1;
        if rx.len() < HDR || rx[0] != S_MAGIC || !crc_ok(rx, 10) {
            self.stats.bad_hdr += 1;
            return None;
        }
        self.last_valid_ms = Some(now_ms);
        let f = rx[1];
        self.connected = f & F_CONNECTED != 0;
        if rx[2] != self.boot {
            // the ESP (re)started: its numbering begins again, and a reply in flight answers a phone it no longer has
            self.boot = rx[2];
            self.taken = None;
            if self.reply.take().is_some() {
                self.stats.replies_lost += 1;
            }
        }
        if let Some((seq, _)) = &self.reply {
            if f & F_ACCEPTED != 0 && rx[8] == *seq {
                self.reply = None;
            } else {
                return None; // one message at a time: the reply goes first
            }
        }
        if f & F_MSG == 0 || Some(rx[3]) == self.taken {
            return None;
        }
        let (seq, len) = (rx[3], rx[5]);
        if len == 0 || len as usize > MAX_MSG {
            self.stats.bad_hdr += 1;
            return None;
        }
        if was_fetch == Some((seq, len)) && rx.len() >= HDR + body_len(len as usize) {
            if crc_ok(&rx[HDR..], len as usize) {
                self.taken = Some(seq);
                return Some((seq, rx[HDR..HDR + len as usize].to_vec()));
            }
            self.stats.bad_body += 1;
        }
        self.fetch = Some((seq, len));
        None
    }

    /// The answer to message `seq`; it goes out in the next transactions until the ESP shows it accepted.
    pub fn reply(&mut self, now_ms: u64, seq: u8, data: &[u8]) {
        let data = &data[..data.len().min(MAX_MSG)];
        if data.is_empty() {
            return;
        }
        self.reply = Some((seq, data.to_vec()));
        self.reply_t0 = now_ms;
        self.reply_sent = None;
    }

    /// Another transaction is due right away (a fetch or a first reply), after the 100 us gap.
    pub fn more(&self) -> bool {
        self.fetch.is_some() || (self.reply.is_some() && self.reply_sent.is_none())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc_and_lengths() {
        assert_eq!(crc16(b"123456789"), 0x29b1);
        assert_eq!((body_len(0), body_len(1), body_len(2), body_len(240)), (0, 4, 4, 244));
        assert_eq!(MAX_XFER % 4, 0);
    }
}
