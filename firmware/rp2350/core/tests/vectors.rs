//! Differential test: replays the browser chip's recorded sessions (`web/scripts/chip-vectors.ts`) against the
//! Rust chip and requires identical bytes everywhere: every reply, the chip's half of the mailbox after every
//! command, every refusal text the phone sees, every pairing code and every signed transaction or signature.

use std::collections::VecDeque;

use kagiboy_core::chip::mb;
use kagiboy_core::{Chain, Chip, Persisted, Platform, SignRequest, SignResult, Store, SwapRequest};
use serde_json::Value;

struct Mem(Option<Persisted>);
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
struct Replay {
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

fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().to_string()
}

fn request(op: &Value) -> SignRequest {
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

fn run(name: &str) {
    let path = format!("{}/tests/vectors/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let mut chip = Chip::new(Mem(None));
    let mut p = Replay { rng: VecDeque::new(), now: doc["start"].as_u64().unwrap(), draws: 0 };
    let mut mem = [0u8; 256];
    let mut unused_draws = 0;
    let mut checked = 0;

    for (n, op) in doc["ops"].as_array().unwrap().iter().enumerate() {
        let kind = op["op"].as_str().unwrap();
        let at = format!("{name} op {n} ({kind} {})", op.get("name").or(op.get("label")).and_then(|v| v.as_str()).unwrap_or(""));
        if kind == "rng" {
            p.rng.push_back(hex::decode(s(op, "hex")).unwrap());
            continue;
        }
        match kind {
            "clock" => p.now = op["now"].as_u64().unwrap(),
            "gb" => {
                let data = hex::decode(s(op, "data")).unwrap();
                mem[mb::CMD] = op["cmd"].as_u64().unwrap() as u8;
                mem[mb::ARG] = op["arg"].as_u64().unwrap() as u8;
                mem[mb::REQ_LEN] = data.len() as u8;
                mem[mb::REQ..mb::REQ + data.len()].copy_from_slice(&data);
                mem[mb::REQ_SEQ] = op["seq"].as_u64().unwrap() as u8;
                chip.tick(&mut mem, &mut p);
                chip.tick(&mut mem, &mut p); // the next frame's status bytes, as recorded
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
                mem = [0; 256];
            }
            other => panic!("{at}: unknown op {other}"),
        }
        checked += 1;
        // draws the browser chip made for its own reasons (none should be left by the Rust chip's needs)
        unused_draws += p.rng.len();
        p.rng.clear();
    }
    println!("{name}: {checked} ops identical, {} random draws used, {unused_draws} browser-only draws skipped", p.draws);
}

#[test]
fn session_create() {
    run("session-create");
}

#[test]
fn session_restore() {
    run("session-restore");
}

#[test]
fn session_power() {
    run("session-power");
}
