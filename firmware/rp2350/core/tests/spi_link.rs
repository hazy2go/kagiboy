//! The SPI link between the RP2350 and the ESP32-C3, both halves as they ship: `link::LinkMaster` (Rust) against
//! `firmware/esp32c3/components/wallet_link` (C, built here with the host's C compiler and driven over a pipe).
//!
//! The recorded sessions' phone messages go phone -> ESP queue -> SPI -> `PhoneServer` -> SPI -> phone, while
//! transactions are corrupted in both directions, missed by the ESP, and the ESP restarts now and then; the phone
//! repeats a message (same tag) when no reply comes. Every reply must still equal the reference server's.

mod common;

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use common::{run_mode, Mem, PhoneSide, Replay};
use kagiboy_core::link::{LinkMaster, MAX_MSG, MAX_XFER};
use kagiboy_core::phone::PhoneServer;
use kagiboy_core::vault::Vault;
use kagiboy_core::Chip;

/// Built once per test run (the tests run in parallel and must not rebuild it under each other).
fn esp_host() -> PathBuf {
    static BUILT: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    BUILT.get_or_init(build_esp_host).clone()
}

fn build_esp_host() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../esp32c3");
    let out = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("wl_host");
    let ok = Command::new(std::env::var("CC").unwrap_or("cc".into()))
        .args(["-std=c11", "-O1", "-Wall", "-Wextra", "-Werror", "-o"])
        .arg(&out)
        .arg(root.join("test/wl_host.c"))
        .arg(root.join("components/wallet_link/wallet_link.c"))
        .arg("-I")
        .arg(root.join("components/wallet_link"))
        .status()
        .expect("a C compiler (cc) to build the ESP half");
    assert!(ok.success(), "building wl_host");
    out
}

struct Esp {
    _child: Child,
    i: ChildStdin,
    o: ChildStdout,
}

/// The ESP process goes with its test, even one that failed half way (no orphan holding a pipe open).
impl Drop for Esp {
    fn drop(&mut self) {
        let _ = self._child.kill();
        let _ = self._child.wait();
    }
}

impl Esp {
    fn start() -> Esp {
        let mut child = Command::new(esp_host()).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let (i, o) = (child.stdin.take().unwrap(), child.stdout.take().unwrap());
        Esp { _child: child, i, o }
    }
    fn byte(&mut self) -> u8 {
        let mut b = [0u8];
        self.o.read_exact(&mut b).unwrap();
        b[0]
    }
    fn boot(&mut self, id: u8) {
        self.i.write_all(&[b'I', id]).unwrap();
        self.i.flush().unwrap();
    }
    fn connected(&mut self, on: bool) {
        self.i.write_all(&[b'C', on as u8]).unwrap();
        self.i.flush().unwrap();
    }
    fn push(&mut self, m: &[u8]) -> bool {
        self.i.write_all(&[b'P', m.len() as u8]).unwrap();
        self.i.write_all(m).unwrap();
        self.i.flush().unwrap();
        assert_eq!(self.byte(), b'k');
        self.byte() == 1
    }
    fn xfer(&mut self, mosi: &[u8]) -> Vec<u8> {
        let n = mosi.len() as u16;
        self.i.write_all(&[b'X', n as u8, (n >> 8) as u8]).unwrap();
        self.i.write_all(mosi).unwrap();
        self.i.flush().unwrap();
        assert_eq!(self.byte(), b'x');
        let mut miso = vec![0u8; mosi.len()];
        self.o.read_exact(&mut miso).unwrap();
        miso
    }
    fn replies(&mut self) -> Vec<Vec<u8>> {
        self.i.write_all(b"R").unwrap();
        self.i.flush().unwrap();
        let n = self.byte();
        (0..n)
            .map(|_| {
                let len = self.byte() as usize;
                let mut r = vec![0u8; len];
                self.o.read_exact(&mut r).unwrap();
                r
            })
            .collect()
    }
}

