//! kagiboy cartridge firmware (RP2350B on the hardware/cart board).
//!
//! The Game Boy bus is served without the CPU in the loop, exactly as hardware/sim validated it:
//! - `gb_read` (PIO0 SM0) looks every ROM read up in the 32 KB ROM image in SRAM through two chained DMA channels
//!   (address word -> the byte at that address -> back to the state machine) and drives D0-D7 in time;
//! - `gb_write` (PIO0 SM1) captures every write cycle (/RD high; the board has no /WR) and a third DMA channel
//!   streams the samples into a ring in SRAM, so nothing is lost while the CPU is busy signing or writing flash.
//! The CPU drains the ring into the Game Boy's half of the mailbox and runs the wallet (`kagiboy-core`), whose
//! replies appear in the ROM window at 0x7F00 for the next Game Boy read.
//!
//! Keys and PIN live in the SE050 (I2C1 on GPIO6/7, enable on GPIO10) through `Se050Vault`; the flash record holds
//! no secret. The phone reaches the wallet through the ESP32-C3 (Bluetooth), which offers its messages on SPI0
//! (GPIO0 MISO, GPIO2 SCK, GPIO3 MOSI, CS GPIO46): `link::LinkMaster` polls it every millisecond and
//! `phone::PhoneServer` answers (docs/phone-link.md). The LIS3DH (I2C0 on GPIO8/9) is read at 100 Hz into the
//! mailbox's ACCEL_X / ACCEL_Y, which the ROM turns into shake entropy.
#![no_std]
#![no_main]

extern crate alloc;

use core::ptr::{addr_of, addr_of_mut};

use defmt::{info, warn};
use embassy_executor::Spawner;
use embassy_rp::block::ImageDef;
use embassy_rp::flash::{Blocking, Flash};
use embassy_rp::gpio::{Level, Output};
use embassy_rp::pac;
use embassy_rp::pac::dma::vals::{DataSize, TransCountMode, TreqSel};
use embassy_rp::i2c::{self, I2c};
use embassy_rp::peripherals::{FLASH, I2C0, I2C1, PIO0, SPI0, TRNG};
use embassy_rp::spi::{self, Spi};
use embassy_rp::pio::{Config as PioConfig, Direction, FifoJoin, InterruptHandler, Pio, ShiftConfig, ShiftDirection};
use embassy_rp::trng::Trng;
use embassy_rp::{bind_interrupts, trng};
use embassy_time::{Instant, Timer};
use kagiboy_core::bus::Mailbox;
use kagiboy_core::lis3dh::{self, Lis3dh};
use kagiboy_core::link::{LinkMaster, MAX_XFER};
use kagiboy_core::phone::PhoneServer;
use kagiboy_core::vault::Se050Vault;
use kagiboy_core::{persist, se050, Chip, Persisted, Platform, Store};
use {defmt_rtt as _, panic_probe as _};

#[unsafe(link_section = ".start_block")]
#[used]
pub static IMAGE_DEF: ImageDef = ImageDef::secure_exe();

#[global_allocator]
static HEAP: embedded_alloc::LlffHeap = embedded_alloc::LlffHeap::empty();

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
    TRNG_IRQ => trng::InterruptHandler<TRNG>;
});

/// The wallet ROM as the Game Boy sees it, mailbox window at 0x7F00. 32 KB aligned: `gb_read` forms each DMA
/// address as (Y << 15) | A0-A14.
#[repr(C, align(32768))]
struct Image([u8; 0x8000]);
static mut IMAGE: Image = Image([0; 0x8000]); // filled at boot (zero-init keeps it out of flash)

/// Captured write cycles, written by DMA as a 32 KB ring (8192 samples, about a second of the busiest traffic).
#[repr(C, align(32768))]
struct Ring([u32; RING_LEN]);
const RING_LEN: usize = 8192;
static mut RING: Ring = Ring([0; RING_LEN]);

static ROM: &[u8] = include_bytes!(env!("KAGIBOY_ROM"));

const FLASH_SIZE: usize = 16 * 1024 * 1024;
/// The last 4 KB sector holds the stored wallet.
const STORE_AT: u32 = (FLASH_SIZE - embassy_rp::flash::ERASE_SIZE) as u32;

