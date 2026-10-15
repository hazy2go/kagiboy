//! The recorded-session replay shared by the vector tests (software vault and SE050 vault).
#![allow(dead_code)]


use std::collections::VecDeque;

use kagiboy_core::bus::{encode_write, Mailbox, ROM_WINDOW};
use kagiboy_core::chip::mb;
use kagiboy_core::phone::PhoneServer;
use kagiboy_core::vault::Vault;
use kagiboy_core::{Chain, Chip, Persisted, Platform, SignRequest, SignResult, Store, SwapRequest};
use serde_json::Value;

pub struct Mem(pub Option<Persisted>);
impl Store for Mem {
    fn load(&mut self) -> Option<Persisted> {
        self.0.clone()
    }
    fn save(&mut self, p: &Persisted) {
        self.0 = Some(p.clone());
    }
    fn clear(&mut self) {
        self.0 = None;
    }
}

/// Serves the random draws the browser chip made, in order and with the same lengths.
pub struct Replay {
    rng: VecDeque<Vec<u8>>,
    now: u64,
    draws: usize,
}
impl Platform for Replay {
    fn random(&mut self, buf: &mut [u8]) {
        let next = self.rng.pop_front().unwrap_or_else(|| panic!("the Rust chip drew {} random bytes the browser chip didn't", buf.len()));
        assert_eq!(next.len(), buf.len(), "random draw of a different size than the browser chip's");
        buf.copy_from_slice(&next);
        self.draws += 1;
    }
    fn now_ms(&self) -> u64 {
        self.now
    }
}

pub fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().to_string()
}

pub fn request(op: &Value) -> SignRequest {
    match op["chain"].as_str().unwrap() {
        "sol" => SignRequest::Sol(hex::decode(s(op, "message")).unwrap()),
        "evm" => SignRequest::Evm(hex::decode(s(op, "tx")).unwrap()),
        _ => {
            let w = &op["swap"];
            SignRequest::Swap(SwapRequest {
                src: w["src"].as_u64().unwrap(),
                dst: w["dst"].as_u64().unwrap(),
                sell_token: s(w, "sellToken"),
                sell_amount: s(w, "sellAmount").parse().unwrap(),
                buy_token: s(w, "buyToken"),
                min_receive: s(w, "minReceive").parse().unwrap(),
                deadline: w["deadline"].as_i64().unwrap(),
            })
        }
    }
}

/// Replays a recorded browser-chip session against `chip` and requires identical bytes. `via_bus`: drive the Game
/// Boy side as the cartridge sees it (captured write cycles in, the ROM window out), with work-RAM and chip-half
/// writes mixed in that must be ignored. `power_cycle` runs alongside the chip's own reset (e.g. an SE050 model).
pub fn run_with<V: Vault>(name: &str, via_bus: bool, chip: Chip<Mem, V>, power_cycle: impl Fn(&mut Chip<Mem, V>), label: &str) {
    run_mode(name, via_bus, None, chip, power_cycle, label)
}

/// How a phone-link message reaches the chip and its reply comes back.
pub trait PhoneSide<V: Vault> {
    fn exchange(&mut self, chip: &mut Chip<Mem, V>, req: &[u8], p: &mut Replay) -> Vec<u8>;
}

/// Straight into the cartridge's server.
impl<V: Vault> PhoneSide<V> for PhoneServer {
    fn exchange(&mut self, chip: &mut Chip<Mem, V>, req: &[u8], p: &mut Replay) -> Vec<u8> {
        self.handle(chip, req, p)
    }
}