/// Deterministic faults.
struct Faults {
    x: u64,
    /// per mille: MOSI damaged, MISO damaged, transaction missed by the ESP, ESP restart
    mosi: u64,
    miso: u64,
    missed: u64,
    reboot: u64,
}
impl Faults {
    fn roll(&mut self, per_mille: u64) -> bool {
        self.x ^= self.x << 13;
        self.x ^= self.x >> 7;
        self.x ^= self.x << 17;
        self.x % 1000 < per_mille
    }
    fn pick(&mut self, n: usize) -> usize {
        self.roll(0);
        (self.x as usize) % n.max(1)
    }
}

#[derive(Default, Debug)]
struct Counts {
    messages: u32,
    xfers: u32,
    damaged: u32,
    missed: u32,
    reboots: u32,
    phone_retries: u32,
    /// a reply that reached the phone twice without the phone asking twice
    duplicates: u32,
}

struct SpiPhone {
    esp: Esp,
    master: LinkMaster,
    server: PhoneServer,
    now: u64,
    f: Faults,
    boot: u8,
    n: Counts,
    /// every message the phone pushed: what reaches the cartridge must be one of them, byte for byte
    sent: Vec<Vec<u8>>,
    last_reply: Option<Vec<u8>>,
    /// transactions left in which the master hears nothing (MISO stuck low) while the ESP still hears the master
    deaf: u32,
}

impl SpiPhone {
    fn new(f: Faults) -> SpiPhone {
        let mut esp = Esp::start();
        esp.boot(1);
        esp.connected(true);
        SpiPhone { esp, master: LinkMaster::new(0x5a), server: PhoneServer::new(), now: 0, f, boot: 1, n: Counts::default(), sent: vec![], last_reply: None, deaf: 0 }
    }

    /// One master transaction, with faults; a phone message that comes out of it is answered by `answer`.
    fn step(&mut self, answer: &mut dyn FnMut(&[u8]) -> Vec<u8>) {
        self.now += 1;
        self.n.xfers += 1;
        let mut tx = [0u8; MAX_XFER];
        let len = self.master.next(self.now, &mut tx);
        let mut mosi = tx[..len].to_vec();
        let miso = if self.f.roll(self.f.missed) {
            self.n.missed += 1;
            vec![0u8; len] // CS glitch: the ESP saw nothing, MISO floats low
        } else {
            if self.f.roll(self.f.mosi) {
                let k = self.f.pick(len);
                mosi[k] ^= 0x10;
                self.n.damaged += 1;
            }
            let mut m = self.esp.xfer(&mosi);
            if self.deaf > 0 {
                self.deaf -= 1;
                m.fill(0);
            }
            if self.f.roll(self.f.miso) {
                let k = self.f.pick(len);
                m[k] ^= 0x01;
                self.n.damaged += 1;
            }
            m
        };
        if let Some((seq, msg)) = self.master.done(self.now, &miso) {
            assert!(self.sent.contains(&msg), "the cartridge got a message the phone never sent: {msg:02x?}");
            let rep = answer(&msg);
            self.master.reply(self.now, seq, &rep);
        }
        if self.f.roll(self.f.reboot) {
            self.boot = self.boot.wrapping_add(1).max(1);
            self.esp.boot(self.boot);
            self.esp.connected(true);
            self.n.reboots += 1;
        }
    }