/// Relative to the PIO block's GPIOBASE = 16 (bus pins are GPIO16-43).
const PIO_PIN_RD: u8 = 2;

// DMA channels used by the bus
const CH_ADDR: usize = 0;
const CH_DATA: usize = 1;
const CH_RING: usize = 2;

/// The SE050 on I2C1. The enable line is held high while the wallet may need it (Deep Power-down when low).
struct SeBus<'d> {
    i2c: I2c<'d, I2C1, i2c::Blocking>,
    _ena: Output<'d>,
}

impl se050::I2c for SeBus<'_> {
    fn write(&mut self, addr: u8, bytes: &[u8]) -> Result<(), ()> {
        self.i2c.blocking_write(addr, bytes).map_err(|_| ())
    }
    fn read(&mut self, addr: u8, buf: &mut [u8]) -> Result<(), ()> {
        self.i2c.blocking_read(addr, buf).map_err(|_| ())
    }
    fn delay_ms(&mut self, ms: u32) {
        embassy_time::block_for(embassy_time::Duration::from_millis(ms as u64));
    }
}

/// The LIS3DH on I2C0 (its own bus: a stuck accelerometer can't hold up the SE050).
struct AccelBus<'d>(I2c<'d, I2C0, i2c::Blocking>);

impl lis3dh::Bus for AccelBus<'_> {
    fn write(&mut self, bytes: &[u8]) -> bool {
        self.0.blocking_write(lis3dh::ADDR, bytes).is_ok()
    }
    fn write_read(&mut self, w: &[u8], r: &mut [u8]) -> bool {
        self.0.blocking_write_read(lis3dh::ADDR, w, r).is_ok()
    }
}

/// The wallet record in the last flash sector (`kagiboy_core::persist`): with the SE050 vault it holds no secret.
struct FlashStore<'d> {
    flash: Flash<'d, FLASH, Blocking, FLASH_SIZE>,
}

impl Store for FlashStore<'_> {
    fn load(&mut self) -> Option<Persisted> {
        let mut buf = alloc::vec![0u8; 1024];
        self.flash.blocking_read(STORE_AT, &mut buf).ok()?;
        persist::decode(&buf)
    }
    fn save(&mut self, p: &Persisted) {
        let mut bytes = persist::encode(p);
        bytes.resize(bytes.len().next_multiple_of(256), 0xff);
        if self.flash.blocking_erase(STORE_AT, STORE_AT + embassy_rp::flash::ERASE_SIZE as u32).is_err()
            || self.flash.blocking_write(STORE_AT, &bytes).is_err()
        {
            warn!("wallet store: flash write failed");
        }
    }
    fn clear(&mut self) {
        let _ = self.flash.blocking_erase(STORE_AT, STORE_AT + embassy_rp::flash::ERASE_SIZE as u32);
    }
}

/// The hardware TRNG, and time: uptime plus the wall clock the phone tells us (the board has no RTC).
struct Hw<'d> {
    trng: Trng<'d, TRNG>,
    epoch_at_boot_ms: u64,
}

impl Platform for Hw<'_> {
    fn random(&mut self, buf: &mut [u8]) {
        self.trng.blocking_fill_bytes(buf);
    }
    fn now_ms(&self) -> u64 {
        self.epoch_at_boot_ms + Instant::now().as_millis()
    }
    fn set_now_ms(&mut self, ms: u64) {
        self.epoch_at_boot_ms = ms.saturating_sub(Instant::now().as_millis());
    }
}

/// The ESP32-C3 on SPI0: mode 0, MSB first, 8 MHz, chip select by hand (GPIO46, idle high).
struct Radio<'d> {
    spi: Spi<'d, SPI0, spi::Blocking>,
    cs: Output<'d>,
    master: LinkMaster,
    server: PhoneServer,
    tx: [u8; MAX_XFER],
    rx: [u8; MAX_XFER],
}

