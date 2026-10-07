---
name: kagiboy
description: Your crypto keys, in a Game Boy cartridge. Every approval prints as a pastel thermal slip.
colors:
  ink: "#1f2330"
  ink-2: "#535a6d"
  ink-3: "#666c80"
  print-ink: "#2b2f3a"
  line: "rgba(31, 35, 48, 0.12)"
  printer-bed: "#ffffff"
  haze-blue: "#cfe2ff"
  haze-blush: "#ffdce8"
  haze-lavender: "#e6e0ff"
  paper-blue: "#dbe9ff"
  paper-pink: "#ffe3ec"
  paper-lavender: "#ece7ff"
  focus: "#8fb2ff"
  live-pink: "#ff6f91"
  status-error: "#b8304f"
  status-pending: "#9a6400"
  status-ok: "#2f7a52"
typography:
  display:
    fontFamily: "Funnel Display, Funnel Sans, system-ui, sans-serif"
    fontSize: "clamp(46px, 5.8vw, 86px)"
    fontWeight: 560
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Funnel Display, Funnel Sans, system-ui, sans-serif"
    fontSize: "clamp(34px, 3.9vw, 58px)"
    fontWeight: 560
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Funnel Display, Funnel Sans, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 560
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Funnel Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  lede:
    fontFamily: "Funnel Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.55
  print:
    fontFamily: "Pixel Operator, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0"
  label:
    fontFamily: "Funnel Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  field: "10px"
  input: "12px"
  card: "20px"
  render: "32px"
  pill: "999px"
spacing:
  gutter: "clamp(20px, 5vw, 72px)"
  section-top: "clamp(110px, 16vh, 180px)"
  head-gap: "clamp(44px, 6vh, 72px)"
  strip-gap: "22px"
  actions-gap: "12px"
components:
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.printer-bed}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-paper:
    backgroundColor: "rgba(255, 255, 255, 0.86)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "50px"
  button-sm:
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "38px"
  thermal-strip:
    backgroundColor: "{colors.paper-blue}"
    textColor: "{colors.print-ink}"
    typography: "{typography.print}"
    padding: "2px 14px 6px"
  receipt:
    backgroundColor: "{colors.printer-bed}"
    textColor: "{colors.print-ink}"
    typography: "{typography.print}"
    padding: "4px 24px 12px"
  ticket:
    backgroundColor: "{colors.paper-blue}"
    textColor: "{colors.print-ink}"
    padding: "4px 26px 14px"
    width: "min(360px, 88vw)"
  ticket-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0"
    height: "44px"
  road-step:
    backgroundColor: "{colors.printer-bed}"
    textColor: "{colors.ink}"
    padding: "22px 20px 26px"
  road-step-now:
    backgroundColor: "{colors.paper-pink}"
  app-card:
    backgroundColor: "{colors.printer-bed}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  app-input:
    backgroundColor: "{colors.printer-bed}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "10px 12px"
  nav:
    backgroundColor: "rgba(255, 255, 255, 0.62)"
    textColor: "{colors.ink-2}"
    padding: "14px clamp(20px, 5vw, 72px)"
---

# Design System: kagiboy

## Overview

**Creative North Star: "The Printer Bed"**

The white page is the bed of a Game Boy Printer. Everything the cartridge approves comes out as a soft pastel thermal slip: white, baby blue, blush or lavender sticker paper with zig-zag tear edges, carrying a 4-shade dithered print of the real ROM screen and a pixel-type stamp. Around the paper, the page is calm, Apple-quiet white with a faint pastel haze. There is exactly one live, lit window: the 3D Game Boy (GLB) running the real ROM. Everything else is quiet paper and ink.

Density is low and unhurried. Sections open with a short display headline and one grey lede, then hand over to a single dominant artifact (a rail of strips, one long receipt, one exploded render with a parts receipt, a row of tear-off roadmap segments, one waitlist ticket). Motion is the print head: paper feeds out in small stepped increments, never glides. The demo carries the same world into a working rig: the Game Boy beside a pastel companion phone, joined by a pixel-type Bluetooth tape.

