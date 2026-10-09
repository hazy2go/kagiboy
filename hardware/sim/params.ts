// Every number the simulation uses, with where it comes from and how sure we are.
// "measured" = a datasheet or a published measurement; "assumed" = our estimate, to be measured in Phase 1.

export type Source = { value: number | readonly [number, number]; unit: string; source: string; confidence: "datasheet" | "measured" | "assumed" };

/** Cartridge bus timing of one DMG machine cycle, in ns from the CLK (PHI, pin 2) rising edge. */
export const BUS = {
  /** one machine cycle: 4 clocks of 4.194304 MHz */
  cycle: { value: 953.67, unit: "ns", source: "4 / 4.194304 MHz", confidence: "datasheet" },
  addrValid: { value: [140, 175], unit: "ns", source: "Nintendo DMG CPU manual timing diagram p.137 (140 ns); Dhole logic capture (150 ±25 ns)", confidence: "measured" },
  /** A15 (ROM select) and /CS (RAM window) go low */
  selectLow: { value: [230, 275], unit: "ns", source: "Nintendo manual p.137 (/CS 240 ns); Dhole capture (CS 250 ±25 ns)", confidence: "measured" },
  /** A15 and /CS go back high, around the end of the cycle */
  selectHigh: { value: [930, 1000], unit: "ns", source: "Gekkio SGB2 charts: 'returns high at the end of the access' (no figure); range assumed", confidence: "assumed" },
  clkFall: { value: [472, 485], unit: "ns", source: "Nintendo manual p.137 (480 ns); half cycle is 477 ns", confidence: "measured" },
  wrLow: { value: [472, 505], unit: "ns", source: "Nintendo manual p.137 (/WR at CLK fall, 480 ns); Dhole (at CLK fall)", confidence: "measured" },
  wrHigh: { value: [770, 850], unit: "ns", source: "Dhole (/WR held 300 ns, so ~780 ns); Nintendo manual point e (840 ns)", confidence: "measured" },
  /** the Game Boy drives write data from here until the next cycle's address change */
  writeDataValid: { value: [150, 500], unit: "ns", source: "Dhole (data with the address, 150 ns) vs Nintendo manual (GB drives the bus at 480 ns); we design for the late one", confidence: "measured" },
  /**
   * When the CPU latches read data. Two published hypotheses; the design must meet the early one.
   * early: CLK fall (Dhole's guess). late: next CLK rise (Gekkio, "95% sure", tested on an SGB).
   */
  readSampleEarly: { value: 480, unit: "ns", source: "Dhole: 'around the CLK fall' (a guess)", confidence: "assumed" },
  readSampleLate: { value: 953.67, unit: "ns", source: "Gekkio on NESdev: samples on rising CLK (SGB)", confidence: "measured" },
  /** data must be stable this long before the latch (not published; CMOS-typical) */
  readSetup: { value: 20, unit: "ns", source: "not published; assumed", confidence: "assumed" },
  /** and this long after it */
  readHold: { value: 5, unit: "ns", source: "not published; assumed", confidence: "assumed" },
} satisfies Record<string, Source>;

/** 5 V <-> 3.3 V level shifters, VCCA = 3.3 V, VCCB = 5 V. */
export const SHIFTER = {
  txb0108: {
    aToB: { value: [0.8, 4.0], unit: "ns", source: "TI TXB0108 SCES643L, 5.20 (VCCA 3.3 V, VCCB 5 V)", confidence: "datasheet" },
    bToA: { value: [0.2, 4.0], unit: "ns", source: "TI TXB0108 SCES643L, 5.20", confidence: "datasheet" },
    oeEnable: { value: 1000, unit: "ns", source: "TI TXB0108 SCES643L, 5.20 (ten = 1 µs): OE can't switch per cycle", confidence: "datasheet" },
    maxLoad: { value: 70, unit: "pF", source: "TI TXB0108 SCES643L, 8.x: one-shots designed for up to 70 pF", confidence: "datasheet" },
  },
  lvc8t245: {
    aToB: { value: [0.5, 4.4], unit: "ns", source: "TI SN74LVC8T245 SCES584D, 5.9 (VCCA 3.3 V, VCCB 5 V)", confidence: "datasheet" },
    bToA: { value: [0.6, 6.0], unit: "ns", source: "TI SN74LVC8T245 SCES584D, 5.9", confidence: "datasheet" },
    enableB: { value: [0.9, 6.8], unit: "ns", source: "TI SN74LVC8T245 SCES584D, 5.9 (tPZH/tPZL, OE to B)", confidence: "datasheet" },
    disableB: { value: [0.8, 6.3], unit: "ns", source: "TI SN74LVC8T245 SCES584D, 5.9 (tPHZ/tPLZ, OE to B)", confidence: "datasheet" },
  },
} as const;

