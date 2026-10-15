//! Puts memory.x where the linker finds it, and checks the wallet ROM the firmware serves.
use std::{env, fs, path::PathBuf};

fn main() {
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    fs::write(out.join("memory.x"), include_bytes!("memory.x")).unwrap();
    println!("cargo:rustc-link-search={}", out.display());
    println!("cargo:rerun-if-changed=memory.x");

    // the hardware build of the ROM (rom/: make hw): mailbox writes at 0xA000, chip replies read at 0x7F00
    let rom = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../../../rom/build/wallet-hw.gb");
    println!("cargo:rerun-if-changed={}", rom.display());
    let bytes = fs::read(&rom).unwrap_or_else(|_| panic!("{} missing: run `make hw` in rom/", rom.display()));
    assert!(bytes.len() <= 0x8000, "the wallet ROM must fit 32 KB (it is served from SRAM)");
    assert!(bytes.len() <= 0x7f00 || bytes[0x7f00..].iter().all(|&b| b == 0 || b == 0xff), "ROM data in the mailbox window 0x7F00-0x7FFF");
    println!("cargo:rustc-env=KAGIBOY_ROM={}", rom.canonicalize().unwrap().display());
}
