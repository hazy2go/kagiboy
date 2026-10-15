//! kagiboy cartridge wallet logic, the firmware twin of the browser chip (`web/src/chip/chip.ts`).
//!
//! The Game Boy side is the 256-byte mailbox (`Chip::tick`); the phone side (over Bluetooth on the cartridge) is the
//! `Chip::request_*` / `set_*` methods. Behaviour is checked byte for byte against recorded sessions of the
//! browser chip (`tests/vectors`, `web/scripts/chip-vectors.ts`).
#![no_std]

extern crate alloc;

pub mod bus;
pub mod chip;
pub mod eth;
pub mod fmt;
pub mod keys;
pub mod lis3dh;
pub mod link;
pub mod persist;
pub mod phone;
pub mod qr;
pub mod se050;
pub mod sol;
pub mod tables;
pub mod vault;

pub use chip::{Chain, Chip, Persisted, Phone, Platform, Public, SignRequest, SignResult, Store, SwapRequest};

use alloc::string::String;

/// A refusal or failure, with the same text the browser chip gives the phone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error(pub String);

impl From<&str> for Error {
    fn from(s: &str) -> Error {
        Error(String::from(s))
    }
}

impl From<String> for Error {
    fn from(s: String) -> Error {
        Error(s)
    }
}
