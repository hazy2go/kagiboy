// Power drawn by the cartridge from the Game Boy's 5 V rail, from the session timeline: what the
// radio, the SE050 and the RP2350 are doing in each stretch of the real ROM's run.

import type { CallRecord } from "./firmware";
import { T_CYCLE_NS } from "./firmware";
import type { Phase } from "./session";
import { POWER, RADIO, RP2350, SE050, hi, lo, mid, type Source } from "./params";

const v = (s: Source) => s.value as number;

export interface PowerInputs {
  mhz: number;
  phases: Phase[];
  calls: CallRecord[];
  totalT: number;
  /** cartridge reads per second, averaged over the run */
  readRate: number;
  /** BLE connection interval while a phone is connected, ms */
  connIntervalMs: number;
  /** linear regulator (5 V current = 3.3 V current) or a buck converter at this efficiency */
  regulator: "ldo" | number;
}

/** RP2350 at f MHz with PIO + DMA serving the bus and the cores mostly asleep (WFI) between events. */
export function rp2350mA(mhz: number, coreBusy: boolean) {
  const k = mhz / 150;
  const idle = v(RP2350.busIdle) * k; // clocks, bus fabric, SRAM (datasheet "bus idle" at 150 MHz, scaled)
  const periph = ((v(RP2350.ioPads) + v(RP2350.dma)) * mhz) / 1000; // IO + pads, DMA clocks
  const pio = 1.0 * k; // three state machines; not tabulated, assumed
  const core = coreBusy ? (v(RP2350.coremark150) - v(RP2350.busIdle)) * k : 0;
  return idle + periph + pio + core + v(RP2350.iovdd);
}

export function radiomA(state: Phase["radio"], connIntervalMs: number) {
  const sleep = v(RADIO.sleep);
  if (state === "off") return sleep;
  // per-event charge from the datasheet's 1 s figures, scaled to the interval
  if (state === "advertising") return sleep + (v(RADIO.bleAdv1s) - sleep) * (1000 / 100); // 100 ms advertising
  return sleep + (v(RADIO.bleConn1s) - sleep) * (1000 / connIntervalMs);
}

export interface PowerResult {
  /** steady states, mA on the 5 V rail, and mW */
  states: { name: string; mA: number; mW: number; vsStockPct: number }[];
  sessionAvg: { mA: number; mW: number; vsStockPct: number };
  peak: { mA: number; mW: number; what: string };
  breakdownHome: { part: string; mA: number }[];
}

export function power(p: PowerInputs): PowerResult {
  const to5v = (mA3v3: number) => (p.regulator === "ldo" ? mA3v3 + v(POWER.ldoQ) : (mA3v3 * 3.3) / (5 * p.regulator) + v(POWER.ldoQ));
  const busDrive = v(POWER.busDrive) * (p.readRate / 1.048576e6); // scaled from the full-rate figure
  const lis = v(POWER.lisLowPower);
  const sePd = mid(SE050.iPowerDown);
  const seDpd = mid(SE050.iDeepPowerDown);
  const mk = (name: string, mA3: number) => {
    const mA = to5v(mA3);
    return { name, mA, mW: mA * 5, vsStockPct: ((mA * 5) / v(POWER.dmgStock)) * 100 };
  };

  const homeParts = [
    { part: `RP2350 @ ${p.mhz} MHz (PIO + DMA serving the bus)`, mA: rp2350mA(p.mhz, false) },
    { part: "SE050 power-down, session kept", mA: sePd },
    { part: `radio, connected (${p.connIntervalMs} ms interval)`, mA: radiomA("connected", p.connIntervalMs) },
    { part: "driving the data bus", mA: busDrive },
    { part: "LIS3DH", mA: lis },
  ];
  const sum = (xs: { mA: number }[]) => xs.reduce((a, x) => a + x.mA, 0);
  const states = [
    mk("home screen, phone connected", sum(homeParts)),
    mk("home screen, radio off", sum(homeParts) - radiomA("connected", p.connIntervalMs) + radiomA("off", 0)),
    mk("locked (SE050 deep power-down, radio off)", rp2350mA(p.mhz, false) + seDpd + radiomA("off", 0) + busDrive + lis),
    mk("signing (SE050 public-key engine running)", rp2350mA(p.mhz, false) + mid(SE050.iPk) + radiomA("connected", p.connIntervalMs) + busDrive + lis),
  ];

  // session average: integrate the timeline
  const ms = (t: number) => (t * T_CYCLE_NS) / 1e6;
  const totalMs = ms(p.totalT);
  let charge = 0; // mA·ms on the 3.3 V side
  for (const ph of p.phases) {
    const d = ms(ph.t1 - ph.t0);
    const unlocked = !["boot", "setup"].includes(ph.name);
    charge += d * (rp2350mA(p.mhz, false) + radiomA(ph.radio, p.connIntervalMs) + (unlocked ? sePd : seDpd) + busDrive + lis);
  }
  for (const c of p.calls)
    for (const s of c.steps) {
      const se = /SE050/.test(s.what);
      const pk = /Sign|WriteECKey|TRNG/.test(s.what);
      charge += s.ms * (se ? (pk ? mid(SE050.iPk) : mid(SE050.iCpu)) : 0);
      if (!se) charge += s.ms * (rp2350mA(p.mhz, true) - rp2350mA(p.mhz, false));
    }
  const avg3 = charge / totalMs;
  const sessionAvg = (() => {
    const s = mk("session", avg3);
    return { mA: s.mA, mW: s.mW, vsStockPct: s.vsStockPct };
  })();

  const peak3 = rp2350mA(p.mhz, true) + v(SE050.iPeak) + v(RADIO.burst) + lis + v(POWER.busDrive);
  return {
    states,
    sessionAvg,
    peak: { mA: to5v(peak3), mW: to5v(peak3) * 5, what: "SE050 peak + a radio burst + busy core, all at once" },
    breakdownHome: homeParts,
  };
}

export { lo, hi };
