# kagiboy — visual plan

Budget: **42.96 credits**. Rule: draft every shot cheaply first, only pay for
finals once the composition is right, and keep one cartridge image as the
reference for everything else so the product looks the same in every shot.

## Look

- **Scene palette:** warm white `#FBFAF8`, pastel blue `#CFE2FF`, blush pink
  `#FFDCE8`, lavender haze `#E6E0FF`. Soft daylight, long gentle shadows, no
  neon, no dark backgrounds.
- **The cartridge:** pearl-white plastic shell (matte, faint sheen). The label is
  a soft gradient from baby blue to blush pink, a small white pixel key icon,
  **KAGIBOY** in a bold rounded geometric typeface, and small `SOL · EVM` below.
- **The console:** an original grey Game Boy (DMG) for instant recognition, with
  **no logos or text on it** (avoids Nintendo marks and AI-garbled lettering).
- **Screens:** AI can't draw our UI legibly, so screens are left as a plain
  softly lit green panel. Real ROM screenshots are composited on the site.

## Models

| Use | Model | Why | Cost |
|---|---|---|---|
| Drafts | GPT Image 2, low, 1K | Cheap test of composition and prompt | 0.5 |
| Shots with readable text (label, box) | GPT Image 2, high, 2K | Best at exact lettering; can render transparent backgrounds | 6.5 |
| Scenes that must match the hero cartridge | Nano Banana Pro, 2K | Takes up to 14 reference images, so the cartridge stays identical | 2 |
| One motion clip (optional) | Kling 3.0, 5 s | Image-to-video, a third of Seedance's price | 8.75 |

The 3D Game Boy on the site is built in the browser (three.js) with the real
ROM running on its screen, so it costs no credits.

## Shots

| # | Shot | Model | Final cost | Used on the site |
|---|---|---|---|---|
| 1 | Hero cartridge, three-quarter view, transparent background | GPT Image 2 high 2K | 6.5 | Hero, label close-ups, reference for 3–7 |
| 2 | Exploded cartridge: shell, PCB, chips floating apart | GPT Image 2 high 2K | 6.5 | "What's inside" |
| 3 | Game Boy with the cartridge on a pastel desk, phone beside it | Nano Banana Pro 2K | 2 | Lifestyle section |
| 4 | Hands holding the Game Boy, thumb on A | Nano Banana Pro 2K | 2 | "Hold A to sign" |
| 5 | Two Game Boys joined by a link cable | Nano Banana Pro 2K | 2 | Backup / roadmap |
| 6 | Retail box with the cartridge | GPT Image 2 medium 2K | 2 | Closing section |
| 7 | Macro: the label and the cartridge's top edge | Nano Banana Pro 2K | 2 | Detail strip |
| | **Finals** | | **23** | |
| | Drafts (7 × 0.5) | | 3.5 | |
| | Retry buffer | | ~7.75 | |
| 8 | *Optional:* Kling clip from shot 3, slow push-in | Kling 3.0 5 s | 8.75 | Hero background loop |
| | **Total with clip** | | **~43** | |

Order: draft 1 → final 1 → use it as the reference for drafts 3–7 → finals.
Decide on the clip only after the stills are in.

## Prompts

**1 — hero cartridge**
> Studio product photograph of a single retro handheld game cartridge, the
> classic 1989 Game Boy cartridge shape with the notched top-right corner and
> ridged grip at the bottom. Pearl-white matte plastic shell with a subtle soft
> sheen. The front label is a smooth gradient from baby blue (#CFE2FF) to blush
> pink (#FFDCE8), with a small white pixel-art key icon at the top left, the
> word "KAGIBOY" in a bold rounded geometric sans-serif in white, and small text
> "SOL · EVM" underneath. Three-quarter view from slightly above, soft diffused
> daylight from the top left, gentle contact shadow. Transparent background. No
> other text, no logos, no Nintendo branding. Clean, premium, calm, Apple-style
> product photography.
> *(transparent background, 3:2)*

**2 — exploded view**
> Exploded-view product render of the same pearl-white handheld game cartridge
> with the pastel blue-to-pink "KAGIBOY" label: the front shell, a thin green
> circuit board and the back shell float apart in a vertical stack with even
> gaps. On the circuit board: one small square microcontroller, one small
> secure-element chip, one tiny Bluetooth module with a printed antenna trace,
> one tiny accelerometer chip, and gold edge-connector pins along the bottom.
> Soft studio light, very soft shadows, transparent background. No text on the
> chips, no logos. Calm, precise, Apple-style technical product render.
> *(transparent background, 2:3)*

**3 — on the desk** *(reference: shot 1)*
> Lifestyle product photo. An original grey Game Boy handheld (1989 model, with
> no logos or text on it) lies on a warm white desk with the cartridge from the
> reference image half inserted in the top slot, label facing the camera. A
> modern phone lies beside it showing a soft pastel screen. Morning daylight
> through a window, long soft shadows, a pastel blue and blush pink linen cloth,
> a small ceramic cup. Shallow depth of field, calm and airy, editorial,
> soothing. The Game Boy screen is a plain softly lit green panel.
> *(16:9)*

**4 — hold A** *(reference: shot 1)*
> Close-up of two hands holding an original grey Game Boy handheld (no logos or
> text on it) with the cartridge from the reference image in the slot, the right
> thumb resting on the A button. Soft natural light, pastel blue to blush pink
> blurred background, warm skin tones, clean nails. The screen is a plain softly
> lit green panel. Calm, intimate, premium, Apple-style.
> *(4:5)*

**5 — link cable** *(reference: shot 1)*
> Two original grey Game Boy handhelds (no logos or text on them) side by side on
> a warm white surface, joined by a short grey link cable, each with the
> cartridge from the reference image inserted. Top-down view, soft daylight,
> generous negative space, pastel lavender shadows. Screens are plain softly lit
> green panels. Minimal, calm, symmetrical.
> *(16:9)*

**6 — retail box** *(reference: shot 1)*
> Minimal premium retail box for the cartridge from the reference image: a
> pearl-white box with a soft baby-blue to blush-pink gradient band, the word
> "kagiboy" in lowercase bold rounded sans-serif, and the cartridge shown in a
> clear window. The box stands next to the bare cartridge on a warm white
> surface, soft daylight, gentle shadow. No other text. Apple-style packaging
> photography.
> *(4:3)*

**7 — label macro** *(reference: shot 1)*
> Extreme macro photograph of the top edge and label of the cartridge in the
> reference image: the pastel gradient label, the bold rounded "KAGIBOY"
> lettering, the fine texture of the pearl plastic, a sliver of the ridged edge.
> Very shallow depth of field, soft daylight, dreamy and calm.
> *(3:2)*

**8 — optional clip** *(start image: shot 3)*
> Very slow cinematic push-in toward the Game Boy and cartridge, sunlight
> gently shifting across the desk, a light curtain moving softly. No new
> objects, nothing else moves.