    /// The phone's side: send, wait for the reply with this message's tag, send again (same bytes) if none comes.
    fn send(&mut self, req: &[u8], answer: &mut dyn FnMut(&[u8]) -> Vec<u8>) -> Vec<u8> {
        self.n.messages += 1;
        for attempt in 0..20 {
            if attempt > 0 {
                self.n.phone_retries += 1;
                self.last_reply = None; // asked again: the same reply again is expected
            }
            self.sent.push(req.to_vec());
            if !self.esp.push(req) {
                // the queue is full of earlier retries: let the link drain it
                for _ in 0..50 {
                    self.step(answer);
                }
                continue;
            }
            for _ in 0..300 {
                self.step(answer);
                let mut mine = None;
                for r in self.esp.replies() {
                    if self.last_reply.as_ref() == Some(&r) {
                        self.n.duplicates += 1;
                    }
                    self.last_reply = Some(r.clone());
                    if mine.is_none() && r.len() >= 2 && r[0] == req[0] | 0x80 && r[1] == req[1] {
                        mine = Some(r);
                    }
                }
                if let Some(r) = mine {
                    // a duplicate may still be on its way: run the link until it is quiet before the next message
                    for _ in 0..30 {
                        self.step(answer);
                        for d in self.esp.replies() {
                            if Some(&d) == self.last_reply.as_ref() {
                                self.n.duplicates += 1;
                            }
                        }
                    }
                    return r;
                }
            }
        }
        panic!("no reply to {req:02x?} after 20 tries ({:?}, {:?})", self.n, self.master.stats);
    }
}

impl<V: Vault> PhoneSide<V> for SpiPhone {
    fn exchange(&mut self, chip: &mut Chip<Mem, V>, req: &[u8], p: &mut Replay) -> Vec<u8> {
        let mut server = std::mem::take(&mut self.server);
        let rep = self.send(req, &mut |m| server.handle(chip, m, p));
        self.server = server;
        rep
    }
}

#[test]
fn sessions_identical_over_bluetooth_and_spi() {
    for name in ["session-create", "session-restore", "session-power"] {
        let mut link = SpiPhone::new(Faults { x: 0x9e37_79b9_7f4a_7c15, mosi: 0, miso: 0, missed: 0, reboot: 0 });
        run_mode(name, false, Some(&mut link), Chip::new(Mem(None)), |_| {}, " [SPI link, clean]");
        assert_eq!((link.n.phone_retries, link.master.stats.bad_hdr, link.master.stats.resent), (0, 0, 0), "{name}: a clean link needs no repeats");
        println!("  {:?}", link.n);
    }
}

#[test]
fn sessions_identical_over_a_bad_spi_link() {
    for (k, name) in ["session-create", "session-restore", "session-power"].into_iter().enumerate() {
        let f = Faults { x: 0x2545_f491_4f6c_dd1d + k as u64, mosi: 40, miso: 40, missed: 20, reboot: 2 };
        let mut link = SpiPhone::new(f);
        run_mode(name, false, Some(&mut link), Chip::new(Mem(None)), |_| {}, " [SPI link with faults]");
        println!("  {:?} {:?}", link.n, link.master.stats);
        assert!(link.n.damaged > 0 && link.n.missed > 0, "{name}: the faults happened");
        assert_eq!(link.n.duplicates, 0, "{name}: a resent reply reached the phone twice");
    }
}