export const RP2350 = {
  inputSync: { value: 2, unit: "cycles", source: "RP2350 datasheet 11.5.6.3: 2-flipflop synchroniser on every GPIO input", confidence: "datasheet" },
  padOut: { value: [1, 5], unit: "ns", source: "pad output delay, not tabulated; assumed", confidence: "assumed" },
  /** one DMA hop: DREQ seen -> read -> write lands. The datasheet gives no cycle count. */
  dmaHop: { value: [3, 8], unit: "cycles", source: "not in the RP2350 datasheet (only 'DREQ latency one cycle less than RP2040'); assumed", confidence: "assumed" },
  sramContention: { value: [0, 3], unit: "cycles", source: "bus fabric arbitration if a core hits the same SRAM bank; assumed", confidence: "assumed" },
  gpioA: { value: 30, unit: "GPIO", source: "RP2350 datasheet table 1: RP2350A/RP2354A (QFN-60)", confidence: "datasheet" },
  gpioB: { value: 48, unit: "GPIO", source: "RP2350 datasheet table 1: RP2350B (QFN-80)", confidence: "datasheet" },
  /** VREG_VIN at 3.3 V running CoreMark on one core at 150 MHz */
  coremark150: { value: 11.0, unit: "mA", source: "RP2350 datasheet table 1693", confidence: "datasheet" },
  busIdle: { value: 6.53, unit: "mA", source: "RP2350 datasheet table 1693 (bus idle average, VREG_VIN)", confidence: "datasheet" },
  ioPads: { value: 24.5, unit: "µA/MHz", source: "RP2350 datasheet table 1690", confidence: "datasheet" },
  dma: { value: 2.6, unit: "µA/MHz", source: "RP2350 datasheet table 1690", confidence: "datasheet" },
  iovdd: { value: 0.5, unit: "mA", source: "RP2350 datasheet table 1693 (IOVDD ~0.44-0.51 mA)", confidence: "datasheet" },
} as const;

export const SE050 = {
  i2cMax: { value: 1_000_000, unit: "Hz", source: "SE050 datasheet Rev 3.8 §4.1.1: 1 MHz without clock stretching, the SE050E default", confidence: "datasheet" },
  ed25519Sign: { value: 261.3, unit: "ms", source: "wolfSSL SE050 benchmark (Raspberry Pi host)", confidence: "measured" },
  ecdsaSign: { value: 102.9, unit: "ms", source: "wolfSSL SE050 benchmark (curve not stated; secp256k1 assumed similar)", confidence: "measured" },
  trng: { value: 114, unit: "B/s", source: "wolfSSL SE050 benchmark: 0.114 KB/s", confidence: "measured" },
  apduMax: { value: 889, unit: "bytes", source: "NXP AN12413 APDU payload cap", confidence: "datasheet" },
  wakeFromPowerDown: { value: 0.097, unit: "ms", source: "SE050 datasheet table 13 (I2C wake-up 97 µs)", confidence: "datasheet" },
  iCpu: { value: [4.4, 7], unit: "mA", source: "SE050 datasheet table 12 (CPU, no coprocessor)", confidence: "datasheet" },
  iPk: { value: [14.4, 16.1], unit: "mA", source: "SE050 datasheet table 12 (public-key coprocessor)", confidence: "datasheet" },
  iPeak: { value: 19, unit: "mA", source: "SE050 datasheet table 12 note 1", confidence: "datasheet" },
  iPowerDown: { value: [0.45, 0.5], unit: "mA", source: "SE050 datasheet table 12 (I2C power-down, state kept)", confidence: "datasheet" },
  iDeepPowerDown: { value: [0.003, 0.005], unit: "mA", source: "SE050 datasheet table 12 (deep power-down via ENA pin, state lost)", confidence: "datasheet" },
  /** a key write / object write / session open; not published */
  objectOp: { value: [15, 60], unit: "ms", source: "not published; assumed", confidence: "assumed" },
  sessionOpen: { value: [40, 150], unit: "ms", source: "PIN-authenticated session open; not published; assumed", confidence: "assumed" },
} as const;

