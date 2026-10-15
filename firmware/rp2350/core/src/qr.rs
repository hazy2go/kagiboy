//! QR codes for the Game Boy's receive screen, bit for bit what the browser chip draws with qrcode-generator
//! (Kazuhiko Arase, MIT): byte mode, error level L, the smallest version that fits, and that library's own
//! mask scoring ("lost point", with its fractional dark-ratio term). Versions 1-3 only: anything bigger than
//! 29 x 29 doesn't fit the screen, and each of these versions is a single Reed-Solomon block at level L.

use alloc::vec;
use alloc::vec::Vec;

const LEVEL_L: u32 = 1; // qrcode-generator's numbering: L 1, M 0, Q 3, H 2
/// (total codewords, data codewords) at level L
const BLOCKS: [(usize, usize); 3] = [(26, 19), (44, 34), (70, 55)];
const ALIGN: [&[usize]; 3] = [&[], &[6, 18], &[6, 22]];

struct Gf {
    exp: [u8; 256],
    log: [u8; 256],
}

impl Gf {
    fn new() -> Gf {
        let mut exp = [0u8; 256];
        let mut log = [0u8; 256];
        for i in 0..8 {
            exp[i] = 1 << i;
        }
        for i in 8..256 {
            exp[i] = exp[i - 4] ^ exp[i - 5] ^ exp[i - 6] ^ exp[i - 8];
        }
        for i in 0..255 {
            log[exp[i] as usize] = i as u8;
        }
        Gf { exp, log }
    }
    fn mul(&self, a: u8, b: u8) -> u8 {
        if a == 0 || b == 0 {
            return 0;
        }
        self.exp[(self.log[a as usize] as usize + self.log[b as usize] as usize) % 255]
    }
}

fn rs_ec(data: &[u8], ec_len: usize) -> Vec<u8> {
    let gf = Gf::new();
    // generator: product of (x - a^i), highest degree first
    let mut g = vec![1u8];
    for i in 0..ec_len {
        let mut next = vec![0u8; g.len() + 1];
        for (j, &c) in g.iter().enumerate() {
            next[j] ^= c;
            next[j + 1] ^= gf.mul(c, gf.exp[i]);
        }
        g = next;
    }
    let mut rem: Vec<u8> = data.iter().copied().chain(core::iter::repeat_n(0, ec_len)).collect();
    for k in 0..data.len() {
        let coef = rem[k];
        if coef != 0 {
            for (j, &gc) in g.iter().enumerate() {
                rem[k + j] ^= gf.mul(gc, coef);
            }
        }
    }
    rem[data.len()..].to_vec()
}

struct Bits {
    v: Vec<bool>,
}
impl Bits {
    fn put(&mut self, n: u32, len: u32) {
        for i in (0..len).rev() {
            self.v.push((n >> i) & 1 == 1);
        }
    }
}

fn codewords(text: &[u8], version: usize) -> Option<Vec<u8>> {
    let (total, data_n) = BLOCKS[version - 1];
    let mut b = Bits { v: Vec::new() };
    b.put(4, 4); // byte mode
    b.put(text.len() as u32, 8);
    for &c in text {
        b.put(c as u32, 8);
    }
    if b.v.len() > data_n * 8 {
        return None;
    }
    if b.v.len() + 4 <= data_n * 8 {
        b.put(0, 4);
    }
    while b.v.len() % 8 != 0 {
        b.v.push(false);
    }
    loop {
        if b.v.len() >= data_n * 8 {
            break;
        }
        b.put(0xec, 8);
        if b.v.len() >= data_n * 8 {
            break;
        }
        b.put(0x11, 8);
    }
    let data: Vec<u8> = b.v.chunks(8).map(|c| c.iter().fold(0u8, |a, &x| a << 1 | x as u8)).collect();
    let ec = rs_ec(&data, total - data_n);
    Some(data.into_iter().chain(ec).collect())
}

fn bch_digit(mut d: u32) -> u32 {
    let mut n = 0;
    while d != 0 {
        n += 1;
        d >>= 1;
    }
    n
}

fn type_info(mask: u32) -> u32 {
    const G15: u32 = 0x537;
    const G15_MASK: u32 = 0x5412;
    let data = LEVEL_L << 3 | mask;
    let mut d = data << 10;
    while bch_digit(d) >= bch_digit(G15) {
        d ^= G15 << (bch_digit(d) - bch_digit(G15));
    }
    (data << 10 | d) ^ G15_MASK
}

fn mask_bit(m: u32, i: usize, j: usize) -> bool {
    match m {
        0 => (i + j) % 2 == 0,
        1 => i % 2 == 0,
        2 => j % 3 == 0,
        3 => (i + j) % 3 == 0,
        4 => (i / 2 + j / 3) % 2 == 0,
        5 => (i * j) % 2 + (i * j) % 3 == 0,
        6 => ((i * j) % 2 + (i * j) % 3) % 2 == 0,
        _ => ((i * j) % 3 + (i + j) % 2) % 2 == 0,
    }
}

type Grid = Vec<Vec<Option<bool>>>;