impl Radio<'_> {
    /// One transaction, and another right after it if a fetch or a reply is due (CS high >= 100 us between).
    async fn poll<S: Store, V: kagiboy_core::vault::Vault>(&mut self, chip: &mut Chip<S, V>, hw: &mut Hw<'_>) {
        for _ in 0..3 {
            let now = Instant::now().as_millis();
            let n = self.master.next(now, &mut self.tx);
            self.cs.set_low();
            let ok = self.spi.blocking_transfer(&mut self.rx[..n], &self.tx[..n]).is_ok();
            self.cs.set_high();
            if !ok {
                self.rx[..n].fill(0);
            }
            if let Some((seq, msg)) = self.master.done(now, &self.rx[..n]) {
                let rep = self.server.handle(chip, &msg, hw);
                self.master.reply(Instant::now().as_millis(), seq, &rep);
            }
            if !self.master.more() {
                break;
            }
            Timer::after_micros(100).await;
        }
    }
}

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    {
        const HEAP_SIZE: usize = 96 * 1024;
        static mut HEAP_MEM: [core::mem::MaybeUninit<u8>; HEAP_SIZE] = [core::mem::MaybeUninit::uninit(); HEAP_SIZE];
        unsafe { HEAP.init(addr_of_mut!(HEAP_MEM) as usize, HEAP_SIZE) }
    }
    let p = embassy_rp::init(Default::default()); // 150 MHz: the clock the bus timing was validated at

    // Hold the Game Boy in reset until the bus is served; the boot ROM reads the cartridge header immediately.
    let mut gb_reset = Output::new(p.PIN_45, Level::High);
    let _bus_enable = Output::new(p.PIN_44, Level::High); // TXB0108 OE
    let esp_cs = Output::new(p.PIN_46, Level::High); // ESP32-C3 chip select idles high (no pull-up on the board)

    let image = unsafe { &mut *addr_of_mut!(IMAGE.0) };
    image.fill(0xff);
    image[..ROM.len()].copy_from_slice(ROM);
    image[kagiboy_core::bus::ROM_WINDOW..].fill(0);

    // ---- PIO0: GPIO16-43 (CLK 17, /RD 18, /CS 19, A0-A15 20-35, D0-D7 36-43) ----
    let Pio { mut common, sm0: mut rd, sm1: mut wr, .. } = Pio::new(p.PIO0, Irqs);
    let read_prog = embassy_rp::pio::program::pio_file!("pio/gb_read.pio");
    let write_prog = embassy_rp::pio::program::pio_file!("pio/gb_write.pio");
    let read_loaded = common.load_program(&read_prog.program);
    let write_loaded = common.load_program(&write_prog.program);

    let pins = [
        common.make_pio_pin(p.PIN_16), common.make_pio_pin(p.PIN_17), common.make_pio_pin(p.PIN_18),
        common.make_pio_pin(p.PIN_19), common.make_pio_pin(p.PIN_20), common.make_pio_pin(p.PIN_21),
        common.make_pio_pin(p.PIN_22), common.make_pio_pin(p.PIN_23), common.make_pio_pin(p.PIN_24),
        common.make_pio_pin(p.PIN_25), common.make_pio_pin(p.PIN_26), common.make_pio_pin(p.PIN_27),
        common.make_pio_pin(p.PIN_28), common.make_pio_pin(p.PIN_29), common.make_pio_pin(p.PIN_30),
        common.make_pio_pin(p.PIN_31), common.make_pio_pin(p.PIN_32), common.make_pio_pin(p.PIN_33),
        common.make_pio_pin(p.PIN_34), common.make_pio_pin(p.PIN_35), common.make_pio_pin(p.PIN_36),
        common.make_pio_pin(p.PIN_37), common.make_pio_pin(p.PIN_38), common.make_pio_pin(p.PIN_39),
        common.make_pio_pin(p.PIN_40), common.make_pio_pin(p.PIN_41), common.make_pio_pin(p.PIN_42),
        common.make_pio_pin(p.PIN_43),
    ];
    let gpio = |n: usize| &pins[n - 16];
    let address: [_; 16] = core::array::from_fn(|i| gpio(20 + i));
    let data: [_; 8] = core::array::from_fn(|i| gpio(36 + i));
    let all: [_; 28] = core::array::from_fn(|i| &pins[i]);

    // gb_read: A0-A15 in (all 16 counted: RP2350's IN_COUNT masks the rest, and the program reads A15), D0-D7 out
    let mut cfg = PioConfig::default();
    cfg.use_program(&read_loaded, &[]);
    cfg.set_in_pins(&address);
    cfg.set_out_pins(&data);
    cfg.shift_in = ShiftConfig { threshold: 32, direction: ShiftDirection::Left, auto_fill: true };
    cfg.shift_out = ShiftConfig { threshold: 32, direction: ShiftDirection::Right, auto_fill: false };
    rd.set_config(&cfg);
    set_jmp_pin(0);
    rd.set_pin_dirs(Direction::In, &all);

    // gb_write: all 28 pins in, samples to the RX FIFO (joined, 8 deep)
    let mut wcfg = PioConfig::default();
    wcfg.use_program(&write_loaded, &[]);
    wcfg.set_in_pins(&all);
    wcfg.shift_in = ShiftConfig { threshold: 28, direction: ShiftDirection::Right, auto_fill: true };
    wcfg.fifo_join = FifoJoin::RxOnly;
    wr.set_config(&wcfg);
    set_jmp_pin(1);

    // Y = the image's address >> 15, so (Y << 15) | A0-A14 is the byte's address in SRAM
    let image_base = image.as_ptr() as u32;
    rd.tx().push(image_base >> 15);
    unsafe {
        rd.exec_instr(pio::InstructionOperands::PULL { if_empty: false, block: true }.encode());
        rd.exec_instr(
            pio::InstructionOperands::MOV {
                destination: pio::MovDestination::Y,
                op: pio::MovOperation::None,
                source: pio::MovSource::OSR,
            }
            .encode(),
        );
    }

    let ring_base = unsafe { addr_of!(RING.0) } as u32;
    start_dma(image_base, ring_base);
    rd.set_enable(true);
    wr.set_enable(true);
    info!("bus served from SRAM at {:x}, write ring at {:x}", image_base, ring_base);

    // SE050: enable, let it boot, then the vault opens T=1 and selects the applet on first use
    let se_ena = Output::new(p.PIN_10, Level::High);
    Timer::after_millis(10).await;
    let mut i2c_cfg = i2c::Config::default();
    i2c_cfg.frequency = 1_000_000; // Fm+; the board's 2.2k pull-ups (R133/R134) are sized for it
    i2c_cfg.sda_pullup = false;
    i2c_cfg.scl_pullup = false;
    let se_bus = SeBus { i2c: I2c::new_blocking(p.I2C1, p.PIN_7, p.PIN_6, i2c_cfg), _ena: se_ena };
    let mut chip = Chip::with_vault(FlashStore { flash: Flash::new_blocking(p.FLASH) }, Se050Vault::new(se_bus));
    let mut hw = Hw { trng: Trng::new(p.TRNG, Irqs, trng::Config::default()), epoch_at_boot_ms: 0 };
    let mut mailbox = Mailbox::default();
    mailbox.service(&mut chip, &mut hw, image); // presence byte and status before the first read

    // the ESP32-C3 link; its chip select (GPIO46) has been driven high since the bus setup
    let mut spi_cfg = spi::Config::default();
    spi_cfg.frequency = 8_000_000;
    spi_cfg.phase = spi::Phase::CaptureOnFirstTransition;
    spi_cfg.polarity = spi::Polarity::IdleLow;
    let mut session = [0u8; 1];
    hw.random(&mut session);
    let mut radio = Radio {
        spi: Spi::new_blocking(p.SPI0, p.PIN_2, p.PIN_3, p.PIN_0, spi_cfg),
        cs: esp_cs,
        master: LinkMaster::new(session[0]),
        server: PhoneServer::new(),
        tx: [0; MAX_XFER],
        rx: [0; MAX_XFER],
    };

    // the accelerometer: 400 kHz, the board's 4.7k pull-ups (R136/R137); if it doesn't answer, retried every second
    let mut acc_cfg = i2c::Config::default();
    acc_cfg.frequency = 400_000;
    acc_cfg.sda_pullup = false;
    acc_cfg.scl_pullup = false;
    let mut accel = Lis3dh::new(AccelBus(I2c::new_blocking(p.I2C0, p.PIN_9, p.PIN_8, acc_cfg)));
    if !accel.init() {
        warn!("LIS3DH not answering");
    }

    gb_reset.set_low(); // let the Game Boy boot
    info!("Game Boy released from reset");

    let mut next = 0usize;
    let mut last_link = Instant::now();
    let mut last_accel = Instant::now();
    let mut last_accel_init = Instant::now();
    loop {
        // drain the captured write cycles in bus order
        let written = (pac::DMA.ch(CH_RING).write_addr().read().wrapping_sub(ring_base) / 4) as usize % RING_LEN;
        while next != written {
            let word = unsafe { core::ptr::read_volatile(addr_of!(RING.0[next])) };
            mailbox.on_write(word);
            next = (next + 1) % RING_LEN;
        }
        mailbox.service(&mut chip, &mut hw, image);
        if last_accel.elapsed().as_millis() >= 10 {
            last_accel = Instant::now();
            match accel.read() {
                Some(xy) => chip.accel = xy,
                None => {
                    chip.accel = (0, 0);
                    if last_accel_init.elapsed().as_millis() >= 1000 {
                        last_accel_init = Instant::now();
                        accel.init();
                    }
                }
            }
        }
        if last_link.elapsed().as_micros() >= 1000 {
            last_link = Instant::now();
            radio.poll(&mut chip, &mut hw).await;
        }
        Timer::after_micros(500).await;
    }
}

