# Cartridge simulation

Simulates the real cartridge (RP2350 + SE050 + RM2 + level shifters) on a Game Boy
bus driven by the real ROM, before any board exists. Results and what they changed
in the design: [docs/hardware-sim.md](../../docs/hardware-sim.md).

```sh
cd rom && make hw        # the real-cartridge ROM: mailbox writes at 0xA000, reads at 0x7F00
cd ../web && pnpm sim    # about 5 minutes; MHZ=125 TRIALS=30 pnpm sim to change the run
```

It uses the website's dependencies (`web/node_modules`, linked here by `pnpm sim`).
Output goes to `out/summary.txt` and `out/results.json`.

| File | What it is |
|---|---|
| `params.ts` | Every number the simulation uses, with its source and whether it's a datasheet value, a measurement or an assumption |
| `programs.ts` | The PIO programs the cartridge would load, with sample points worked out for the clock |
| `pio.ts` | A cycle-accurate model of an RP2350 PIO state machine and a small pioasm assembler |
| `tracer.ts` | The emulator, instrumented to emit every machine cycle the cartridge bus carries (including OAM DMA) |
| `session.ts` | The scripted session the ROM runs through, and the recorder for the cycle-level run |
| `cartsim.ts` | The cartridge cycle by cycle: Game Boy edges, shifter, synchronisers, PIO, DMA, SRAM, pads, latch checks |
| `firmware.ts` | The real wallet logic (`web/src/chip/chip.ts`) answering the mailbox, with RP2350 + SE050 timings |
| `power.ts` | Current per part over the session, on the Game Boy's 5 V rail |
| `run.ts` | Runs everything and writes the results |
