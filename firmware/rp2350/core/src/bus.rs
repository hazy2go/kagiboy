//! The mailbox as the Game Boy bus sees it on the cartridge (`make hw` ROM):
//! - the Game Boy writes its half (offsets 0x00-0x3F) to the cartridge RAM window, 0xA000-0xBFFF (every 256 bytes
//!   mirror the mailbox). The `gb_write` PIO program captures every write cycle (the board has no /WR line: a write
//!   is a cycle with /RD high) as one 28-bit sample of GPIO16-43;
//! - the Game Boy reads the chip's half through ROM space it leaves empty, 0x7F00 + offset, served from the ROM image
//!   in SRAM by the `gb_read` program.

use crate::chip::{mb, Chip, Platform, Store};

/// Where the chip's half of the mailbox appears in the ROM image.
pub const ROM_WINDOW: usize = 0x7f00;

/// Pins in a `gb_write` sample, relative to GPIO16 (hardware/sim PIN_CROCO).
pub const PIN_RD: u32 = 2;
pub const PIN_A0: u32 = 4;
pub const PIN_D0: u32 = 20;

/// One captured write cycle: the RX FIFO word of `gb_write` (28 pins shifted in from the right, so they sit in the
/// top 28 bits). Returns (address, data).
pub fn decode_write(fifo_word: u32) -> (u16, u8) {
    let pins = fifo_word >> 4;
    ((pins >> PIN_A0) as u16, (pins >> PIN_D0) as u8)
}

/// The FIFO word the PIO program would push for a write of `data` to `addr` (used by tests and the simulator).
pub fn encode_write(addr: u16, data: u8) -> u32 {
    let pins = (1 << PIN_RD) | (addr as u32) << PIN_A0 | (data as u32) << PIN_D0;
    pins << 4
}

/// The Game Boy-owned mailbox byte a write lands on, if any. Writes elsewhere (work RAM, the chip-owned half) are
/// ignored: the DMG pulls /CS low for work RAM too, so the address decides.
pub fn mailbox_offset(addr: u16) -> Option<usize> {
    let off = (addr & 0xff) as usize;
    ((0xa000..0xc000).contains(&addr) && off < mb::RESP_SEQ).then_some(off)
}

/// The cartridge side of the mailbox: the bytes the Game Boy wrote, and the chip's half published into the ROM image.
pub struct Mailbox {
    mem: [u8; 256],
}

impl Default for Mailbox {
    fn default() -> Self {
        Mailbox { mem: [0; 256] }
    }
}

impl Mailbox {
    /// A captured write cycle (in bus order: the Game Boy writes the sequence number last).
    pub fn on_write(&mut self, fifo_word: u32) {
        let (addr, data) = decode_write(fifo_word);
        if let Some(off) = mailbox_offset(addr) {
            self.mem[off] = data;
        }
    }

    /// One chip frame: let the chip answer, then publish its half into the ROM window, the reply sequence number
    /// last so the Game Boy never reads a half-written reply.
    pub fn service<S: Store>(&mut self, chip: &mut Chip<S>, p: &mut impl Platform, rom_image: &mut [u8]) {
        chip.tick(&mut self.mem, p);
        let w = &mut rom_image[ROM_WINDOW..ROM_WINDOW + 256];
        w[..mb::RESP_SEQ].copy_from_slice(&self.mem[..mb::RESP_SEQ]);
        w[mb::RESP_SEQ + 1..].copy_from_slice(&self.mem[mb::RESP_SEQ + 1..]);
        core::sync::atomic::compiler_fence(core::sync::atomic::Ordering::SeqCst);
        w[mb::RESP_SEQ] = self.mem[mb::RESP_SEQ];
    }

    /// Power cycle: the cartridge's RAM is cleared.
    pub fn clear(&mut self) {
        self.mem = [0; 256];
    }
}
