//! The chip: Game Boy mailbox commands, PIN and wipe rules, pairing, and the phone's requests,
//! a line-by-line port of `CartChip` in `web/src/chip/chip.ts`.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

use sha2::{Digest, Sha256};
use zeroize::Zeroize;

use crate::fmt::{balance_text, ceil_decimals, exact, fit_ceil, fit_floor};
use crate::keys::{entropy_to_mnemonic, mnemonic_from_indices, suggest_words, Wallet};
use crate::vault::{pin_value, SoftVault, Vault};
use crate::tables::{EVM_NETWORKS, PARTNER_FEE_BPS, PARTNER_WALLET, SODAX_EVM, SOLVER_FEE_BPS, SWAP_TOKENS};
use crate::{eth, qr, sol, Error};

// ---------------------------------------------------------------- mailbox layout (docs/protocol.md)
pub mod mb {
    pub const REQ_SEQ: usize = 0x00;
    pub const CMD: usize = 0x01;
    pub const REQ_LEN: usize = 0x02;
    pub const ARG: usize = 0x03;
    pub const REQ: usize = 0x04;
    pub const RESP_SEQ: usize = 0x40;
    pub const STATUS: usize = 0x41;
    pub const RESP_LEN: usize = 0x42;
    pub const RESP: usize = 0x44;
    pub const MAGIC: usize = 0xf0;
    pub const ACCEL_X: usize = 0xf1;
    pub const ACCEL_Y: usize = 0xf2;
    pub const PENDING: usize = 0xf3;
    pub const PAIRED: usize = 0xf4;
    pub const CHIP_MAGIC: u8 = 0xc7;
    pub const RESP_MAX: usize = 171;
    pub const REQ_MAX: usize = 60;
}

pub mod cmd {
    pub const PING: u8 = 0x01;
    pub const ENTROPY: u8 = 0x02;
    pub const CREATE: u8 = 0x03;
    pub const SET_PIN: u8 = 0x04;
    pub const UNLOCK: u8 = 0x05;
    pub const ACCOUNT: u8 = 0x06;
    pub const PENDING: u8 = 0x07;
    pub const SIGN: u8 = 0x08;
    pub const WIPE: u8 = 0x09;
    pub const TXSTATUS: u8 = 0x0a;
    pub const LOCK: u8 = 0x0b;
    pub const QR: u8 = 0x0c;
    pub const WORDS: u8 = 0x0d;
    pub const RESTORE: u8 = 0x0e;
    pub const NETWORK: u8 = 0x0f;
    pub const PAIR: u8 = 0x10;
    pub const PHONE: u8 = 0x11;
}

const MAX_TRIES: i32 = 5;
const PAIR_TIMEOUT_MS: u64 = 60_000;
const PLAIN_TRANSFER_GAS: u128 = 21_000;
const MAX_TRANSFER_GAS: u128 = 600_000;
const MAX_EVM_FEE_WEI: u128 = 10_000_000_000_000_000;
const SOL_FEE_PER_SIGNATURE: u128 = 5000;
const SWAP_DEMO_NOTE: &str = "SWAPS GO LIVE WITH THE CARTRIDGE";
const TX_STATES: [&str; 6] = ["SIGNED", "BROADCAST", "CONFIRMED", "FAILED", "UNKNOWN", "DEMO"];
const FAIL_REASON: [(&str, &str); 5] = [
    ("NO_FUNDS", "NOT ENOUGH FUNDS"),
    ("EXPIRED", "TOOK TOO LONG"),
    ("NETWORK", "NETWORK ERROR"),
    ("REJECTED", "NETWORK REJECTED IT"),
    ("CHECK_EXPLORER", "CHECK THE EXPLORER"),
];

/// Randomness (the hardware TRNG on the cartridge) and the time (from the phone: the cartridge has no clock).
pub trait Platform {
    fn random(&mut self, buf: &mut [u8]);
    fn now_ms(&self) -> u64;
    /// The phone's clock (unix ms) arrived over the link; a cartridge without a clock of its own runs from it.
    fn set_now_ms(&mut self, _ms: u64) {}
}

/// How the last pairing a phone asked for ended (the phone link's STATUS reports it).
pub mod pair_end {
    pub const NONE: u8 = 0;
    pub const ACCEPTED: u8 = 1;
    pub const REFUSED: u8 = 2;
    pub const LAPSED: u8 = 3;
}

/// The chip as the phone link's STATUS describes it.
pub struct View<'a> {
    pub state: u8,
    pub paired: bool,
    pub has_pending: bool,
    pub pair_window_open: bool,
    pub pairing_code: Option<&'a str>,
    pub pairing_end: u8,
    pub evm_network: u64,
    pub public: Option<Public>,
    pub phone: Option<Phone>,
}

/// What survives a power cycle (the secure element / flash on the cartridge).
pub trait Store {
    fn load(&mut self) -> Option<Persisted>;
    fn save(&mut self, p: &Persisted);
    fn clear(&mut self);
}

