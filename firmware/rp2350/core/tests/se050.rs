//! The SE050 path: the recorded browser sessions replayed through `Se050Vault` and a behavioural SE050 model
//! (T=1 over I2C and the applet), plus what only a secure element gives: no words or PIN hash in the store, keys that
//! sign only inside the PIN session, the SE050's own attempt limit, and transport recovery.

mod common;
mod se050_model;

use common::{run_with, Mem};
use kagiboy_core::chip::{cmd, mb};
use kagiboy_core::se050::{Se050, SeError};
use kagiboy_core::vault::{pin_value, Se050Vault, EVM_KEY_ID, PIN_ID, SOL_KEY_ID};
use kagiboy_core::{Chip, Platform};
use se050_model::{Model, Quirks};

type SeChip = Chip<Mem, Se050Vault<Model>>;

fn se_chip(quirks: Quirks) -> SeChip {
    let mut m = Model::new();
    m.quirks = quirks;
    Chip::with_vault(Mem(None), Se050Vault::new(m))
}

fn model(c: &mut SeChip) -> &mut Model {
    &mut c.vault().se.t1.bus
}

fn replay(name: &str, via_bus: bool, quirks: Quirks, label: &str) {
    run_with(name, via_bus, se_chip(quirks), |c| model(c).power_cycle(), label);
}

#[test]
fn sessions_identical_through_the_se050() {
    for name in ["session-create", "session-restore", "session-power"] {
        replay(name, false, Quirks::default(), " [SE050]");
        replay(name, true, Quirks::default(), " [SE050, via the bus]");
    }
}

#[test]
fn sessions_identical_with_a_difficult_se050() {
    // busy NACKs before every frame, a WTX request before every response, responses chained in 16-byte blocks
    let q = Quirks { busy_reads: 3, wtx: true, resp_ifs: Some(16), corrupt_next: false };
    for name in ["session-create", "session-restore", "session-power"] {
        replay(name, false, q.clone(), " [SE050: busy, WTX, chained]");
    }
}

// ---------------------------------------------------------------- what the secure element adds

struct Fixed(u64, u8);
impl Platform for Fixed {
    fn random(&mut self, buf: &mut [u8]) {
        for b in buf {
            self.1 = self.1.wrapping_mul(31).wrapping_add(7);
            *b = self.1;
        }
    }
    fn now_ms(&self) -> u64 {
        self.0
    }
}

/// One Game Boy command; returns (status, reply bytes).
fn gb(c: &mut SeChip, m: &mut [u8; 256], seq: &mut u8, p: &mut Fixed, command: u8, data: &[u8]) -> (u8, Vec<u8>) {
    *seq = seq.wrapping_add(1).max(1);
    m[mb::CMD] = command;
    m[mb::ARG] = 0;
    m[mb::REQ_LEN] = data.len() as u8;
    m[mb::REQ..mb::REQ + data.len()].copy_from_slice(data);
    m[mb::REQ_SEQ] = *seq;
    c.tick(m, p);
    let n = m[mb::RESP_LEN] as usize;
    (m[mb::STATUS], m[mb::RESP..mb::RESP + n].to_vec())
}

#[test]
fn keys_live_in_the_se050_and_need_the_pin() {
    let mut c = se_chip(Quirks::default());
    let (mut m, mut seq, mut p) = ([0u8; 256], 0u8, Fixed(1_792_056_600_000, 1));
    gb(&mut c, &mut m, &mut seq, &mut p, cmd::ENTROPY, &[1, 2, 3]);
    let (st, words) = gb(&mut c, &mut m, &mut seq, &mut p, cmd::CREATE, &[]);
    assert_eq!(st, 0);
    let words = String::from_utf8(words).unwrap();
    assert_eq!(gb(&mut c, &mut m, &mut seq, &mut p, cmd::SET_PIN, &[3, 1, 4, 1]).0, 0);

    // the store holds no secret: no words, no PIN hash; the public keys name the accounts
    let stored = c.store().0.clone().unwrap();
    assert!(stored.mnemonic.is_empty() && stored.pin_hash.is_empty());
    let w = kagiboy_core::keys::Wallet::from_mnemonic(&words);
    assert_eq!((stored.sol_public, stored.evm_address), (w.sol_public, w.evm_address));
    for id in [PIN_ID, SOL_KEY_ID, EVM_KEY_ID] {
        assert!(model(&mut c).has(id), "object {id:08x} on the SE050");
    }
    assert_eq!(gb(&mut c, &mut m, &mut seq, &mut p, cmd::PING, &[]).1, [2]); // unlocked after setup

    // without a PIN session the keys refuse to sign, even if firmware asks directly
    let salt = stored.pin_salt.clone();
    let mut se = Se050::new(std::mem::replace(model(&mut c), Model::new()));
    se.init().unwrap();
    assert_eq!(se.eddsa_sign(None, SOL_KEY_ID, b"hi"), Err(SeError::Status(0x6986)));
    assert_eq!(se.ecdsa_sign(None, EVM_KEY_ID, &[1; 32]), Err(SeError::Status(0x6986)));
    // ...and inside a session opened with the right PIN they do
    let s = se.create_session(PIN_ID).unwrap();
    se.verify_user_id(&s, &pin_value(&salt, &[3, 1, 4, 1])).unwrap();
    let sig = se.eddsa_sign(Some(&s), SOL_KEY_ID, b"hi").unwrap();
    use ed25519_dalek::{Signer, Verifier};
    let vk = ed25519_dalek::VerifyingKey::from_bytes(&w.sol_public).unwrap();
    vk.verify(b"hi", &ed25519_dalek::Signature::from_bytes(&sig)).expect("RFC 8032 signature after un-reversing");
    assert_eq!(sig, ed25519_dalek::SigningKey::from_bytes(&w.sol_secret).sign(b"hi").to_bytes());
}

