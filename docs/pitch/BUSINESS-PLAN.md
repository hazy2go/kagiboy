# kagiboy business plan

Draft of 2026-10-08, written for the Colosseum Crypto World's Fair submission (deadline 2026-10-12). It should take about 10 minutes to read.

**Status, honestly.** The software is real today. The GBDK ROM runs on a real Game Boy (DMG) from a flash cart. The browser demo at [kagiboy.xyz/demo](https://kagiboy.xyz/demo) runs the same ROM against a simulated key chip, next to the kagiboy phone app, which signs real testnet transactions and quotes live SODAX swaps. **The cartridge hardware has not been built yet.** Nothing has had an external security review, and nobody should keep real funds on kagiboy until both of those have happened. Every cost, price and volume below is an assumption, and each one is labelled. Unless a source link is given, a number is our estimate.

## 1. What it is

kagiboy is a hardware wallet that is an original Game Boy cartridge. You plug it into your own DMG, Game Boy Color or Game Boy Advance. The console is the screen and the buttons. The phone app only asks for things.

| Part in the cartridge | Job |
|---|---|
| RP2350 MCU (RP2354A in Rev B) | Serves the Game Boy cartridge bus, decodes transactions, runs the wallet firmware |
| NXP SE050 secure element (E2 variant) | Holds the keys as sign-only objects, enforces the PIN retry counter |
| Raspberry Pi RM2 module (CYW43439) | Bluetooth LE to the phone. It carries public data only: unsigned transactions in, signatures out |
| LIS3DH accelerometer | Shake the Game Boy to add entropy |

It supports Solana and EVM chains (Ethereum, Base, Arbitrum, HyperEVM, Robinhood Chain). Details are in [hardware.md](hardware.md) and [ROADMAP.md](ROADMAP.md).

**Positioning.** kagiboy is not a Ledger rival, and it won't be sold as one. It is a collector's object for people who grew up with a Game Boy and ended up in crypto. It works as a gift, and it is something you keep on a shelf or in a safe. Most buyers will already own a mainstream wallet. kagiboy is the second wallet they actually enjoy using, and the one that holds the bag they care about.

**Founder.** hazy lives in Japan, collects retro hardware and has spent years building in Web3. Living in Japan matters in practice. It is the biggest source of used DMGs (for the console bundle), it puts Shenzhen manufacturing within a short flight, and it gives us a home market for a Japan-only edition.

## 2. Who buys it, and how many of them there are

**Customer.** Crypto holders aged about 28 to 45 who owned a Game Boy as kids. They buy collectibles and limited editions, and they already know why self-custody matters. A second group buys it as a gift for that person.

**Market reference points (sourced):**

| Figure | Value | Source |
|---|---|---|
| Hardware wallet market, 2025 | $348M to $565M, depending on the firm | [IMARC](https://imarcgroup.com/global-hardware-wallet-market), [GII summaries](https://www.giiresearch.com/report/tsci2046736-hardware-wallet-market-global-industry-size-share.html) |
| Ledger devices sold since 2014 | about 8 million | [CoinLaw](https://coinlaw.io/ledger-statistics/) |
| Global crypto owners, 2025 | 741 million | [Crypto.com](https://crypto.com/company-news/global-cryptocurrency-ownership-reaches-741-million-in-2025) |
| Crypto exchange accounts in Japan | over 12 million (Jan 2025, FSA) | [Forkast / MEXC news](https://www.mexc.com/news/135013) |
| Game Boy + Game Boy Color sold | 118.69 million | [Wikipedia](https://en.wikipedia.org/wiki/Game_Boy_Color) |
| Retro gaming market, 2025 | $3.8B to $8.3B, depending on scope | [GenXGamer](https://genxgamer.substack.com/p/the-retro-video-game-market-a-multi), [WiseGuy](https://www.wiseguyreports.com/reports/retro-video-game-market) |

**Our sizing (estimate).** At a $100 average price, a $350M to $565M market comes to roughly 3.5 to 5.6 million wallets a year. Suppose 1% of those buyers are Game Boy-era collectors who would also buy a novelty second wallet. That gives **35,000 to 55,000 units a year** as the reachable pool. Our base case (3,000 units in the first sales year) would be under 10% of that pool and under 0.1% of the hardware wallet market. We size from the wallet side because the retro market is large but most of it doesn't hold crypto.

**Prior art.** Keyp's 2023 Game Wallet was an offline BTC/ETH Game Boy cartridge ([Decrypt](https://decrypt.co/140730/old-game-boy-might-next-bitcoin-ethereum-wallet)). It shows the idea appeals to people. It had no secure element, no Solana and no phone link, and we have no evidence it sold at scale. That is a demand risk we take seriously (section 8).

## 3. Revenue line 1: hardware (primary)

### Unit cost by batch size (estimate)

The prices are distributor list prices or our estimates, in USD per unit. The [ROADMAP](ROADMAP.md) quotes about $20 landed for parts and assembly at 500 units. We are more conservative here because we include packaging, scrap, freight and duties.

| Line | 500 units | 2,000 units | 10,000 units | Basis |
|---|---|---|---|---|
| RP2354A MCU | 1.30 | 1.20 | 1.00 | $0.80 reel / $1.10 single + $0.20 for in-package flash ([Raspberry Pi](https://www.raspberrypi.com/news/rp2350-now-available-to-buy/), [CNX](https://www.cnx-software.com/2025/03/18/buy-raspberry-pi-rp2350-mcu-rp2354a-and-rp2354b-variants/)) |
| SE050E2 secure element | 3.50 | 3.20 | 2.80 | SE050C1 is $3.26 at 100+ ([LCSC](https://support.lcsc.com/product-detail/Security-Verification-Encryption-ICs_NXP-Semicon-SE050C1HQ1-Z01SCZ_C2650415.html)). We found no public price for E2, so we assume a small premium |
| RM2 radio module (CYW43439) | 4.60 | 4.20 | 3.80 | about $4.60 retail ([SparkFun](https://www.sparkfun.com/raspberry-pi-radio-module-rmc20452t.html)). Volume discount is assumed |
| LIS3DH accelerometer | 0.80 | 0.65 | 0.50 | distributor estimate |
| Level shifters (3x) | 1.50 | 1.30 | 1.10 | [hardware.md](hardware.md) |
| Passives, regulator, CONFIRM button, LED, crystal | 1.50 | 1.20 | 0.90 | estimate |
| 4-layer PCB, ENIG gold fingers, bevelled edge | 2.50 | 1.50 | 0.90 | estimate (JLCPCB/PCBWay class) |
| SMT assembly, test, SE provisioning | 6.00 | 3.50 | 2.00 | estimate. Small runs carry setup costs |
| Epoxy potting | 0.80 | 0.60 | 0.40 | estimate |
| Injection-molded shell + screw | 1.50 | 1.00 | 0.70 | estimate. The mold itself is under fixed costs |
| Printed label | 0.40 | 0.25 | 0.15 | estimate |
| Box, insert, tamper seal, recovery card | 3.50 | 2.50 | 1.80 | estimate |
| Scrap and yield loss (5%) | 1.40 | 1.06 | 0.80 | estimate |
| Freight and duties to fulfilment | 2.00 | 1.50 | 1.00 | estimate |
| **Landed unit cost** | **$31.30** | **$23.70** | **$17.90** | |

### One-off costs to get to a sellable product (estimate)

| Item | Plan | Range / basis |
|---|---|---|
| External security audits (firmware/protocol firm + hardware/physical firm) | $100,000 | $50k to $120k ([ROADMAP](ROADMAP.md#security-program)) |
| Certification: FCC Part 15B, CE (RED/EMC), Japan MIC/TELEC check, Bluetooth SIG qualification | $35,000 | The RM2 has FCC/CE/IC modular approval ([Raspberry Pi docs](https://www.raspberrypi.com/documentation/microcontrollers/radio-modules.html)). Japan approval for the module is unconfirmed. The Bluetooth SIG fee is $12,000 for Adopters from March 2026 ([SIG fees](https://www.bluetooth.com/?p=188047)) |
| Shell injection mold | $15,000 | $5k to $12k quoted by hobbyists, some higher ([GB Studio Central](https://gbstudiocentral.com/?p=3613)) |
| Provisioning station, test jigs | $5,000 | estimate |
| Trademark clearance and filings (US, EU, JP) | $8,000 | estimate |
| **Total** | **$163,000** | |

Spread over volume, that is $326 a unit at 500, $82 at 2,000 and $16 at 10,000. **The first batch of 500 cannot pay back these costs.** That is why section 7 asks for outside funding. The batch proves demand and makes the product real. It is not where profit comes from.

### Prices

| Product | Price | Notes |
|---|---|---|
| Standard cartridge | **$129** | Grey shell, standard box |
| Limited edition (clear purple, atomic purple; numbered label and certificate, gift box) | **$169** | Each colourway capped at 500 units |
| Japan-only edition | **¥24,800** incl. tax (about $150 net at ¥150/$, an assumption) | Sold through Japanese channels only |
| Bundle: cartridge + refurbished, unmodified DMG | **$279** | DMG sourced and refurbished in Japan. The console is checked as unmodified, which also lowers the "modded console" risk (section 8) |

**Why $129.** kagiboy shouldn't compete on value with entry wallets, and the higher price leaves room for limited runs without discounting.

| Comparison | Price | Source |
|---|---|---|
| Trezor Safe 3 | about $59 to $79 | [The Block](https://www.theblock.co/ratings/best-crypto-hardware-wallets-in-2025-375144) |
| Ledger Nano S Plus | about $79 | [The Block](https://www.theblock.co/ratings/best-crypto-hardware-wallets-in-2025-375144) |
| Ledger Nano X | about $99 to $149 | [The Block](https://www.theblock.co/ratings/best-crypto-hardware-wallets-in-2025-375144) |
| Keystone 3 Pro | $149 | [ethereum.org](https://ethereum.org/wallets/find-wallet/keystone/) |
| Trezor Safe 5 | $169 | [The Block](https://www.theblock.co/ratings/best-crypto-hardware-wallets-in-2025-375144) |
| EverDrive GB X7 flash cart | about $148 | [Stone Age Gamer](https://stoneagegamer.com/everdrive-gb-x7-base.html) |
| Refurbished DMG (loose / restored) | $45 to $100 / $170 to $200 | [eBay](https://www.ebay.com/itm/303933410135), [Etsy](https://www.etsy.com/listing/4363779577) |

At $129, kagiboy costs more than an entry Ledger or Trezor and less than a Safe 5, a Keystone or an EverDrive. Collectors already pay about $148 for a premium Game Boy flash cart. **The buyer needs a DMG, GBC or GBA of their own.** The bundle covers anyone who doesn't have one.

### Margin per unit (estimate)

Variable costs per order are fulfilment and packing ($6, or $12 for the bundle), payment processing (3.5%) and a warranty/returns reserve (3%). Shipping is charged to the customer.

| Product @ batch size | Price | Landed cost | All variable costs | Contribution | Margin |
|---|---|---|---|---|---|
| Standard @ 500 | $129 | $31.30 | $45.69 | $83.31 | 65% |
| Standard @ 2,000 | $129 | $23.70 | $38.09 | $90.91 | 70% |
| Standard @ 10,000 | $129 | $17.90 | $32.29 | $96.71 | 75% |
| Limited @ 2,000 (+$5 for edition extras) | $169 | $28.70 | $45.69 | $123.31 | 73% |
| Japan edition @ 2,000 | ~$150 net | $28.70 | $44.45 | ~$105.55 | 70% |
| DMG bundle @ 2,000 (DMG sourced + refurbished $100, extra box $5) | $279 | $128.70 | $158.84 | $120.16 | 43% |

### First 12 months of sales (estimate)

We assume a product mix of 60% standard, 30% limited/Japan and 10% bundle. That gives a blended price of **$156** and a blended contribution of about **$96 at the 500-unit cost tier, $104 at 2,000 and $109 at 10,000**. Year-1 operating costs come to about $90k, excluding salaries: $20k bug bounty pool, $25k firmware re-review, $15k legal and accounting, $20k support and operations, $10k tools and hosting.

| Scenario | Units | Revenue | Contribution | Less one-off ($163k) and opex ($90k) |
|---|---|---|---|---|
| Low | 1,000 | $156k | $96k | **-$157k** |
| Base | 3,000 | $468k | $312k | **+$59k** |
| High | 10,000 | $1.56M | $1.09M | **+$837k** |

The low case is a waitlist that only half converts. The base case is one sold-out batch of 500 plus a 2,500-unit second run. The high case needs a co-branded edition or a viral moment. None of these figures include team salaries.

## 4. Revenue line 2: in-app swap fees

Swaps in the kagiboy app run through SODAX ([web/src/app/swap.ts](../web/src/app/swap.ts)).

- kagiboy takes a **0.1% partner fee (10 bps)** on every swap, paid in the sell token to kagiboy's partner wallet under the SODAX partner program. SODAX's own solver fee of 0.1% is charged on top. The quote the user sees is already net of both fees.
- The fee shows up on the Game Boy screen as part of the swap the cartridge signs. Nothing is hidden.
- The user pays 0.2% in total. For comparison, MetaMask charges 0.875% and Phantom 0.85% for swaps ([CoinTracker](https://www.cointracker.io/blog/metamask-vs-phantom)). Low fees are part of the pitch.
- Today the demo quotes live and signs the swap intent, then stops. Swaps on mainnet wait for audited hardware.

**Model (estimate).** We assume 30% of owners use in-app swaps in a given year (many cartridges will sit in a safe). Annual swap volume per active swapper is $1,000 in the low case, $5,000 in the base case and $20,000 in the high case.

| Cartridges in use | Active swappers (30%) | Low ($1k/yr) | Base ($5k/yr) | High ($20k/yr) |
|---|---|---|---|---|
| 3,000 | 900 | $900 | $4,500 | $18,000 |
| 10,000 | 3,000 | $3,000 | $15,000 | $60,000 |
| 50,000 | 15,000 | $15,000 | $75,000 | $300,000 |

Swap fees are small until a lot of cartridges are in use. We are not counting on them for the first batch. They matter because they recur and grow with the number of cartridges in use, not with new sales, and because they pay for the app over the long run.

## 5. Revenue line 3 (later, optional)

| Line | Idea | Price / terms (estimate) | Unit cost (estimate) |
|---|---|---|---|
| Link-cable backup cartridge | A second cartridge as the backup. Two Game Boys and a link cable move the seed, encrypted end to end ([hardware.md](hardware.md#backup-and-recovery)) | $99 when bought with a first unit | same as a standard unit |
| Display stand | Acrylic shelf stand for the cartridge, or for the cartridge plus a DMG | $25 | about $4 |
| Co-branded editions | Solana, Hyperliquid or Base community editions, made only with the brand owner's permission | 250-unit minimum, $120/unit wholesale + $5k design fee | standard + about $3 |
| Bulk merch | Hackathon and conference gifts, numbered | $99/unit for 100+ | standard |

A 500-unit co-branded run at $120 brings in $60k, at a contribution of roughly $45k.

## 6. Go-to-market

1. **Waitlist (live).** Sign-ups go through [kagiboy.xyz](https://kagiboy.xyz). In Q4 2026 we survey the list on price, colourway and bundle interest before committing to a batch size.
2. **Refundable deposits, then a capped first batch.** Deposits open only once a working custom board exists (Q1 2027). They are fully refundable, and the batch is capped at 500 numbered units. We don't ship until the external audit is closed. We would rather lose a sale than ship early.
3. **Crypto Twitter.** The product films well: shaking a Game Boy to make a seed, approving a swap on a 1989 screen. The build itself is the content: power measurements, the first board on a real DMG, the audit report.
4. **Retro community.** GB Studio Central, homebrew publishers, Game Boy subreddits, retro YouTube. In that community the open-source ROM and schematics matter as much as the wallet.
5. **Japan.** A Japan-only edition, retro shops in Akihabara and Osaka, and Japanese crypto media. With over 12 million exchange accounts, Japan is a real home market.
6. **Gifting.** Limited editions and the DMG bundle ship in a gift box, with launches timed for the holidays and Golden Week.

## 7. Path to the first batch, and funding

The milestones follow the quarters on the website and the phases in [ROADMAP.md](ROADMAP.md). Costs are estimates.

| When | Phase | Milestone | Hard cost |
|---|---|---|---|
| **NOW** (Oct 2026) | 0 | Software runs today: ROM on a real DMG, chip logic, kagiboy app, SODAX swaps. Waitlist live. Colosseum submission | ~$0 |
| **Q4 2026** | 1 | Dev-board cartridge (Pico 2 W + SE050 kit + LIS3DH) signs devnet/Sepolia on a real DMG. Power numbers published. Trademark clearance starts. Waitlist survey | $1k–2k |
| **Q1 2027** | 2 | Custom PCB Rev A, 10 boards. Signed firmware, Bluetooth pairing, CONFIRM button, link-cable backup. Refundable deposits open | $5k–10k |
| **THEN** (Q2–Q3 2027) | 3 | Rev B, clear-signing decoders, reproducible builds, two external audits with the report published | $60k–150k |
| **THEN** (about Q3 2027 at the earliest) | 4 | FCC/CE/Japan certification, mold, provisioning, final name. **500 numbered units ship** | $40k–80k + batch inventory (~$16k) |

**Funding need: $300,000**, which covers about 12 months:

| Use | Amount (estimate) |
|---|---|
| Hard costs of Phases 1–4 (mid-range of the ROADMAP estimate) | $185k |
| Contract hardware and firmware engineering (part time, 9 months) | $80k |
| Trademark, legal, company setup | $20k |
| Buffer | $15k |

**Sources.** The Colosseum accelerator invests $250k in accepted teams ([Colosseum](https://colosseum.com/accelerator)). Ecosystem grants and partner programs would cover the rest, and the refundable deposits would cover first-batch inventory. We are not asking for a large round. The first batch is the test, and the second batch decides whether this becomes a company.

## 8. Risks and mitigations

| Risk | How bad | Mitigation |
|---|---|---|
| **Nintendo trademark.** Nintendo successfully opposed GOLFBOY under GAME BOY ([USPTO](https://www.uspto.gov/news/og/2007/week48/pattab1.htm)). A "-boy" name in Class 9 is risky | High | "kagiboy" stays a codename until a clearance opinion. A shortlist of fallback names, cleared in US/EU/JP, is ready before deposits open. No Nintendo marks and an original shell design. Product copy says "compatible with" only, and the non-affiliation notice stays. The boot-logo bytes rely on interoperability precedent ([Sega v. Accolade](https://en.wikipedia.org/wiki/Sega_v._Accolade)). That is US law and not a guarantee |
| **Selling before a security review** | High | Nothing ships until two external audits are done, no critical or high findings are open and the report is public. Bug bounty from Phase 3. Open-source ROM, firmware and schematics |
| **Untrusted Game Boy display.** A modded console or an FPGA clone can show something else, fake button presses, or sniff the bus | Medium–High | Signing needs the cartridge's own CONFIRM button. The cartridge sends its own summary to the phone, and both screens show the same check code. The DMG bundle ships a console checked as unmodified. Written guidance: use your own original console |
| **Physical attacks** (fault injection on the RP2350, MCU-to-SE bus sniffing) | Medium | Keys sit only in the SE050. RP2350 A4 stepping with BOOTSEL disabled. Encrypted SCP03 channel to the SE. Epoxy potting. Genuine check against the SE050's attestation key ([ROADMAP threat table](ROADMAP.md#threat-model)) |
| **SE050 supply** (the E2 variant, long lead times) | Medium | Buy secure elements for the first batch as soon as Phase 2 is done. SE050C1/C2 also support both curves as a fallback. SE051 is evaluated in Phase 3 |
| **Regulation.** The device is non-custodial, but earning swap fees may count as intermediating crypto trades in some places (for example, Japan's Payment Services Act). Encryption export rules also apply | Medium | Legal opinion before swaps go live on mainnet. Swaps can be turned off by region. Export classification as a mass-market encryption product. Japan sales are hardware only until the opinion is in |
| **Certification** (antenna inside the console slot, power draw on a DMG) | Medium | Pre-certified RM2 module. Power and RF are the Phase 1 and 2 exit criteria. Japan module approval is checked before the batch is committed |
| **Demand.** It is a novelty, Keyp's cartridge didn't scale, and hardware wallets are a crowded category | Medium | Small, numbered, deposit-backed batches. Nothing is built ahead of demand. The low case loses about $157k, which the funding covers |
| **Swap revenue lower than modelled** | Low | The plan doesn't depend on it |
| **Supply of DMGs for the bundle** | Low | Bundles are capped at 10% of the mix. Sourced in Japan |

## 9. The summary for a judge

- **Product:** a secure-element hardware wallet in an original Game Boy cartridge, for Solana and EVM. Software is working today. Hardware is next.
- **Price:** $129 standard, $169 limited, ¥24,800 Japan edition, $279 with a refurbished DMG.
- **Unit cost:** about $31 landed at 500 units, $24 at 2,000 and $18 at 10,000. The one-off cost to a sellable product is about $163k, mostly the security audits.
- **Year 1 of sales:** 3,000 units in the base case, $468k revenue, about $59k left after one-off costs and opex (before salaries).
- **Swaps:** a 0.1% partner fee through SODAX. Small at first, but it recurs as more cartridges are in use.
- **Ask:** $300k to reach an audited, certified first batch of 500. That's about 9 to 12 months from now.