fn build(version: usize, data: &[u8], test: bool, mask: u32) -> Grid {
    let n = version * 4 + 17;
    let mut m: Grid = vec![vec![None; n]; n];
    for (row, col) in [(0, 0), (n - 7, 0), (0, n - 7)] {
        for r in -1i32..=7 {
            let rr = row as i32 + r;
            if rr <= -1 || n as i32 <= rr {
                continue;
            }
            for c in -1i32..=7 {
                let cc = col as i32 + c;
                if cc <= -1 || n as i32 <= cc {
                    continue;
                }
                let on = ((0..=6).contains(&r) && (c == 0 || c == 6))
                    || ((0..=6).contains(&c) && (r == 0 || r == 6))
                    || ((2..=4).contains(&r) && (2..=4).contains(&c));
                m[rr as usize][cc as usize] = Some(on);
            }
        }
    }
    let pos = ALIGN[version - 1];
    for &row in pos {
        for &col in pos {
            if m[row][col].is_some() {
                continue;
            }
            for r in -2i32..=2 {
                for c in -2i32..=2 {
                    let on = r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0);
                    m[(row as i32 + r) as usize][(col as i32 + c) as usize] = Some(on);
                }
            }
        }
    }
    for r in 8..n - 8 {
        if m[r][6].is_none() {
            m[r][6] = Some(r % 2 == 0);
        }
    }
    for c in 8..n - 8 {
        if m[6][c].is_none() {
            m[6][c] = Some(c % 2 == 0);
        }
    }
    let bits = type_info(mask);
    for i in 0..15 {
        let on = !test && (bits >> i) & 1 == 1;
        if i < 6 {
            m[i][8] = Some(on);
        } else if i < 8 {
            m[i + 1][8] = Some(on);
        } else {
            m[n - 15 + i][8] = Some(on);
        }
    }
    for i in 0..15 {
        let on = !test && (bits >> i) & 1 == 1;
        if i < 8 {
            m[8][n - i - 1] = Some(on);
        } else if i < 9 {
            m[8][15 - i - 1 + 1] = Some(on);
        } else {
            m[8][15 - i - 1] = Some(on);
        }
    }
    m[n - 8][8] = Some(!test);
    // data, in the zig-zag column pairs from the bottom right
    let mut inc: i32 = -1;
    let mut row: i32 = n as i32 - 1;
    let mut bit: i32 = 7;
    let mut byte = 0usize;
    let mut col: i32 = n as i32 - 1;
    while col > 0 {
        if col == 6 {
            col -= 1;
        }
        loop {
            for c in 0..2 {
                let cc = (col - c) as usize;
                if m[row as usize][cc].is_none() {
                    let mut dark = byte < data.len() && (data[byte] >> bit) & 1 == 1;
                    if mask_bit(mask, row as usize, cc) {
                        dark = !dark;
                    }
                    m[row as usize][cc] = Some(dark);
                    bit -= 1;
                    if bit == -1 {
                        byte += 1;
                        bit = 7;
                    }
                }
            }
            row += inc;
            if row < 0 || n as i32 <= row {
                row -= inc;
                inc = -inc;
                break;
            }
        }
        col -= 2;
    }
    m
}

fn dark(m: &Grid, r: usize, c: usize) -> bool {
    m[r][c] == Some(true)
}

fn lost_point(m: &Grid) -> f64 {
    let n = m.len();
    let mut lost = 0f64;
    for row in 0..n {
        for col in 0..n {
            let mut same = 0;
            let d = dark(m, row, col);
            for r in -1i32..=1 {
                let rr = row as i32 + r;
                if rr < 0 || n as i32 <= rr {
                    continue;
                }
                for c in -1i32..=1 {
                    let cc = col as i32 + c;
                    if cc < 0 || n as i32 <= cc || (r == 0 && c == 0) {
                        continue;
                    }
                    if d == dark(m, rr as usize, cc as usize) {
                        same += 1;
                    }
                }
            }
            if same > 5 {
                lost += (3 + same - 5) as f64;
            }
        }
    }
    for row in 0..n - 1 {
        for col in 0..n - 1 {
            let count = [(row, col), (row + 1, col), (row, col + 1), (row + 1, col + 1)].iter().filter(|&&(r, c)| dark(m, r, c)).count();
            if count == 0 || count == 4 {
                lost += 3.0;
            }
        }
    }
    let finder = [true, false, true, true, true, false, true];
    for row in 0..n {
        for col in 0..n - 6 {
            if (0..7).all(|k| dark(m, row, col + k) == finder[k]) {
                lost += 40.0;
            }
        }
    }
    for col in 0..n {
        for row in 0..n - 6 {
            if (0..7).all(|k| dark(m, row + k, col) == finder[k]) {
                lost += 40.0;
            }
        }
    }
    let dark_count = (0..n).flat_map(|r| (0..n).map(move |c| (r, c))).filter(|&(r, c)| dark(m, r, c)).count();
    let ratio = libm_abs(100.0 * dark_count as f64 / n as f64 / n as f64 - 50.0) / 5.0;
    lost + ratio * 10.0
}

fn libm_abs(x: f64) -> f64 {
    if x < 0.0 { -x } else { x }
}

/// Byte 0 is the side length, then the modules row by row, 1 bit each (1 = dark). None if it needs version 4+.
pub fn qr_bits(text: &[u8]) -> Option<Vec<u8>> {
    let version = (1..=3).find(|&v| {
        let need = 4 + 8 + 8 * text.len();
        need <= BLOCKS[v - 1].1 * 8
    })?;
    let data = codewords(text, version)?;
    let mut best = 0;
    let mut min = 0f64;
    for mask in 0..8 {
        let lp = lost_point(&build(version, &data, true, mask));
        if mask == 0 || min > lp {
            min = lp;
            best = mask;
        }
    }
    let m = build(version, &data, false, best);
    let n = m.len();
    let mut out = vec![0u8; 1 + (n * n).div_ceil(8)];
    out[0] = n as u8;
    for r in 0..n {
        for c in 0..n {
            let i = r * n + c;
            if dark(&m, r, c) {
                out[1 + (i >> 3)] |= 0x80 >> (i & 7);
            }
        }
    }
    Some(out)
}