/// `via_link`: every phone call goes in as the phone-link messages the web app sent (`link.req`), through
/// `PhoneServer`, and its replies must equal the reference server's (`link.rep`), STATUS polls included.
pub fn run_mode<V: Vault>(name: &str, via_bus: bool, mut link: Option<&mut dyn PhoneSide<V>>, mut chip: Chip<Mem, V>, power_cycle: impl Fn(&mut Chip<Mem, V>), label: &str) {
    let via_link = link.is_some();
    let path = format!("{}/tests/vectors/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let mut p = Replay { rng: VecDeque::new(), now: doc["start"].as_u64().unwrap(), draws: 0 };
    let mut mem = [0u8; 256];
    let mut bus = Mailbox::default();
    let mut image = vec![0u8; 0x8000];
    let mut unused_draws = 0;
    let mut checked = 0;

    for (n, op) in doc["ops"].as_array().unwrap().iter().enumerate() {
        let kind = op["op"].as_str().unwrap();
        let at = format!("{name} op {n} ({kind} {})", op.get("name").or(op.get("label")).and_then(|v| v.as_str()).unwrap_or(""));
        if kind == "rng" {
            p.rng.push_back(hex::decode(s(op, "hex")).unwrap());
            continue;
        }
        if let (Some(server), Some(l)) = (link.as_deref_mut(), op.get("link")) {
            for (k, (q, want)) in l["req"].as_array().unwrap().iter().zip(l["rep"].as_array().unwrap()).enumerate() {
                let got = server.exchange(&mut chip, &hex::decode(q.as_str().unwrap()).unwrap(), &mut p);
                assert_eq!(hex::encode(got), want.as_str().unwrap(), "{at}: link message {k} ({})", q.as_str().unwrap());
            }
            checked += 1;
            unused_draws += p.rng.len();
            p.rng.clear();
            continue;
        }
        match kind {
            "status" => {
                checked -= 1; // only meaningful over the link
            }
            "clock" => p.now = op["now"].as_u64().unwrap(),
            "gb" => {
                let data = hex::decode(s(op, "data")).unwrap();
                let (cmd, arg, seq) = (op["cmd"].as_u64().unwrap() as u8, op["arg"].as_u64().unwrap() as u8, op["seq"].as_u64().unwrap() as u8);
                if via_bus {
                    // the ROM's order (rom/src/main.c chip_call): data, length, arg, cmd, then the sequence number
                    let mut writes: Vec<(u16, u8)> = data.iter().enumerate().map(|(i, &b)| (0xa000 + (mb::REQ + i) as u16, b)).collect();
                    writes.extend([(0xa000 + mb::REQ_LEN as u16, data.len() as u8), (0xa000 + mb::ARG as u16, arg), (0xa000 + mb::CMD as u16, cmd)]);
                    for (k, (a, v)) in writes.iter().enumerate() {
                        bus.on_write(encode_write(*a, *v));
                        // decoys the cartridge must ignore: work RAM, the chip-owned half, a ROM-area write, a mirror
                        bus.on_write(encode_write(0xc000 + k as u16, 0x5a));
                        bus.on_write(encode_write(0xa040 + k as u16, 0xee));
                        bus.on_write(encode_write(0x2000, 0x01));
                    }
                    bus.on_write(encode_write(0xbf00 + mb::REQ_SEQ as u16, seq)); // a mirror of 0xA000
                    bus.service(&mut chip, &mut p, &mut image);
                    bus.service(&mut chip, &mut p, &mut image); // the next frame's status bytes, as recorded
                    mem[mb::RESP_SEQ..].copy_from_slice(&image[ROM_WINDOW + mb::RESP_SEQ..ROM_WINDOW + 256]);
                } else {
                    mem[mb::CMD] = cmd;
                    mem[mb::ARG] = arg;
                    mem[mb::REQ_LEN] = data.len() as u8;
                    mem[mb::REQ..mb::REQ + data.len()].copy_from_slice(&data);
                    mem[mb::REQ_SEQ] = seq;
                    chip.tick(&mut mem, &mut p);
                    chip.tick(&mut mem, &mut p); // the next frame's status bytes, as recorded
                }
                let resp = &mem[mb::RESP..mb::RESP + mem[mb::RESP_LEN] as usize];
                assert_eq!(mem[mb::STATUS] as u64, op["status"].as_u64().unwrap(), "{at}: status");
                assert_eq!(hex::encode(resp), s(op, "resp"), "{at}: reply bytes");
                assert_eq!(hex::encode(&mem[mb::RESP_SEQ..]), s(op, "chipHalf"), "{at}: chip half of the mailbox");
            }
            "pair" => {
                let r = chip.request_pairing(&s(op, "name"), &mut p);
                if op["ok"].as_bool().unwrap() {
                    assert_eq!(r.as_deref().ok(), op["code"].as_str(), "{at}: pairing code");
                } else {
                    assert_eq!(r.err().map(|e| e.0), Some(s(op, "error")), "{at}: pairing refusal");
                }
            }
            "sign" => {
                let r = chip.request_signature(&request(op), &mut p);
                if op["ok"].as_bool().unwrap() {
                    assert_eq!(r.ok().map(|id| id as u64), op["id"].as_u64(), "{at}: request accepted");
                } else {
                    assert_eq!(r.err().map(|e| e.0), Some(s(op, "error")), "{at}: refusal text");
                }
            }
            "result" => {
                let got = chip.take_result(op["id"].as_u64().unwrap() as u32);
                if op["pending"].as_bool() == Some(true) {
                    assert!(got.is_none(), "{at}: should still wait");
                } else if op["approved"].as_bool() == Some(false) {
                    let reason = s(op, "reason");
                    assert!(matches!(&got, Some(SignResult::Refused(r)) if *r == reason), "{at}: {got:?} vs refused {reason}");
                } else {
                    match (op["chain"].as_str().unwrap(), got) {
                        ("sol", Some(SignResult::Sol(b))) => assert_eq!(hex::encode(b), s(op, "signed"), "{at}: signed Solana tx"),
                        ("evm", Some(SignResult::Evm(b))) => assert_eq!(hex::encode(b), s(op, "signed"), "{at}: signed EVM tx"),
                        ("swap", Some(SignResult::Swap { signature, digest })) => {
                            assert_eq!(digest, s(op, "digest"), "{at}: swap digest");
                            assert_eq!(signature, s(op, "signature"), "{at}: swap signature");
                        }
                        (c, g) => panic!("{at}: expected a {c} result, got {g:?}"),
                    }
                }
            }
            "txstatus" => chip.set_tx_status(
                op["id"].as_u64().unwrap() as u32,
                &s(op, "state"),
                op["hash"].as_str(),
                op["reason"].as_str(),
            ),
            "balance" => {
                let chain = if s(op, "chain") == "sol" { Chain::Sol } else { Chain::Evm };
                chip.set_balance(chain, op["units"].as_str().map(|u| u.parse().unwrap()));
            }
            "network" => chip.set_evm_network(op["id"].as_u64().unwrap()),
            "unpair" => chip.unpair(),
            "reset" => {
                chip.reset();
                power_cycle(&mut chip);
                mem = [0; 256];
                bus.clear();
                image = vec![0u8; 0x8000];
            }
            other => panic!("{at}: unknown op {other}"),
        }
        checked += 1;
        // draws the browser chip made for its own reasons (none should be left by the Rust chip's needs)
        unused_draws += p.rng.len();
        p.rng.clear();
    }
    println!("{name}{}{}{label}: {checked} ops identical, {} random draws used, {unused_draws} browser-only draws skipped", if via_bus { " (via the bus)" } else { "" }, if via_link { " (phone link)" } else { "" }, p.draws);
}