#[test]
fn five_wrong_pins_wipe_and_the_se050_holds_its_own_limit() {
    let mut c = se_chip(Quirks::default());
    let (mut m, mut seq, mut p) = ([0u8; 256], 0u8, Fixed(1_792_056_600_000, 9));
    gb(&mut c, &mut m, &mut seq, &mut p, cmd::CREATE, &[]);
    gb(&mut c, &mut m, &mut seq, &mut p, cmd::SET_PIN, &[1, 2, 3, 4]);
    gb(&mut c, &mut m, &mut seq, &mut p, cmd::LOCK, &[]);
    for left in (1..5).rev() {
        assert_eq!(gb(&mut c, &mut m, &mut seq, &mut p, cmd::UNLOCK, &[0, 0, 0, 0]), (1, vec![left]));
    }
    assert_eq!(gb(&mut c, &mut m, &mut seq, &mut p, cmd::UNLOCK, &[0, 0, 0, 0]).0, 2, "fifth wrong PIN wipes");
    for id in [PIN_ID, SOL_KEY_ID, EVM_KEY_ID] {
        assert!(!model(&mut c).has(id), "object {id:08x} deleted");
    }
    assert_eq!(gb(&mut c, &mut m, &mut seq, &mut p, cmd::PING, &[]).1, [0]);

    // firmware that "forgot" its counter still meets the SE050's limit: five failures block the PIN object
    let mut se = Se050::new(Model::new());
    se.init().unwrap();
    se.write_user_id(PIN_ID, &[7; 16], 5, &kagiboy_core::vault::pin_policy()).unwrap();
    for _ in 0..5 {
        let s = se.create_session(PIN_ID).unwrap();
        assert_eq!(se.verify_user_id(&s, &[8; 16]), Err(SeError::Status(0x6985)));
    }
    let s = se.create_session(PIN_ID).unwrap();
    assert_eq!(se.verify_user_id(&s, &[7; 16]), Err(SeError::Status(0x6985)), "the right PIN no longer opens it");
    // and nobody may rewrite it to get around that; deleting (the wipe) is allowed
    assert_eq!(se.write_user_id(PIN_ID, &[7; 16], 5, &[]), Err(SeError::Status(0x6986)));
    se.delete(PIN_ID).unwrap();
}

#[test]
fn transport_recovers() {
    // a damaged response frame is asked for again; a long message goes out chained
    let mut se = Se050::new(Model::new());
    se.init().unwrap();
    let w = kagiboy_core::keys::Wallet::from_mnemonic("legal winner thank year wave sausage worth useful legal winner thank yellow");
    let mut pubrev = w.sol_public;
    pubrev.reverse();
    se.write_ec_key_pair(SOL_KEY_ID, 0x40, &w.sol_secret, &pubrev, &[]).unwrap();
    se.t1.bus.quirks.corrupt_next = true;
    let msg = vec![0xabu8; 600]; // > one 254-byte block: a chained command
    let sig = se.eddsa_sign(None, SOL_KEY_ID, &msg).unwrap();
    use ed25519_dalek::Signer;
    assert_eq!(sig, ed25519_dalek::SigningKey::from_bytes(&w.sol_secret).sign(&msg).to_bytes());
    assert!(!se.t1.bus.quirks.corrupt_next, "the damaged frame was sent");
    // an unknown command is reported, not swallowed
    assert_eq!(se.cmd(None, 0x04, 0x00, 0x7f, &[], false), Err(SeError::Status(0x6d00)));
}