The system rejects dark surfaces, green brand color, CSS imitations of the hardware (real renders and the real GLB only), and the wallet-site hero-plus-feature-grid.

**Key Characteristics:**
- White printer bed with radial pastel haze (blue, blush, lavender) behind the hero and waitlist only.
- Thermal paper as the content container: torn zig-zag top and bottom edges, edge-following drop shadow.
- Two voices: Funnel Display/Sans for the page, Pixel Operator uppercase for anything the cartridge "printed".
- Real raster evidence: dithered ROM prints rendered `pixelated`, Blender renders in large rounded tiles.
- Stepped "feed" motion, with a static path under reduced motion.

## Colors

A white-and-charcoal page tinted only by three pastel papers; colour arrives as paper stock, not as accents.

### Primary
- **Soft Charcoal Ink** (ink): page text, headings, primary pill buttons, the rail line and callout leaders. It is the only strong value on the page.
- **Thermal Print Ink** (print-ink): the slightly warmer charcoal used for every pixel-type stamp, receipt line and ticket number. Reserved for printed matter.

### Secondary
- **Baby Blue Haze** (haze-blue), **Blush Haze** (haze-blush), **Lavender Haze** (haze-lavender): the three gradient tints. Used as large soft radial blobs behind the hero stage and waitlist, the blue-to-pink "next step" and confirm callouts in the demo, and selection colour (blush).
- **Blue Paper** (paper-blue), **Pink Paper** (paper-pink), **Lavender Paper** (paper-lavender): the slightly lighter paper stocks the strips, ticket, ghost slip and current roadmap step are cut from. Paper is always a flat stock; gradients live on haze, never on paper.

### Tertiary
- **Live Pink** (live-pink): the pulsing 8px dot that marks the single live thing (the running ROM). One per screen.
- **Status Error / Pending / OK** (status-error, status-pending, status-ok): text-only transaction states in the demo activity list and form validation. `status-ok` also appears as the small "Cartridge linked" dot. Status colours are never fills, papers or brand colour.

### Neutral
- **Printer Bed White** (printer-bed): every page background and the white paper stock.
- **Secondary Ink** (ink-2): ledes, captions, nav links, card meta.
- **Tertiary Ink** (ink-3): smallest notes, placeholders, scroll hint (5.1:1 on white; do not go lighter).
- **Hairline** (line): nav bottom border, footer rule, paper-button border, input border.
- **Focus Blue** (focus): 3px focus outline with 3px offset everywhere.

### Named Rules
**The Paper Stock Rule.** Pastels are paper or haze, never text, icon or border colour. Text on any paper is charcoal ink.

**The One Live Window Rule.** Only the Game Boy screen is lit and animated continuously; the live-pink dot is the only colour that pulses.

**The Status Is Not Brand Rule.** Green, amber and red appear only as transaction-state text and the link dot. No green surfaces, buttons or haze.

## Typography

**Display Font:** Funnel Display (with Funnel Sans, system-ui)
**Body Font:** Funnel Sans (with system-ui)
**Label/Mono Font:** Pixel Operator 8 (self-hosted at /fonts/PixelOperator8.ttf, with ui-monospace)

**Character:** A soft, slightly rounded grotesk at a medium 560 weight with tight negative tracking carries the calm Apple-like voice; a hard, unsmoothed 8-pixel face carries the cartridge's voice. The two never mix inside one line of prose.

### Hierarchy
- **Display** (560, clamp(46px, 5.8vw, 86px), 0.98, -0.035em): the one hero headline per page; 40px on mobile. Demo uses clamp(40px, 4.4vw, 64px).
- **Headline** (560, clamp(34px, 3.9vw, 58px), 1.02, -0.03em): one per section, balanced wrap, two lines typical.
- **Title** (560, 21px, -0.01em): sub-heads beside an artifact (e.g. "Limits, stated plainly").
- **Lede** (400, 19-20px, ink-2): one paragraph under a headline, max ~30-44rem.
- **Body** (400, 18px / 17px under 860px, 1.55): running text, pretty wrap.
- **Label** (400, 13-15px, ink-2/ink-3): captions under strips, callout cards, footer, live note.
- **Print** (Pixel Operator, 16px, 1.25, uppercase, no smoothing): stamps, receipts, ticket fields, BOM, demo "NEXT"/"BLUETOOTH" tape labels. Sizes step to 24px (totals, rejected slip) and 32px (ticket number) only.