export const RADIO = {
  /** CYW43439 BT current with WLAN in reset, 10 dBm, VBAT 3.6 V */
  bleAdv1s: { value: 0.093, unit: "mA", source: "Infineon CYW43439 datasheet 002-30348 Rev *B, table 39 (unconnectable adv, 1.00 s)", confidence: "datasheet" },
  bleConn1s: { value: 0.071, unit: "mA", source: "CYW43439 datasheet table 39 (connected, 1 s interval)", confidence: "datasheet" },
  sleep: { value: 0.006, unit: "mA", source: "CYW43439 datasheet table 39 (sleep)", confidence: "datasheet" },
  burst: { value: 23.3, unit: "mA", source: "CYW43439 datasheet table 39 (BT DM1/DH1 master; no BLE-burst figure published, used as the peak)", confidence: "datasheet" },
  gpios: { value: 4, unit: "GPIO", source: "RM2 datasheet: WL_REG_ON, shared DATA, CLK, CS", confidence: "datasheet" },
} as const;

export const MCU_WORK = {
  /** cycles per SHA-512 block on a Cortex-M33 (software); BIP-39 seed = 2048 PBKDF2 rounds = 4096 blocks */
  sha512Block: { value: [9_000, 16_000], unit: "cycles", source: "typical software SHA-512 on Cortex-M4/M33 (70-125 cycles/byte); assumed", confidence: "assumed" },
  secp256k1Mul: { value: [3_000_000, 6_000_000], unit: "cycles", source: "point multiplication on Cortex-M33 (libsecp256k1/uECC class); assumed", confidence: "assumed" },
  ed25519Base: { value: [600_000, 1_500_000], unit: "cycles", source: "Ed25519 base-point multiplication on Cortex-M33; assumed", confidence: "assumed" },
  command: { value: [0.05, 0.5], unit: "ms", source: "decode, format, QR, word lookup on the MCU; assumed", confidence: "assumed" },
} as const;

export const POWER = {
  dmgStock: { value: 235, unit: "mW", source: "Gekkio 2021: DMG with no cartridge, 6 V input", confidence: "measured" },
  everdriveExtra: { value: 230, unit: "mW", source: "Gekkio 2021: original EverDrive GB ~465 mW total (works on DMGs)", confidence: "measured" },
  lisLowPower: { value: 0.011, unit: "mA", source: "LIS3DH datasheet typical, 50 Hz normal mode (datasheet download failed here; not re-checked)", confidence: "assumed" },
  ldoQ: { value: 0.05, unit: "mA", source: "LDO quiescent current; assumed", confidence: "assumed" },
  /** charge moved per read cycle on the 5 V data bus: 8 lines, ~40 pF, ~half toggle */
  busDrive: { value: 1.0, unit: "mA", source: "C·V·f·α = 8 × 40 pF × 5 V × 1.05 MHz × 0.5 at full read rate; assumed load", confidence: "assumed" },
} as const;

export const lo = (s: Source) => (Array.isArray(s.value) ? s.value[0] : s.value);
export const hi = (s: Source) => (Array.isArray(s.value) ? s.value[1] : s.value);
export const mid = (s: Source) => (lo(s) + hi(s)) / 2;