#[derive(Clone, Debug, PartialEq)]
pub struct Phone {
    pub name: String,
    pub id: String,
    pub since_ms: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Persisted {
    /// the recovery words: kept only by the software vault (the browser model); empty with a secure element
    pub mnemonic: String,
    pub pin_salt: String,
    pub pin_hash: String,
    pub tries_left: i32,
    pub paired: bool,
    pub phone: Option<Phone>,
    /// public keys (what the home screen shows), so a secure-element wallet needs no secret to name its addresses
    pub sol_public: [u8; 32],
    pub evm_address: [u8; 20],
}

/// The wallet's public side: what the chip shows and checks requests against.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Public {
    pub sol: [u8; 32],
    pub evm: [u8; 20],
}

impl Public {
    pub fn of(w: &Wallet) -> Public {
        Public { sol: w.sol_public, evm: w.evm_address }
    }
    pub fn sol_address(&self) -> String {
        bs58::encode(self.sol).into_string()
    }
    pub fn evm_address_text(&self) -> String {
        eth::checksum_address(&self.evm)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Chain {
    Sol,
    Evm,
}

/// A swap as the phone asks for it; side 0 is Solana, anything else an EVM chain id.
#[derive(Clone, Debug)]
pub struct SwapRequest {
    pub src: u64,
    pub dst: u64,
    pub sell_token: String,
    pub sell_amount: u128,
    pub buy_token: String,
    pub min_receive: u128,
    pub deadline: i64,
}

/// What the phone sends: the Solana message bytes, the unsigned EIP-1559 wire bytes, or a swap.
#[derive(Clone, Debug)]
pub enum SignRequest {
    Sol(Vec<u8>),
    Evm(Vec<u8>),
    Swap(SwapRequest),
}

#[derive(Clone, Debug, PartialEq)]
pub enum SignResult {
    Sol(Vec<u8>),
    Evm(Vec<u8>),
    /// signature (base58 for Solana, 0x-hex r||s||v for EVM) and the digest as lowercase hex
    Swap { signature: String, digest: String },
    Refused(&'static str),
}

struct Shown {
    to: String,
    amount: String,
    fee: String,
    network: String,
}

enum Snap {
    Sol { message: Vec<u8>, signers: u8 },
    Evm(eth::Tx1559),
    Swap { src_sol: bool, digest: [u8; 32] },
}

struct Pending {
    id: u32,
    snap: Snap,
    chain_byte: u8,
    shown: Shown,
}

#[derive(Clone)]
struct TxStatus {
    id: u32,
    chain: Option<Chain>,
    state: &'static str,
    detail: String,
    hash: Option<String>,
}

struct Reply {
    status: u8,
    data: Vec<u8>,
}

impl Reply {
    fn st(status: u8) -> Reply {
        Reply { status, data: Vec::new() }
    }
    fn ok(data: impl Into<Vec<u8>>) -> Reply {
        Reply { status: 0, data: data.into() }
    }
}

pub struct Chip<S: Store, V: Vault = SoftVault> {
    store: S,
    vault: V,
    /// the keys in RAM: from CREATE/RESTORE until SET_PIN, and while unlocked with the software vault
    wallet: Option<Wallet>,
    /// set while unlocked
    public: Option<Public>,
    persisted: Option<Persisted>,
    unlocked: bool,
    pool: [u8; 32],
    last_seq: u8,
    pending: Option<Pending>,
    next_id: u32,
    balances: [Option<u128>; 2],
    tx_status: TxStatus,
    pub accel: (i8, i8),
    pairing: Option<(String, u64)>,
    pairing_name: String,
    pair_window_until: u64,
    evm_net: usize,
    /// sign results the phone hasn't collected yet
    results: Vec<(u32, SignResult)>,
    /// how the last pairing request ended (`pair_end`)
    pub pairing_end: u8,
    /// set when the Game Boy switches the EVM network; the phone follows
    pub network_changed: Option<u64>,
}

fn sha(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

/// The browser chip's `hex()`: lowercase, bytes separated by spaces.
pub fn hex_spaced(b: &[u8]) -> String {
    let mut s = String::new();
    for (i, x) in b.iter().enumerate() {
        if i > 0 {
            s.push(' ');
        }
        s.push_str(&format!("{x:02x}"));
    }
    s
}

/// The browser chip's `ascii()`: printable ASCII and NUL pass, anything else becomes '?'.
fn ascii(s: &str) -> Vec<u8> {
    s.chars().map(|c| if (' '..='~').contains(&c) || c == '\0' { c as u8 } else { b'?' }).collect()
}

fn pin_hash(salt: &str, pin: &[u8]) -> String {
    hex_spaced(&sha(&[&ascii(salt), pin]))
}

fn clean_name(name: &str) -> String {
    let up: String = name.to_uppercase().chars().filter(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || " '.-".contains(*c)).collect();
    let t: String = up.trim().chars().take(14).collect();
    if t.is_empty() { "PHONE".to_string() } else { t }
}

/// "OCT 15": the month and day (UTC) of a time in ms.
fn short_date(ms: u64) -> String {
    if ms == 0 {
        return String::new();
    }
    // days since 1970-01-01 to a civil date (Howard Hinnant's algorithm)
    let z = (ms / 86_400_000) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    const MONTHS: [&str; 12] = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    format!("{} {:02}", MONTHS[(m - 1) as usize], d)
}

fn net_index(id: u64) -> Option<usize> {
    EVM_NETWORKS.iter().position(|n| n.0 == id)
}

fn sodax_chain(side: u64) -> Option<&'static str> {
    if side == 0 {
        return Some("solana");
    }
    SODAX_EVM.iter().find(|n| n.0 == side).map(|n| n.1)
}

fn chip_token(chain: &str, address: &str) -> Option<(&'static str, u32)> {
    let key = if address.starts_with("0x") { address.to_lowercase() } else { address.to_string() };
    SWAP_TOKENS.iter().find(|t| t.0 == chain && t.1 == key).map(|t| (t.2, t.3))
}

fn side_name(side: u64) -> Result<String, Error> {
    if side == 0 {
        return Ok("SOLANA".to_string());
    }
    let i = net_index(side).ok_or("this cartridge doesn't swap on that network")?;
    Ok(EVM_NETWORKS[i].1.to_uppercase())
}

impl<S: Store> Chip<S, SoftVault> {
    /// The browser chip's model: keys derived from words kept in the store.
    pub fn new(store: S) -> Chip<S, SoftVault> {
        Chip::with_vault(store, SoftVault)
    }
}

impl<S: Store, V: Vault> Chip<S, V> {
    pub fn with_vault(mut store: S, vault: V) -> Chip<S, V> {
        let persisted = store.load();
        Chip {
            store,
            vault,
            wallet: None,
            public: None,
            persisted,
            unlocked: false,
            pool: [0; 32],
            last_seq: 0,
            pending: None,
            next_id: 1,
            balances: [None, None],
            tx_status: TxStatus { id: 0, chain: None, state: "", detail: String::new(), hash: None },
            accel: (0, 0),
            pairing: None,
            pairing_name: "PHONE".to_string(),
            pair_window_until: 0,
            evm_net: 0,
            results: Vec::new(),
            pairing_end: pair_end::NONE,
            network_changed: None,
        }
    }

    pub fn store(&self) -> &S {
        &self.store
    }

    pub fn vault(&mut self) -> &mut V {
        &mut self.vault
    }

    // ------------------------------------------------------------ phone-facing API

    pub fn state(&self) -> u8 {
        match (&self.persisted, self.unlocked) {
            (None, _) => 0,
            (Some(_), false) => 1,
            (Some(_), true) => 2,
        }
    }

    pub fn paired(&self) -> bool {
        self.persisted.as_ref().is_some_and(|p| p.paired)
    }

    pub fn pairing_code(&self) -> Option<&str> {
        self.pairing.as_ref().map(|p| p.0.as_str())
    }

    /// Public addresses only; keys never leave the chip.
    pub fn addresses(&self) -> Option<(String, String)> {
        let w = self.public.filter(|_| self.unlocked)?;
        Some((w.sol_address(), w.evm_address_text()))
    }

    fn window_open(&self, p: &impl Platform) -> bool {
        p.now_ms() < self.pair_window_until
    }

    /// The 60 s lapse of a waiting pairing (a timer in the browser chip), checked on every call.
    pub fn expire(&mut self, p: &impl Platform) {
        if let Some((_, at)) = self.pairing {
            if p.now_ms() >= at + PAIR_TIMEOUT_MS {
                self.drop_pairing_as(pair_end::LAPSED);
            }
        }
    }

    pub fn request_pairing(&mut self, name: &str, p: &mut impl Platform) -> Result<String, Error> {
        self.expire(p);
        if self.persisted.is_none() || !self.unlocked {
            return Err("unlock the cartridge first".into());
        }
        if self.pending.is_some() {
            return Err("a request is already waiting on the Game Boy".into());
        }
        if !self.window_open(p) {
            return Err(if self.paired() {
                "On the Game Boy, open SELECT, then Phone, then Pair new phone.".into()
            } else {
                "Go back to the Game Boy's home screen, where it says \"Pair your phone!\".".into()
            });
        }
        if self.pairing.is_some() {
            return Err("another phone is already asking to pair".into());
        }
        self.pairing_name = clean_name(name);
        let mut b = [0u8; 4];
        p.random(&mut b);
        let code = format!("{:06}", u32::from_le_bytes(b) % 1_000_000);
        self.pairing = Some((code.clone(), p.now_ms()));
        self.pairing_end = pair_end::NONE;
        Ok(code)
    }

    pub fn unpair(&mut self) {
        let Some(per) = self.persisted.as_mut() else { return };
        if !per.paired {
            return;
        }
        per.paired = false;
        per.phone = None;
        let per = per.clone();
        self.store.save(&per);
        self.balances = [None, None];
        self.drop_pending("locked");
    }

    fn drop_pairing(&mut self) {
        self.drop_pairing_as(pair_end::REFUSED);
    }

    fn drop_pairing_as(&mut self, end: u8) {
        if self.pairing.take().is_some() {
            self.pairing_end = end;
        }
    }

    /// What the phone link's STATUS reports.
    pub fn view(&self, p: &impl Platform) -> View<'_> {
        View {
            state: self.state(),
            paired: self.paired(),
            has_pending: self.pending.is_some(),
            pair_window_open: self.window_open(p),
            pairing_code: self.pairing_code(),
            pairing_end: self.pairing_end,
            evm_network: EVM_NETWORKS[self.evm_net].0,
            public: self.public.filter(|_| self.unlocked),
            phone: if self.paired() {
                Some(self.persisted.as_ref().and_then(|p| p.phone.clone()).unwrap_or(Phone { name: "PHONE".into(), id: "----".into(), since_ms: 0 }))
            } else {
                None
            },
        }
    }

    pub fn set_evm_network(&mut self, id: u64) {
        if let Some(i) = net_index(id) {
            self.evm_net = i;
            self.balances[1] = None;
        }
    }

    pub fn set_balance(&mut self, chain: Chain, units: Option<u128>) {
        if self.paired() {
            self.balances[chain as usize] = units;
        }
    }

    /// Status for request `id` only. `state`, `hash` and `reason` come from the phone, so they are checked here.
    pub fn set_tx_status(&mut self, id: u32, state: &str, hash: Option<&str>, reason: Option<&str>) {
        let cur = self.tx_status.clone();
        let Some(state) = TX_STATES.iter().copied().find(|s| *s == state) else { return };
        if id != cur.id || cur.chain.is_none() {
            return;
        }
        if cur.state == "DEMO" || state == "DEMO" {
            return;
        }
        let same_hash = |h: Option<&str>| matches!((h, &cur.hash), (Some(h), Some(c)) if h.to_lowercase() == c.to_lowercase());
        if (state == "CONFIRMED" || state == "BROADCAST") && !same_hash(hash) {
            return;
        }
        if (cur.state == "BROADCAST" || cur.state == "CONFIRMED") && state != "CONFIRMED" && state != "UNKNOWN" {
            return;
        }
        let mut text = String::new();
        if let Some(r) = reason {
            let Some(t) = FAIL_REASON.iter().find(|f| f.0 == r) else { return };
            text = t.1.to_string();
        } else if let Some(h) = hash {
            if !same_hash(Some(h)) {
                return;
            }
            let chars: Vec<char> = h.chars().collect();
            let head: String = chars.iter().take(8).collect();
            let tail: String = chars[chars.len().saturating_sub(8)..].iter().collect();
            text = format!("{head}..{tail}");
        }
        self.tx_status = TxStatus { state, detail: text, ..cur };
    }

    /// Snapshots and decodes the request now; refused with the browser chip's message if it can't be shown in full.
    pub fn request_signature(&mut self, req: &SignRequest, p: &mut impl Platform) -> Result<u32, Error> {
        self.expire(p);
        let Some(public) = self.public.filter(|_| self.unlocked) else {
            return Err("unlock the cartridge first".into());
        };
        if !self.paired() {
            return Err("pair this phone on the Game Boy first".into());
        }
        if self.pending.is_some() || self.pairing.is_some() {
            return Err("a request is already waiting on the Game Boy".into());
        }
        let (snap, shown, chain) = decode_request(req, &public, p.now_ms())?;
        if shown.amount.len() > 36 || shown.fee.len() > 16 || shown.network.len() > 16 || shown.to.len() > 48 {
            return Err("this transaction can't be shown in full on the Game Boy".into());
        }
        let id = self.next_id;
        self.next_id += 1;
        let chain_byte = if matches!(snap, Snap::Sol { .. }) { 0 } else { 1 };
        self.pending = Some(Pending { id, snap, chain_byte, shown });
        self.tx_status = TxStatus { id, chain: Some(chain), state: "", detail: String::new(), hash: None };
        Ok(id)
    }

    /// The phone collects a finished request (signed, refused, or dropped).
    pub fn take_result(&mut self, id: u32) -> Option<SignResult> {
        let i = self.results.iter().position(|r| r.0 == id)?;
        Some(self.results.remove(i).1)
    }

    /// Power cycle: RAM state goes, the stored wallet stays.
    pub fn reset(&mut self) {
        self.vault.reset();
        self.unlocked = false;
        self.wallet = None;
        self.public = None;
        self.last_seq = 0;
        self.pool.zeroize();
        self.balances = [None, None];
        self.drop_pending("power");
        self.drop_pairing();
        self.pair_window_until = 0;
    }

    fn drop_pending(&mut self, reason: &'static str) {
        if let Some(p) = self.pending.take() {
            self.results.push((p.id, SignResult::Refused(reason)));
        }
    }

    fn wipe(&mut self) {
        self.vault.erase();
        self.store.clear();
        self.persisted = None;
        self.wallet = None;
        self.public = None;
        self.unlocked = false;
        self.balances = [None, None];
        self.drop_pending("locked");
        self.drop_pairing();
    }

    fn save(&mut self) {
        if let Some(p) = self.persisted.clone() {
            self.store.save(&p);
        }
    }

    // ------------------------------------------------------------ Game Boy-facing side: once per frame

    pub fn tick(&mut self, m: &mut [u8; 256], p: &mut impl Platform) {
        self.expire(p);
        m[mb::MAGIC] = mb::CHIP_MAGIC;
        m[mb::ACCEL_X] = self.accel.0 as u8;
        m[mb::ACCEL_Y] = self.accel.1 as u8;
        m[mb::PENDING] = if !self.unlocked {
            0
        } else if self.pending.is_some() {
            1
        } else if self.pairing.is_some() {
            2
        } else {
            0
        };
        m[mb::PAIRED] = self.paired() as u8;

        let seq = m[mb::REQ_SEQ];
        if seq == 0 || seq == self.last_seq {
            return;
        }
        self.last_seq = seq;
        let cmd = m[mb::CMD];
        let arg = m[mb::ARG];
        let len = (m[mb::REQ_LEN] as usize).min(mb::REQ_MAX);
        let data: Vec<u8> = m[mb::REQ..mb::REQ + len].to_vec();
        let reply = self.handle(cmd, arg, &data, p).unwrap_or(Reply::st(0xff));
        let n = reply.data.len().min(mb::RESP_MAX);
        for i in 0..mb::RESP_MAX {
            m[mb::RESP + i] = if i < n { reply.data[i] } else { 0 };
        }
        m[mb::RESP_LEN] = n as u8;
        m[mb::STATUS] = reply.status;
        m[mb::RESP_SEQ] = seq; // last, so the Game Boy never reads a half-written reply
    }

    fn handle(&mut self, cmd: u8, arg: u8, data: &[u8], p: &mut impl Platform) -> Result<Reply, Error> {
        Ok(match cmd {
            cmd::PING => Reply::ok([self.state()]),

            cmd::ENTROPY => {
                self.pool = sha(&[&self.pool, data]);
                Reply::ok(&self.pool[..4])
            }

            cmd::CREATE => {
                if self.persisted.is_some() {
                    return Ok(Reply::st(1));
                }
                let mut trng = [0u8; 32];
                p.random(&mut trng);
                let mut mixed = sha(&[&self.pool, &trng]);
                trng.zeroize();
                let mut entropy = [0u8; 16];
                entropy.copy_from_slice(&mixed[..16]);
                mixed.zeroize();
                let mnemonic = entropy_to_mnemonic(&entropy);
                entropy.zeroize();
                self.pool.zeroize();
                let reply = Reply::ok(mnemonic.as_bytes());
                self.wallet = Some(Wallet::from_mnemonic(&mnemonic));
                self.balances = [None, None];
                reply
            }

            cmd::WORDS => {
                if self.persisted.is_some() {
                    return Ok(Reply::st(1));
                }
                let prefix = String::from_utf8_lossy(data).to_lowercase();
                let hits = if prefix.is_empty() { Vec::new() } else { suggest_words(&prefix) };
                let mut out = alloc::vec![hits.len() as u8];
                for (i, w) in hits {
                    out.push((i >> 8) as u8);
                    out.push(i as u8);
                    out.extend_from_slice(w.as_bytes());
                    out.push(0);
                }
                Reply::ok(out)
            }

            cmd::RESTORE => {
                if self.persisted.is_some() || data.len() != 24 {
                    return Ok(Reply::st(1));
                }
                let idx: Vec<u16> = data.chunks(2).map(|c| (c[0] as u16) << 8 | c[1] as u16).collect();
                let Some(mnemonic) = mnemonic_from_indices(&idx) else { return Ok(Reply::st(2)) };
                self.wallet = Some(Wallet::from_mnemonic(&mnemonic));
                self.balances = [None, None];
                Reply::st(0)
            }

            cmd::SET_PIN => {
                let Some(w) = self.wallet.as_ref() else { return Ok(Reply::st(1)) };
                if self.persisted.is_some() || data.len() != 4 || data.iter().any(|&d| d > 9) {
                    return Ok(Reply::st(1));
                }
                let mut salt = [0u8; 16];
                p.random(&mut salt);
                let pin_salt = hex_spaced(&salt);
                let public = Public::of(w);
                let (mnemonic, hash) = if self.vault.soft() {
                    (w.mnemonic.clone(), pin_hash(&pin_salt, data))
                } else {
                    // keys and PIN into the secure element; the words are not kept anywhere
                    self.vault.provision(w, &pin_value(&pin_salt, data))?;
                    (String::new(), String::new())
                };
                self.persisted = Some(Persisted {
                    mnemonic,
                    pin_hash: hash,
                    pin_salt,
                    tries_left: MAX_TRIES,
                    paired: false,
                    phone: None,
                    sol_public: public.sol,
                    evm_address: public.evm,
                });
                self.save();
                if !self.vault.soft() {
                    self.wallet = None; // zeroized on drop
                }
                self.public = Some(public);
                self.unlocked = true;
                Reply::st(0)
            }

            cmd::UNLOCK => {
                let Some(per) = self.persisted.as_mut() else { return Ok(Reply::st(3)) };
                // spend the try before checking, like a secure element: pulling power mid-check can't save a guess
                per.tries_left -= 1;
                let tries = per.tries_left;
                let (salt, hash, public) = (per.pin_salt.clone(), per.pin_hash.clone(), Public { sol: per.sol_public, evm: per.evm_address });
                self.save();
                let ok = if self.vault.soft() {
                    pin_hash(&salt, data) == hash
                } else {
                    // the SE050 compares and counts too: its own limit holds even if this counter were reset
                    self.vault.open(&pin_value(&salt, data))?
                };
                if ok {
                    let per = self.persisted.as_mut().unwrap();
                    per.tries_left = MAX_TRIES;
                    let mnemonic = per.mnemonic.clone();
                    self.save();
                    if self.vault.soft() {
                        let w = Wallet::from_mnemonic(&mnemonic);
                        self.public = Some(Public::of(&w));
                        self.wallet = Some(w);
                    } else {
                        self.public = Some(public);
                    }
                    self.unlocked = true;
                    return Ok(Reply::st(0));
                }
                if tries <= 0 {
                    self.wipe();
                    return Ok(Reply::st(2));
                }
                Reply { status: 1, data: alloc::vec![tries as u8] }
            }

            cmd::PAIR => {
                let Some((code, _)) = self.pairing.clone() else { return Ok(Reply::st(1)) };
                if !self.unlocked || self.persisted.is_none() {
                    return Ok(Reply::st(1));
                }
                if arg == 0 {
                    return Ok(Reply::ok(format!("{code}\0")));
                }
                if arg != 1 && arg != 2 {
                    return Ok(Reply::st(1));
                }
                let shown: String = data.iter().take(6).map(|&b| b as char).collect();
                if arg == 1 && shown != code {
                    return Ok(Reply::st(1));
                }
                self.pairing = None;
                if arg == 1 {
                    let mut idb = [0u8; 2];
                    p.random(&mut idb);
                    let phone = Phone { name: self.pairing_name.clone(), id: hex_spaced(&idb).replace(' ', "").to_uppercase(), since_ms: p.now_ms() };
                    let per = self.persisted.as_mut().unwrap();
                    per.paired = true;
                    per.phone = Some(phone);
                    self.save();
                }
                self.pairing_end = if arg == 1 { pair_end::ACCEPTED } else { pair_end::REFUSED };
                self.pair_window_until = 0;
                Reply::st(0)
            }

            cmd::PHONE => {
                if !self.unlocked || self.persisted.is_none() {
                    return Ok(Reply::st(1));
                }
                match arg {
                    0 => {
                        if !self.paired() {
                            return Ok(Reply::st(1));
                        }
                        let ph = self.persisted.as_ref().and_then(|p| p.phone.clone()).unwrap_or(Phone { name: "PHONE".into(), id: "----".into(), since_ms: 0 });
                        Reply::ok(ascii(&format!("{}\0{}\0{}\0", ph.name, ph.id, short_date(ph.since_ms))))
                    }
                    1 => {
                        let per = self.persisted.as_mut().unwrap();
                        per.paired = false;
                        per.phone = None;
                        self.save();
                        self.balances = [None, None];
                        self.drop_pairing();
                        self.drop_pending("locked");
                        self.pair_window_until = 0;
                        Reply::st(0)
                    }
                    2 | 3 => {
                        self.pair_window_until = if arg == 2 { p.now_ms() + 60_000 } else { 0 };
                        if arg == 3 {
                            self.drop_pairing();
                        }
                        Reply::st(0)
                    }
                    _ => Reply::st(1),
                }
            }

            cmd::NETWORK => {
                if !self.unlocked || (arg != 1 && arg != 2) {
                    return Ok(Reply::st(1));
                }
                let n = EVM_NETWORKS.len();
                let next = (self.evm_net + if arg == 1 { 1 } else { n - 1 }) % n;
                self.set_evm_network(EVM_NETWORKS[next].0);
                self.network_changed = Some(EVM_NETWORKS[next].0);
                Reply::st(0)
            }

            cmd::ACCOUNT => {
                let Some((sol_a, evm_a)) = self.addresses() else { return Ok(Reply::st(1)) };
                let net = EVM_NETWORKS[self.evm_net];
                let text = if arg == 0 {
                    format!("{sol_a}\0{}\0Solana\0", balance_text(self.balances[0], 9, "SOL"))
                } else {
                    format!("{evm_a}\0{}\0{}\0", balance_text(self.balances[1], 18, net.3), net.1)
                };
                Reply::ok(ascii(&text))
            }

            cmd::PENDING => {
                let Some(pe) = self.pending.as_ref().filter(|_| self.unlocked && self.paired()) else { return Ok(Reply::st(1)) };
                let s = &pe.shown;
                let mut out = alloc::vec![pe.chain_byte];
                out.extend(ascii(&format!("{}\0{}\0{}\0{}\0", s.to, s.amount, s.fee, s.network)));
                Reply::ok(out)
            }

            cmd::SIGN => {
                if !self.unlocked || self.public.is_none() || self.pending.is_none() {
                    return Ok(Reply::st(1));
                }
                let pe = self.pending.take().unwrap();
                if !self.paired() {
                    self.results.push((pe.id, SignResult::Refused("locked")));
                    return Ok(Reply::st(1));
                }
                if arg != 1 {
                    self.results.push((pe.id, SignResult::Refused("rejected")));
                    return Ok(Reply::st(0));
                }
                self.sign(pe)
            }

            cmd::QR => {
                let Some((sol_a, evm_a)) = self.addresses() else { return Ok(Reply::st(1)) };
                let a = if arg == 0 { sol_a } else { evm_a };
                Reply::ok(qr::qr_bits(a.as_bytes()).ok_or("QR too big for the screen")?)
            }

            cmd::TXSTATUS => Reply::ok(ascii(&format!("{}\0{}\0", self.tx_status.state, self.tx_status.detail))),

            cmd::LOCK => {
                self.vault.close();
                self.unlocked = false;
                self.wallet = None;
                self.public = None;
                self.balances = [None, None];
                self.drop_pending("locked");
                self.drop_pairing();
                self.pair_window_until = 0;
                Reply::st(0)
            }

            cmd::WIPE => {
                if !self.unlocked {
                    return Ok(Reply::st(1));
                }
                self.wipe();
                Reply::st(0)
            }

            _ => Reply::st(0xff),
        })
    }

    /// Signs the snapshot taken at request time.
    fn sign(&mut self, pe: Pending) -> Reply {
        match self.sign_with_vault(&pe) {
            Ok(reply) => reply,
            Err(_) => {
                // the browser chip's catch: nothing was signed, the phone hears "error"
                self.results.push((pe.id, SignResult::Refused("error")));
                Reply::st(1)
            }
        }
    }

    /// Signs the snapshot through the vault (RAM keys or the SE050 session).
    fn sign_with_vault(&mut self, pe: &Pending) -> Result<Reply, Error> {
        let public = self.public.ok_or("locked")?;
        let (result, hash) = match &pe.snap {
            Snap::Sol { message, signers } => {
                let sig = self.vault.sign_ed25519(self.wallet.as_ref(), message)?;
                (SignResult::Sol(sol::signed_transaction(*signers, &sig, message)), bs58::encode(sig).into_string())
            }
            Snap::Evm(tx) => {
                let digest = tx.signing_hash();
                let (r, s) = self.vault.sign_secp256k1(self.wallet.as_ref(), &digest)?;
                let (sig, odd) = eth::normalize(&digest, &r, &s, &public.evm).ok_or("the signature doesn't match this wallet")?;
                let signed = tx.encode_signed(&sig, odd);
                let h = format!("0x{}", eth::hex_lower(&eth::keccak(&signed)));
                (SignResult::Evm(signed), h)
            }
            Snap::Swap { src_sol, digest } => {
                let signature = if *src_sol {
                    bs58::encode(self.vault.sign_ed25519(self.wallet.as_ref(), digest)?).into_string()
                } else {
                    let h = eth::personal_hash(digest);
                    let (r, s) = self.vault.sign_secp256k1(self.wallet.as_ref(), &h)?;
                    let (sig, odd) = eth::normalize(&h, &r, &s, &public.evm).ok_or("the signature doesn't match this wallet")?;
                    let mut out = sig.to_vec();
                    out.push(27 + odd as u8);
                    format!("0x{}", eth::hex_lower(&out))
                };
                self.results.push((pe.id, SignResult::Swap { signature, digest: eth::hex_lower(digest) }));
                // demo build: nothing is broadcast, and the Game Boy says so instead of waiting for a network
                let chain = self.tx_status.chain;
                self.tx_status = TxStatus { id: pe.id, chain, state: "DEMO", detail: SWAP_DEMO_NOTE.to_string(), hash: None };
                return Ok(Reply::st(0));
            }
        };
        self.results.push((pe.id, result));
        let chain = if pe.chain_byte == 0 { Chain::Sol } else { Chain::Evm };
        self.tx_status = TxStatus { id: pe.id, chain: Some(chain), state: "SIGNED", detail: String::new(), hash: Some(hash) };
        Ok(Reply::st(0))
    }
}

/// Freezes the request into bytes the chip owns and decodes those; anything the Game Boy can't show is refused.
fn decode_request(req: &SignRequest, w: &Public, now_ms: u64) -> Result<(Snap, Shown, Chain), Error> {
    match req {
        SignRequest::Sol(message) => {
            let m = sol::Message::parse(message)?;
            let (to, lamports) = sol::plain_transfer(&m, &w.sol)?;
            let shown = Shown {
                to: bs58::encode(to).into_string(),
                amount: format!("{} SOL", exact(lamports as u128, 9)?),
                fee: format!("{} SOL", exact(SOL_FEE_PER_SIGNATURE * m.num_required_signatures as u128, 9)?),
                network: "SOLANA".to_string(),
            };
            Ok((Snap::Sol { message: message.clone(), signers: m.num_required_signatures }, shown, Chain::Sol))
        }
        SignRequest::Evm(wire) => {
            let tx = eth::Tx1559::parse_unsigned(wire).ok_or("could not read the transaction")?;
            if tx.max_fee_per_gas == 0 {
                return Err("the transaction has no fee set".into());
            }
            let net = net_index(tx.chain_id).map(|i| EVM_NETWORKS[i]).ok_or("this cartridge doesn't sign on that network")?;
            let to = tx.to.ok_or("contract deployment is not supported")?;
            if !tx.data.is_empty() {
                return Err("only plain transfers can be shown on the Game Boy yet".into());
            }
            if tx.access_list_len > 0 {
                return Err("access lists are not supported".into());
            }
            if tx.gas < PLAIN_TRANSFER_GAS || tx.gas > MAX_TRANSFER_GAS {
                return Err("that gas limit doesn't fit a plain transfer".into());
            }
            let max_fee = tx.gas.checked_mul(tx.max_fee_per_gas).unwrap_or(u128::MAX);
            if max_fee > MAX_EVM_FEE_WEI {
                return Err(format!("the fee is above the cartridge's 0.01 {} limit", net.3).into());
            }
            let places = 6.min(9 - net.3.len() as u32);
            let shown = Shown {
                to: eth::checksum_address(&to),
                amount: format!("{} {}", exact(tx.value, 18)?, net.3),
                fee: format!("MAX {} {}", ceil_decimals(max_fee, 18, places).ok_or("bad fee")?, net.3),
                network: net.2.to_string(),
            };
            Ok((Snap::Evm(tx), shown, Chain::Evm))
        }
        SignRequest::Swap(i) => decode_swap(i, w, now_ms),
    }
}

/// Checks a swap field by field (the phone is untrusted) and lays it out for the sign screen.
fn decode_swap(i: &SwapRequest, w: &Public, now_ms: u64) -> Result<(Snap, Shown, Chain), Error> {
    let (Some(src_key), Some(dst_key)) = (sodax_chain(i.src), sodax_chain(i.dst)) else {
        return Err("this cartridge doesn't swap on that network".into());
    };
    let (Some(sell), Some(get)) = (chip_token(src_key, &i.sell_token), chip_token(dst_key, &i.buy_token)) else {
        return Err("this cartridge doesn't know that token".into());
    };
    if src_key == dst_key && i.sell_token.to_lowercase() == i.buy_token.to_lowercase() {
        return Err("that swap goes nowhere".into());
    }
    if i.sell_amount == 0 || i.min_receive == 0 {
        return Err("bad amounts".into());
    }
    let dl = i.deadline as i128 * 1000;
    if !(dl > now_ms as i128 && dl < now_ms as i128 + 3_600_000) {
        return Err("the quote has expired".into());
    }
    let partner_fee = i.sell_amount.checked_mul(PARTNER_FEE_BPS).ok_or("bad amounts")? / 10_000;
    let fees = partner_fee + i.sell_amount.checked_mul(SOLVER_FEE_BPS).ok_or("bad amounts")? / 10_000;
    if fees >= i.sell_amount {
        return Err("bad amounts".into());
    }
    let from = side_name(i.src)?;
    let to = side_name(i.dst)?;
    let sym = sell.0.to_uppercase();
    let buy = get.0.to_uppercase();
    let width = |s: &str| (16i32 - s.len() as i32 - 1).max(0) as usize;
    let line = |t: &str| format!("{t:<16}");
    let min = fit_floor(i.min_receive, get.1, width(&buy))?;
    let fee = fit_ceil(fees, sell.1, width(&sym))?;
    let amount = format!("{} {sym}", exact(i.sell_amount, sell.1)?);
    let recipient = if i.dst == 0 { w.sol_address() } else { w.evm_address_text() };
    let canonical = [
        "kagiboy-swap-v2".to_string(),
        src_key.to_string(),
        i.sell_token.clone(),
        sell.1.to_string(),
        i.sell_amount.to_string(),
        dst_key.to_string(),
        i.buy_token.clone(),
        get.1.to_string(),
        i.min_receive.to_string(),
        fees.to_string(),
        PARTNER_FEE_BPS.to_string(),
        PARTNER_WALLET.to_string(),
        i.deadline.to_string(),
        recipient,
    ]
    .join("|");
    let digest = sha(&[&ascii(&canonical)]);
    let shown = Shown {
        network: format!("SWAP {from}"),
        amount,
        fee: format!("{fee} {sym}"),
        to: format!("{}{}{}", line("GET AT LEAST"), line(&format!("{min} {buy}")), line(&format!("ON {to}"))),
    };
    let chain = if i.src == 0 { Chain::Sol } else { Chain::Evm };
    Ok((Snap::Swap { src_sol: i.src == 0, digest }, shown, chain))
}