### Named Rules
**The Printed Voice Rule.** Pixel type means "the cartridge produced this". Use it on paper and on hardware-adjacent tape, never for page headings, buttons or navigation.

**The Pixel Integrity Rule.** Pixel Operator is always uppercase, letter-spacing 0, font smoothing off, and dithered prints use `image-rendering: pixelated`. Never scale prints with smoothing.

## Layout

Content sits in a centred column (max 1360px landing, 1320px demo) with a fluid gutter (clamp(20px, 5vw, 72px)). Sections open with clamp(110px, 16vh, 180px) of top space and a heading block (max 44rem) followed by clamp(44px, 6vh, 72px) before the artifact. Each section shows one dominant artifact, laid out asymmetrically: a horizontal scroll-snapped rail of strips hung under a 2px ink line with even strips dropped 28px; a three-column receipt layout (ghost slip, receipt, limits); render 1.25fr beside a sticky receipt; a 4-up roadmap; a centred ticket.

The landing opens with a 560vh sticky 3D stage: copy chapters pinned left at the vertical centre, hero actions in a right-hand column, the Game Boy centred, slips feeding out of its lower edge. Under 860px, chapters dock to the bottom of the viewport over a white-to-transparent scrim, side columns collapse to one, the roadmap goes 2-up, the rail strips become 66vw cards bleeding past the gutter, and secondary nav links hide (the primary pill stays). Under reduced motion the stage collapses to one viewport with only the hero chapter.

## Elevation & Depth

Depth is soft, cool and diffuse, tinted toward blue-violet (rgba(60-70, 70-76, 120-128)), never neutral grey and never hard-edged. Paper floats via `filter: drop-shadow` so the shadow follows the torn edge; app chrome and images use large negative-spread box shadows that read as a soft pool under the object. The nav is frosted glass.

### Shadow Vocabulary
- **Paper lift** (`filter: drop-shadow(0 14px 22px rgba(70,76,128,0.12)) drop-shadow(0 2px 3px rgba(70,76,128,0.08))`): every strip, slip, receipt, BOM, ticket and road step.
- **Render pool** (`box-shadow: 0 30px 60px -40px rgba(60,70,120,0.45)`): large rounded render tiles.
- **Ink button** (`box-shadow: 0 8px 22px -10px rgba(31,35,48,0.55)`, hover `0 14px 30px -12px`): the primary pill only.
- **Paper button** (`box-shadow: 0 6px 18px -12px rgba(60,70,120,0.35)`).
- **App card** (`box-shadow: 0 1px 0 rgba(31,35,48,0.04), 0 10px 24px -18px rgba(60,70,120,0.45)`): demo phone cards and list rows.
- **Frosted nav** (`background: rgba(255,255,255,0.62); backdrop-filter: blur(14px) saturate(1.4)`).

### Named Rules
**The Torn Edge Shadow Rule.** Anything cut from thermal paper takes a drop-shadow filter, never a box-shadow; a box-shadow would draw a rectangle under a zig-zag edge.

## Shapes

Two form families. Paper is rectangular with square corners and a 7px zig-zag perforation masked into its top and bottom edges; internal divisions are 2px dashed (sections) or 2px dotted (leader lines, input underlines) in print-ink at ~0.3 alpha, with a 2px solid rule only for totals. Everything that is not paper is soft: pill buttons and segmented controls (999px), app cards (20px), inputs (12px), small fields (10px), render tiles (32px), and the device phone shell (52px outer, 42px screen). Focus rings follow a 10px radius.

## Components

### Buttons
Calm, weighty pills that lift by one pixel.
- **Shape:** full pill (999px), 50px tall, 24px side padding; small variant 38px / 16px / 15px text.
- **Ink (primary):** charcoal fill, white 560 17px Funnel Sans, ink shadow. One per view region.
- **Paper (secondary):** 86% white over haze, hairline border, paper-button shadow.
- **Hover / Active / Disabled:** translateY(-1px) with deepened shadow over 0.35s on the expo-out ease; active scales to 0.985; disabled 45% opacity, no lift.
- **Text link:** inherited colour, underline offset 3px (demo "Sound on").