#[test]
fn largest_messages_and_restarts() {
    let mut link = SpiPhone::new(Faults { x: 7, mosi: 0, miso: 0, missed: 0, reboot: 0 });
    let echo = |m: &[u8]| -> Vec<u8> {
        let mut r = m.to_vec();
        r[0] |= 0x80;
        r.reverse();
        r[..2].copy_from_slice(&[m[0] | 0x80, m[1]]);
        r
    };
    // 240 bytes each way
    let big: Vec<u8> = (0..MAX_MSG).map(|i| i as u8).collect();
    let mut seen = 0;
    let r = link.send(&big, &mut |m| {
        seen += 1;
        echo(m)
    });
    assert_eq!((r.len(), seen), (MAX_MSG, 1));
    assert_eq!(r, echo(&big));
    // several messages queued at once go through in order, each answered once
    for t in 1..=4u8 {
        link.sent.push(vec![0x01, t, t, t]);
        assert!(link.esp.push(&[0x01, t, t, t]));
    }
    assert!(!link.esp.push(&[0x01, 9]), "the ESP's queue holds four");
    let mut order = vec![];
    for _ in 0..200 {
        link.step(&mut |m| {
            order.push(m[1]);
            echo(m)
        });
    }
    assert_eq!(order, [1, 2, 3, 4]);
    assert_eq!(link.esp.replies().iter().map(|r| r[1]).collect::<Vec<_>>(), [1, 2, 3, 4]);
    // the RP2350 restarts (new session): messages still waiting at the ESP are taken by the new master
    link.sent.push(vec![0x01, 20, 1]);
    link.esp.push(&[0x01, 20, 1]);
    link.master = LinkMaster::new(0x77);
    let r = link.send(&[0x01, 21, 2], &mut |m| echo(m));
    assert_eq!(r[1], 21);
    // the ESP restarts while a reply is on its way: the master drops that reply, the phone asks again
    link.sent.push(vec![0x01, 30, 3]);
    link.esp.push(&[0x01, 30, 3]);
    let mut n30 = 0;
    for _ in 0..3 {
        link.step(&mut |m| {
            n30 += 1;
            echo(m)
        });
    }
    link.esp.boot(9);
    let r = link.send(&[0x01, 31, 4], &mut |m| echo(m));
    assert_eq!((r[1], n30), (31, 1));
    assert!(link.master.stats.replies_lost >= 1);
}

#[test]
fn an_esp_restart_starts_its_numbering_over() {
    // the master took message 1, then the ESP restarts and numbers its next message 1 again: that one must be taken
    let mut link = SpiPhone::new(Faults { x: 11, mosi: 0, miso: 0, missed: 0, reboot: 0 });
    let echo = |m: &[u8]| vec![m[0] | 0x80, m[1], 0];
    assert_eq!(link.send(&[0x01, 1], &mut |m| echo(m))[1], 1);
    link.esp.boot(2);
    link.esp.connected(true);
    assert_eq!(link.send(&[0x01, 2], &mut |m| echo(m))[1], 2);
    assert_eq!(link.n.phone_retries, 0, "taken at once, not after the phone gave up waiting");
}

#[test]
fn damaged_bodies_never_reach_the_cartridge() {
    // every fetched message body is hit (MISO damage after the header): the CRC must stop all of them
    let mut link = SpiPhone::new(Faults { x: 5, mosi: 0, miso: 0, missed: 0, reboot: 0 });
    let msg: Vec<u8> = (0..200u8).collect();
    assert!(link.esp.push(&msg));
    let mut hits = 0;
    for _ in 0..50 {
        link.now += 1;
        let mut tx = [0u8; MAX_XFER];
        let len = link.master.next(link.now, &mut tx);
        let mut miso = link.esp.xfer(&tx[..len]);
        if len > 12 + 4 {
            miso[12 + 7] ^= 0x40; // a payload byte
            hits += 1;
        }
        assert!(link.master.done(link.now, &miso).is_none(), "a damaged body was handed to the cartridge");
    }
    assert!(hits > 5 && link.master.stats.bad_body == hits);
}

#[test]
fn a_reply_resent_after_an_outage_reaches_the_phone_once() {
    // the ESP took the reply, but the master hears nothing for 30 ms and sends it again: the phone must get it once
    let mut link = SpiPhone::new(Faults { x: 3, mosi: 0, miso: 0, missed: 0, reboot: 0 });
    let echo = |m: &[u8]| vec![m[0] | 0x80, m[1], 7, 7];
    link.sent.push(vec![0x01, 5, 1]);
    assert!(link.esp.push(&[0x01, 5, 1]));
    let mut got = vec![];
    for k in 0..80 {
        if k == 2 {
            link.deaf = 30; // from the transaction after the first REPLY
        }
        link.step(&mut |m| echo(m));
        got.extend(link.esp.replies());
    }
    assert!(link.master.stats.resent >= 2, "the master did send it again ({:?})", link.master.stats);
    assert_eq!(got, vec![vec![0x81, 5, 7, 7]], "once, not once per resend");
}