/// /RD as the `jmp pin` of state machine `sm`. embassy-rp 0.10 can't set it here: its config field is private and
/// it would write the absolute GPIO number, while the hardware counts from GPIOBASE (16), so 18 would mean GPIO34.
fn set_jmp_pin(sm: usize) {
    pac::PIO0.sm(sm).execctrl().modify(|w| w.set_jmp_pin(PIO_PIN_RD));
}

/// The two read channels (address -> byte -> TX FIFO) and the write ring, as hardware/sim models them.
fn start_dma(image_base: u32, ring_base: u32) {
    let dma = pac::DMA;
    let pio = pac::PIO0;
    let _ = image_base;

    // CH_DATA: one byte from the address CH_ADDR writes into its read-address trigger, into SM0's TX FIFO
    let data = dma.ch(CH_DATA);
    data.write_addr().write_value(pio.txf(0).as_ptr() as u32);
    data.trans_count().write(|w| {
        w.set_count(1);
        w.set_mode(TransCountMode::NORMAL);
    });
    let mut c = pac::dma::regs::CtrlTrig(0);
    c.set_en(true);
    c.set_high_priority(true);
    c.set_data_size(DataSize::SIZE_BYTE); // narrow writes are replicated across the FIFO word
    c.set_chain_to(CH_DATA as u8); // chaining to itself = no chain
    c.set_treq_sel(TreqSel::PIO0_TX0);
    data.al1_ctrl().write_value(c.0); // no trigger: CH_ADDR triggers it

    // CH_ADDR: each address word SM0 pushes goes to CH_DATA's read-address trigger, forever
    let addr = dma.ch(CH_ADDR);
    addr.read_addr().write_value(pio.rxf(0).as_ptr() as u32);
    addr.write_addr().write_value(dma.ch(CH_DATA).al3_read_addr_trig().as_ptr() as u32);
    addr.trans_count().write(|w| {
        w.set_count(1);
        w.set_mode(TransCountMode::ENDLESS);
    });
    let mut c = pac::dma::regs::CtrlTrig(0);
    c.set_en(true);
    c.set_high_priority(true);
    c.set_data_size(DataSize::SIZE_WORD);
    c.set_chain_to(CH_ADDR as u8);
    c.set_treq_sel(TreqSel::PIO0_RX0);
    addr.ctrl_trig().write_value(c);

    // CH_RING: every captured write cycle from SM1 into the ring, wrapping at 32 KB
    let ring = dma.ch(CH_RING);
    ring.read_addr().write_value(pio.rxf(1).as_ptr() as u32);
    ring.write_addr().write_value(ring_base);
    ring.trans_count().write(|w| {
        w.set_count(1);
        w.set_mode(TransCountMode::ENDLESS);
    });
    let mut c = pac::dma::regs::CtrlTrig(0);
    c.set_en(true);
    c.set_data_size(DataSize::SIZE_WORD);
    c.set_incr_write(true);
    c.set_ring_sel(true); // wrap the write address
    c.set_ring_size(15); // 2^15 bytes
    c.set_chain_to(CH_RING as u8);
    c.set_treq_sel(TreqSel::PIO0_RX1);
    ring.ctrl_trig().write_value(c);
}