### Thermal Strip
The signature container. Flat paper stock, zig-zag edges, paper-lift shadow, a pixelated ROM print, then a stamp block under a dashed rule in pixel type (step and count, e.g. STEP 2 OF 3 / 12 WORDS). A grey Funnel Sans caption sits under the paper, off the strip. Stocks rotate blue, white, pink, lavender.

### Receipt
One long white paper: centred pixel title over a dashed rule, label-dots-value rows with dotted leaders, centred footer over a dashed rule. Used for security facts and the parts BOM (BOM adds a 2px solid total rule at 24px and sits sticky at top: 120px).

### Ghost Slip
An unlit or refused state printed as a faint lavender slip rotated -5deg, pixel text at 62% ink, headline struck through. Hidden on mobile.

### Ticket (waitlist form)
Blue paper, centred: faded header, large pixel ticket number (35% opacity when blank), left-aligned faded field label, a borderless input with a 2px dotted underline that turns solid ink on focus and error-red when invalid, and an ink pill submit.

### Road Step
Tear-off white paper segments in a 4-up row; the current step is pink paper. Pixel-type timeframe, title, short grey line.

### Slip and Callouts (3D stage)
Slips feed out of the Game Boy's bottom edge, clip-revealed by scroll progress. Callouts mark parts on the model with a 10px white dot ringed in 2px ink, a 1px ink elbow leader, and a frosted white card (14px radius, 13px grey text, pixel-type part name); alternate callouts flip left.

### Navigation
Fixed frosted bar, lowercase "kagiboy" wordmark (Funnel Display 640, 23px, -0.03em) left, 15px ink-2 links that darken on hover, ink small pill as the trailing action. Mobile keeps wordmark and pill only. The demo nav swaps links for a 14px network note.

### Companion Phone (demo)
Pearl-gradient device shell with a white screen; cards are white washed toward blue (Solana) or blush (EVM) at 150deg, display-face tabular amounts at 30px, 10px-radius grey address chips with monospace code, ink mini-pills for actions, a pill segmented control, 12px-radius inputs with a 2px focus outline, and a blue-to-blush confirm callout. Activity rows are white 14px-radius rows with status-coloured state text.

### Bus Tape (demo)
Pixel-type monospaced rows logging Bluetooth traffic between Game Boy and phone, response rows and idle state at reduced opacity, under a dashed pixel "BLUETOOTH" label.

## Do's and Don'ts

### Do:
- **Do** put content that the cartridge produced on thermal paper in Pixel Operator, uppercase, in print-ink.
- **Do** use the four paper stocks (white, blue #dbe9ff, pink #ffe3ec, lavender #ece7ff) as flat fills and rotate them across a set.
- **Do** float paper with the drop-shadow filter and keep shadows blue-violet tinted and diffuse.
- **Do** reveal paper with the stepped print-head feed (`steps(26)`, 1.5s, 0.14s stagger) and give it a static path under `prefers-reduced-motion`.
- **Do** use real evidence only: dithered prints generated from real ROM screens, Blender renders, and the GLB; render prints `pixelated`.
- **Do** keep one ink pill per action group and pair it with a paper pill for the alternative.
- **Do** keep ink-3 (#666c80) as the lightest text value on white or paper.

### Don't:
- **Don't** use dark backgrounds or green as a brand, surface or button colour.
- **Don't** imitate the Game Boy or cartridge in CSS; show the render or the live model.
- **Don't** set headings, buttons or nav in pixel type, or smooth/scale the pixel font.
- **Don't** apply gradients to paper stock or pastel colour to text.
- **Don't** add a second lit or colour-pulsing element beside the live Game Boy screen and its live-pink dot.
- **Don't** lay sections out as a grid of feature cards; give each section one dominant artifact.
- **Don't** put a box-shadow on torn-edge paper.
