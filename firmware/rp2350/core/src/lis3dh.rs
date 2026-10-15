//! The LIS3DH accelerometer (U111, I2C0 at 0x18): what the Game Boy's mailbox gets as ACCEL_X / ACCEL_Y.
//!
//! The ROM uses the readings for shake entropy (the change between frames, so the axes' orientation doesn't matter).
//! Scale as in the browser demo, where the phone's motion sensor feeds the chip: 12 per m/s², clamped to ±127, so
//! 1 g reads about 118. Registers: ST LIS3DH datasheet (Doc ID 17530), sections 8.6-8.16.

pub const ADDR: u8 = 0x18;
const WHO_AM_I: u8 = 0x0f;
const ID: u8 = 0x33;
const CTRL_REG1: u8 = 0x20;
const CTRL_REG4: u8 = 0x23;
const OUT_X_L: u8 = 0x28;
/// SUB(7): auto-increment the register address in a multi-byte read
const AUTO_INC: u8 = 0x80;
/// ODR 100 Hz, normal power (LPen 0), X/Y/Z on
const REG1_100HZ_XYZ: u8 = 0x57;
/// BDU (the two bytes of a reading belong together), ±2 g, high resolution (12 bits, 1 mg/digit)
const REG4_BDU_HR_2G: u8 = 0x88;

/// The I2C bus as the driver needs it (7-bit address fixed to `ADDR`); false on a NACK or bus error.
pub trait Bus {
    fn write(&mut self, bytes: &[u8]) -> bool;
    fn write_read(&mut self, w: &[u8], r: &mut [u8]) -> bool;
}

pub struct Lis3dh<B: Bus> {
    pub bus: B,
    ready: bool,
}

/// One axis in high-resolution mode: 12 bits, left-justified in the 16-bit register pair, 1 mg per digit, as the
/// mailbox value (12 per m/s², ±127).
pub fn to_mailbox(raw: [u8; 2]) -> i8 {
    let mg = (i16::from_le_bytes(raw) >> 4) as i64;
    // mg * 9.80665 / 1000 * 12 = mg * 0.1176798 exactly; rounded like the demo's Math.round (half up)
    let v = mg * 1_176_798;
    (v + 5_000_000).div_euclid(10_000_000).clamp(-127, 127) as i8
}

impl<B: Bus> Lis3dh<B> {
    pub fn new(bus: B) -> Lis3dh<B> {
        Lis3dh { bus, ready: false }
    }

    pub fn ready(&self) -> bool {
        self.ready
    }

    /// Checks the part and starts it measuring; false if it isn't there or didn't take the settings.
    pub fn init(&mut self) -> bool {
        let mut id = [0u8];
        self.ready = self.bus.write_read(&[WHO_AM_I], &mut id)
            && id[0] == ID
            && self.bus.write(&[CTRL_REG4, REG4_BDU_HR_2G])
            && self.bus.write(&[CTRL_REG1, REG1_100HZ_XYZ]);
        if self.ready {
            let mut back = [0u8; 1];
            self.ready = self.bus.write_read(&[CTRL_REG1], &mut back) && back[0] == REG1_100HZ_XYZ;
        }
        self.ready
    }

    /// The latest X and Y as mailbox values; None if the part didn't answer (the caller retries `init` later).
    pub fn read(&mut self) -> Option<(i8, i8)> {
        if !self.ready {
            return None;
        }
        let mut b = [0u8; 6];
        if !self.bus.write_read(&[OUT_X_L | AUTO_INC], &mut b) {
            self.ready = false;
            return None;
        }
        Some((to_mailbox([b[0], b[1]]), to_mailbox([b[2], b[3]])))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The part as its registers behave: WHO_AM_I, the control registers, X/Y/Z pairs that auto-increment only with
    /// SUB(7) set, and no answer when it is "unplugged".
    struct Part {
        regs: [u8; 0x40],
        present: bool,
    }
    impl Bus for Part {
        fn write(&mut self, b: &[u8]) -> bool {
            if !self.present {
                return false;
            }
            let mut a = (b[0] & 0x7f) as usize;
            for &v in &b[1..] {
                if a == WHO_AM_I as usize {
                    return false; // read-only
                }
                self.regs[a] = v;
                if b[0] & AUTO_INC != 0 {
                    a += 1;
                }
            }
            true
        }
        fn write_read(&mut self, w: &[u8], r: &mut [u8]) -> bool {
            if !self.present {
                return false;
            }
            let mut a = (w[0] & 0x7f) as usize;
            for x in r.iter_mut() {
                *x = self.regs[a];
                if w[0] & AUTO_INC != 0 {
                    a += 1;
                }
            }
            true
        }
    }

    fn part() -> Part {
        let mut regs = [0u8; 0x40];
        regs[WHO_AM_I as usize] = ID;
        regs[CTRL_REG1 as usize] = 0x07; // reset value: power-down
        Part { regs, present: true }
    }

    fn set(p: &mut Part, x_mg: i16, y_mg: i16) {
        let x = (x_mg << 4).to_le_bytes();
        let y = (y_mg << 4).to_le_bytes();
        p.regs[0x28..0x2c].copy_from_slice(&[x[0], x[1], y[0], y[1]]);
    }

    #[test]
    fn scale_matches_the_browser_demo() {
        // the demo: Math.max(-127, Math.min(127, Math.round(a * 12))) with a in m/s²; here from mg
        let demo = |mg: i32| (((mg as f64) * 9.80665 / 1000.0 * 12.0) + 0.5).floor().clamp(-127.0, 127.0) as i8;
        for mg in -2048..2048 {
            let raw = ((mg as i16) << 4).to_le_bytes();
            assert_eq!(to_mailbox(raw), demo(mg), "{mg} mg");
        }
        assert_eq!(to_mailbox((1000i16 << 4).to_le_bytes()), 118);
        assert_eq!(to_mailbox(((-2048i16) << 4).to_le_bytes()), -127);
        // the low 4 bits of the pair are not part of the reading
        assert_eq!(to_mailbox([0x0f, 0x00]), 0);
    }

    #[test]
    fn configures_and_reads() {
        let mut s = Lis3dh::new(part());
        assert_eq!(s.read(), None, "nothing before init");
        assert!(s.init());
        assert_eq!((s.bus.regs[CTRL_REG1 as usize], s.bus.regs[CTRL_REG4 as usize]), (0x57, 0x88));
        set(&mut s.bus, 1000, -500);
        assert_eq!(s.read(), Some((118, -59)));
        set(&mut s.bus, 0, 2047);
        assert_eq!(s.read(), Some((0, 127)));
    }

    #[test]
    fn missing_or_wrong_part() {
        let mut p = part();
        p.present = false;
        assert!(!Lis3dh::new(p).init());
        let mut p = part();
        p.regs[WHO_AM_I as usize] = 0x32; // a LIS331, say
        assert!(!Lis3dh::new(p).init());
        // unplugged after init: read fails once, then waits for a new init
        let mut s = Lis3dh::new(part());
        assert!(s.init());
        s.bus.present = false;
        assert_eq!(s.read(), None);
        assert!(!s.ready());
        s.bus.present = true;
        assert!(s.init() && s.read().is_some());
    }
}
