//! Where the wallet's keys and PIN live.
//!
//! - `SoftVault`: the browser chip's model. The recovery words and a salted PIN hash sit in the chip's store and the
//!   keys are derived into RAM on unlock. It's what the browser demo does, and it keeps the recorded sessions
//!   reproducible.
//! - `Se050Vault`: the cartridge. At setup the two account keys are imported into the SE050 as sign-only objects and
//!   the PIN becomes an SE050 UserID with five attempts; the words are not kept anywhere. A key signs only inside a
//!   session opened with that PIN, so firmware that skipped its own checks still couldn't use it.

use alloc::vec::Vec;

use sha2::{Digest, Sha256};

use crate::keys::Wallet;
use crate::se050::{self, I2c, Se050, SeError, Session};
use crate::Error;

/// What the chip asks of a vault. `wallet` is the chip's in-RAM wallet when it has one (always for `SoftVault`, only
/// between CREATE/RESTORE and SET_PIN for a secure element).
pub trait Vault {
    /// true: the keys stay in the chip's store (browser model); false: a secure element holds keys and PIN.
    fn soft(&self) -> bool;
    /// SET_PIN on a new wallet: take the keys and the PIN value.
    fn provision(&mut self, _w: &Wallet, _pin_value: &[u8; 16]) -> Result<(), Error> {
        Ok(())
    }
    /// UNLOCK with a secure element: open the PIN session; Ok(false) is a wrong PIN.
    fn open(&mut self, _pin_value: &[u8; 16]) -> Result<bool, Error> {
        Ok(false)
    }
    /// LOCK: close the session.
    fn close(&mut self) {}
    /// Power cycle: a session is gone without saying so.
    fn reset(&mut self) {}
    /// Wipe: destroy the keys and the PIN.
    fn erase(&mut self) {}
    fn sign_ed25519(&mut self, wallet: Option<&Wallet>, msg: &[u8]) -> Result<[u8; 64], Error>;
    /// (r, s) over a 32-byte digest, in any form (the chip normalises S and finds the parity).
    fn sign_secp256k1(&mut self, wallet: Option<&Wallet>, digest: &[u8; 32]) -> Result<([u8; 32], [u8; 32]), Error>;
}

/// The value the PIN becomes on the SE050: 16 bytes of SHA-256 over a per-wallet salt and the digits, so the digits
/// never cross the I2C bus as such.
pub fn pin_value(salt: &str, pin: &[u8]) -> [u8; 16] {
    let mut h = Sha256::new();
    h.update(b"kagiboy-pin-v1|");
    h.update(salt.as_bytes());
    h.update(b"|");
    h.update(pin);
    let d = h.finalize();
    let mut v = [0u8; 16];
    v.copy_from_slice(&d[..16]);
    v
}

pub struct SoftVault;

impl Vault for SoftVault {
    fn soft(&self) -> bool {
        true
    }
    fn sign_ed25519(&mut self, wallet: Option<&Wallet>, msg: &[u8]) -> Result<[u8; 64], Error> {
        use ed25519_dalek::Signer;
        let w = wallet.ok_or("locked")?;
        Ok(ed25519_dalek::SigningKey::from_bytes(&w.sol_secret).sign(msg).to_bytes())
    }
    fn sign_secp256k1(&mut self, wallet: Option<&Wallet>, digest: &[u8; 32]) -> Result<([u8; 32], [u8; 32]), Error> {
        let w = wallet.ok_or("locked")?;
        let (sig, _) = crate::eth::sign_prehash(&w.evm_secret, digest);
        let b = sig.to_bytes();
        Ok((b[..32].try_into().unwrap(), b[32..].try_into().unwrap()))
    }
}

/// Object identifiers on the SE050 ("KG" range, clear of NXP's reserved 0x7FFF0xxx).
pub const PIN_ID: u32 = 0x4b47_0001;
pub const SOL_KEY_ID: u32 = 0x4b47_0010;
pub const EVM_KEY_ID: u32 = 0x4b47_0011;
pub const MAX_PIN_ATTEMPTS: u16 = 5;

/// Key policy: the PIN's user may sign, read the public key and delete; everyone else may only read and delete
/// (so a locked-out cartridge can still be wiped, and nothing signs without the PIN).
pub fn key_policy() -> Vec<u8> {
    se050::policy(&[
        (PIN_ID, se050::POLICY_ALLOW_SIGN | se050::POLICY_ALLOW_READ | se050::POLICY_ALLOW_DELETE),
        (0, se050::POLICY_ALLOW_READ | se050::POLICY_ALLOW_DELETE),
    ])
}

