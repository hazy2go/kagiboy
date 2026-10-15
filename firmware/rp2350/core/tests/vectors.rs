//! Differential test: replays the browser chip's recorded sessions (`web/scripts/chip-vectors.ts`) against the
//! Rust chip with the software vault and requires identical bytes everywhere: every reply, the chip's half of the
//! mailbox after every command, every refusal text the phone sees, every pairing code and every signed transaction.

mod common;
use common::{run_with, Mem};
use kagiboy_core::Chip;

fn run(name: &str, via_bus: bool) {
    run_with(name, via_bus, Chip::new(Mem(None)), |_| {}, "");
}

#[test]
fn session_create() {
    run("session-create", false);
}

#[test]
fn session_create_via_bus() {
    run("session-create", true);
}

#[test]
fn session_restore() {
    run("session-restore", false);
}

#[test]
fn session_restore_via_bus() {
    run("session-restore", true);
}

#[test]
fn session_power() {
    run("session-power", false);
}

#[test]
fn session_power_via_bus() {
    run("session-power", true);
}
