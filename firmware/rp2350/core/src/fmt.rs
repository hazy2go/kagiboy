//! Amount text exactly as the browser chip writes it (viem `formatUnits` and the helpers in `web/src/chip/chip.ts`).

use alloc::format;
use alloc::string::{String, ToString};

use crate::Error;

/// viem `formatUnits`: integer part, then the fraction with trailing zeros trimmed (no dot if nothing is left).
pub fn format_units(units: u128, decimals: u32) -> String {
    let mut digits = units.to_string();
    let d = decimals as usize;
    if digits.len() < d {
        digits = format!("{}{}", "0".repeat(d - digits.len()), digits);
    }
    let (int, frac) = digits.split_at(digits.len() - d);
    let frac = frac.trim_end_matches('0');
    let int = if int.is_empty() { "0" } else { int };
    if frac.is_empty() { int.to_string() } else { format!("{int}.{frac}") }
}

pub fn pow10(n: u32) -> Option<u128> {
    10u128.checked_pow(n)
}

/// An amount shown whole on one Game Boy line, or not at all.
pub fn exact(units: u128, decimals: u32) -> Result<String, Error> {
    let t = format_units(units, decimals);
    if t.len() > 18 {
        return Err(Error::from("this amount has too many digits to show on the Game Boy"));
    }
    Ok(t)
}

/// Rounded up to `places` decimals, for a fee ceiling.
pub fn ceil_decimals(units: u128, decimals: u32, places: u32) -> Option<String> {
    let step = pow10(decimals - places)?;
    let up = units.checked_add(step - 1)? / step * step;
    Some(format_units(up, decimals))
}

/// The most decimals that fit `width` characters, rounded down (a minimum must never be overstated).
pub fn fit_floor(units: u128, decimals: u32, width: usize) -> Result<String, Error> {
    let mut places = decimals.min(8) as i32;
    while places >= 0 {
        let step = pow10(decimals - places as u32).ok_or("bad amounts")?;
        let t = format_units(units / step * step, decimals);
        if t.len() <= width {
            return Ok(t);
        }
        places -= 1;
    }
    Err(Error::from("this amount can't be shown on the Game Boy"))
}

/// The most decimals that fit `width` characters, rounded up (a fee must never be understated).
pub fn fit_ceil(units: u128, decimals: u32, width: usize) -> Result<String, Error> {
    let mut places = decimals.min(8) as i32;
    while places >= 0 {
        if let Some(t) = ceil_decimals(units, decimals, places as u32) {
            if t.len() <= width {
                return Ok(t);
            }
        }
        places -= 1;
    }
    Err(Error::from("this fee can't be shown on the Game Boy"))
}

/// Home-screen balance: at most 11 characters of number, then the unit.
pub fn balance_text(units: Option<u128>, decimals: u32, sym: &str) -> String {
    let Some(units) = units else { return format!("-- {sym}") };
    let t = format_units(units, decimals);
    let (whole, frac) = match t.split_once('.') {
        Some((w, f)) => (w, f),
        None => (t.as_str(), ""),
    };
    let places = 10i32.saturating_sub(whole.len() as i32).clamp(0, 4) as usize;
    let num = if whole.len() > 11 {
        ">9999999999".to_string()
    } else if places > 0 {
        let mut f = String::from(frac);
        while f.len() < places {
            f.push('0');
        }
        format!("{whole}.{}", &f[..places])
    } else {
        whole.to_string()
    };
    format!("{num} {sym}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units() {
        assert_eq!(format_units(0, 9), "0");
        assert_eq!(format_units(1_234_500_000, 9), "1.2345");
        assert_eq!(format_units(5000, 9), "0.000005");
        assert_eq!(format_units(10u128.pow(18), 18), "1");
        assert_eq!(format_units(42, 0), "42");
        assert_eq!(balance_text(Some(2_480_000_000), 9, "SOL"), "2.4800 SOL");
        assert_eq!(balance_text(Some(123_456_789_012_345_678), 9, "SOL"), "123456789.0 SOL");
        assert_eq!(balance_text(Some(5), 9, "SOL"), "0.0000 SOL");
        assert_eq!(balance_text(None, 9, "SOL"), "-- SOL");
        assert_eq!(ceil_decimals(630_000_000_000_000, 18, 6).unwrap(), "0.00063");
    }
}