/// PIN policy: nobody may rewrite it; anyone may delete it (wipe).
pub fn pin_policy() -> Vec<u8> {
    se050::policy(&[(0, se050::POLICY_ALLOW_DELETE)])
}

pub struct Se050Vault<B: I2c> {
    pub se: Se050<B>,
    session: Option<Session>,
    ready: bool,
}

fn se_err(e: SeError) -> Error {
    Error(alloc::format!("secure element: {e:?}"))
}

impl<B: I2c> Se050Vault<B> {
    pub fn new(bus: B) -> Self {
        Se050Vault { se: Se050::new(bus), session: None, ready: false }
    }

    fn ensure(&mut self) -> Result<(), Error> {
        if !self.ready {
            self.se.init().map_err(se_err)?;
            self.ready = true;
        }
        Ok(())
    }

    fn delete_ours(&mut self) -> Result<(), SeError> {
        for id in [SOL_KEY_ID, EVM_KEY_ID, PIN_ID] {
            if self.se.exists(id)? {
                self.se.delete(id)?;
            }
        }
        Ok(())
    }
}

impl<B: I2c> Vault for Se050Vault<B> {
    fn soft(&self) -> bool {
        false
    }

    fn provision(&mut self, w: &Wallet, pin_value: &[u8; 16]) -> Result<(), Error> {
        self.ensure()?;
        self.session = None;
        self.delete_ours().map_err(se_err)?;
        self.se.create_secp256k1().map_err(se_err)?;
        let mut sol_pub = w.sol_public;
        sol_pub.reverse(); // Edwards public keys go in big-endian (AN12413 7.1)
        self.se.write_ec_key_pair(SOL_KEY_ID, se050::CURVE_ED25519, &w.sol_secret, &sol_pub, &key_policy()).map_err(se_err)?;
        let evm_pub = k256::ecdsa::SigningKey::from_slice(&w.evm_secret)
            .map_err(|_| Error::from("bad key"))?
            .verifying_key()
            .to_encoded_point(false);
        self.se.write_ec_key_pair(EVM_KEY_ID, se050::CURVE_SECP256K1, &w.evm_secret, evm_pub.as_bytes(), &key_policy()).map_err(se_err)?;
        self.se.write_user_id(PIN_ID, pin_value, MAX_PIN_ATTEMPTS, &pin_policy()).map_err(se_err)?;
        // the new owner is logged in, as the browser chip is after SET_PIN
        let opened = self.open(pin_value)?;
        if !opened {
            return Err("secure element: the new PIN didn't open a session".into());
        }
        Ok(())
    }

    fn open(&mut self, pin_value: &[u8; 16]) -> Result<bool, Error> {
        self.ensure()?;
        self.session = None;
        let s = self.se.create_session(PIN_ID).map_err(se_err)?;
        match self.se.verify_user_id(&s, pin_value) {
            Ok(()) => {
                self.session = Some(s);
                Ok(true)
            }
            Err(SeError::Status(se050::SW_CONDITIONS_NOT_SATISFIED)) => Ok(false),
            Err(e) => Err(se_err(e)),
        }
    }

    fn close(&mut self) {
        if let Some(s) = self.session.take() {
            let _ = self.se.close_session(&s);
        }
    }

    fn reset(&mut self) {
        self.session = None;
        self.ready = false;
    }

    fn erase(&mut self) {
        self.close();
        if self.ensure().is_ok() {
            let _ = self.delete_ours();
        }
    }

    fn sign_ed25519(&mut self, _wallet: Option<&Wallet>, msg: &[u8]) -> Result<[u8; 64], Error> {
        let s = self.session.ok_or("locked")?;
        self.se.eddsa_sign(Some(&s), SOL_KEY_ID, msg).map_err(se_err)
    }

    fn sign_secp256k1(&mut self, _wallet: Option<&Wallet>, digest: &[u8; 32]) -> Result<([u8; 32], [u8; 32]), Error> {
        let s = self.session.ok_or("locked")?;
        self.se.ecdsa_sign(Some(&s), EVM_KEY_ID, digest).map_err(se_err)
    }
}
