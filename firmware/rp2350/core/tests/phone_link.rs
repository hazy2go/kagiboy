//! The phone link: every phone call of the recorded sessions goes in as the bytes the web app sent
//! (`web/src/chip/link.ts`), through `PhoneServer`, and every reply must equal the reference server's, including a
//! STATUS poll after every step. Run with the software vault, and with the SE050 vault driven over the Game Boy bus.

mod common;
mod se050_model;

use common::{run_mode, Mem};
use kagiboy_core::chip::{cmd, mb};
use kagiboy_core::phone::{op, st, PhoneServer};
use kagiboy_core::vault::Se050Vault;
use kagiboy_core::{Chip, Platform};

const SESSIONS: [&str; 3] = ["session-create", "session-restore", "session-power"];

#[test]
fn sessions_identical_over_the_link() {
    for name in SESSIONS {
        run_mode(name, false, Some(&mut PhoneServer::new()), Chip::new(Mem(None)), |_| {}, "");
    }
}

#[test]
fn sessions_identical_over_the_link_with_the_se050_via_the_bus() {
    for name in SESSIONS {
        let chip = Chip::with_vault(Mem(None), Se050Vault::new(se050_model::Model::new()));
        run_mode(name, true, Some(&mut PhoneServer::new()), chip, |c| c.vault().se.t1.bus.power_cycle(), " [SE050]");
    }
}

struct Clock(u64, u8);
impl Platform for Clock {
    fn random(&mut self, buf: &mut [u8]) {
        for b in buf {
            self.1 = self.1.wrapping_mul(31).wrapping_add(7);
            *b = self.1;
        }
    }
    fn now_ms(&self) -> u64 {
        self.0
    }
    fn set_now_ms(&mut self, ms: u64) {
        self.0 = ms;
    }
}

#[test]
fn malformed_and_repeated_messages() {
    let mut chip = Chip::new(Mem(None));
    let mut s = PhoneServer::new();
    let mut p = Clock(0, 1);
    // garbage gets "malformed", never a panic: empty, truncated, unknown op, trailing bytes, bad UTF-8, out of range
    for bad in [
        &[][..],
        &[op::STATUS][..],
        &[op::STATUS, 1, 0, 0][..],
        &[0x7f, 1][..],
        &[op::UNPAIR, 1, 0][..],
        &[op::PAIR, 1, 2, 0xff, 0xfe][..],
        &[op::PUT, 1, 0xff, 0x07, 1, 2][..],
        &[op::SIGN, 1, 0, 0x01, 0x08][..],
        &[op::SIGN, 1, 9][..],
        &[op::GET, 1, 1, 0][..],
    ] {
        let r = s.handle(&mut chip, bad, &mut p);
        assert_eq!(r.get(2), Some(&st::MALFORMED), "{bad:02x?} -> {r:02x?}");
    }
    // the phone's clock arrives with STATUS
    let mut status = vec![op::STATUS, 7];
    status.extend_from_slice(&1_792_056_600_000u64.to_le_bytes());
    let r = s.handle(&mut chip, &status, &mut p);
    assert_eq!((r[0], r[1], r[2]), (op::STATUS | 0x80, 7, st::OK));
    assert_eq!(p.0, 1_792_056_600_000);
    // refusals carry the chip's text
    let r = s.handle(&mut chip, &[op::PAIR, 8, 0xff], &mut p);
    assert_eq!((r[2], &r[3..]), (st::REFUSED, &b"unlock the cartridge first"[..]));

    // a repeated message (same tag, same bytes: its reply was lost) gets the same reply and no second effect
    let mut m = [0u8; 256];
    let mut gb = |chip: &mut Chip<Mem>, p: &mut Clock, seq: u8, c: u8, arg: u8, data: &[u8]| {
        m[mb::CMD] = c;
        m[mb::ARG] = arg;
        m[mb::REQ_LEN] = data.len() as u8;
        m[mb::REQ..mb::REQ + data.len()].copy_from_slice(data);
        m[mb::REQ_SEQ] = seq;
        chip.tick(&mut m, p);
        (m[mb::STATUS], m[mb::RESP..mb::RESP + m[mb::RESP_LEN] as usize].to_vec())
    };
    gb(&mut chip, &mut p, 1, cmd::CREATE, 0, &[]);
    gb(&mut chip, &mut p, 2, cmd::SET_PIN, 0, &[1, 2, 3, 4]);
    gb(&mut chip, &mut p, 3, cmd::PHONE, 2, &[]); // open the pairing window
    let first = s.handle(&mut chip, &[op::PAIR, 9, 0xff], &mut p);
    assert_eq!(first[2], st::OK);
    let again = s.handle(&mut chip, &[op::PAIR, 9, 0xff], &mut p);
    assert_eq!(again, first, "same tag: same code, not 'another phone is already asking'");
    let other = s.handle(&mut chip, &[op::PAIR, 10, 0xff], &mut p);
    assert_eq!((other[2], &other[3..]), (st::REFUSED, &b"another phone is already asking to pair"[..]));
}
