import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import brand from "../../../brand.json";
import "./landing.css";

// Real screenshots from the ROM (regenerate with `pnpm smoke` after ROM UI changes).
const HERO_SCREENS = ["/screens/home.png", "/screens/qr.png", "/screens/sign.png", "/screens/confirmed.png"];

const STEPS = [
  {
    img: "/screens/mash.png",
    title: "Mash, then shake",
    body: "Setup asks you to mash buttons and shake the console. The timing and motion are mixed into the secure chip's own random number generator.",
  },
  {
    img: "/screens/words.png",
    title: "Write down 12 words",
    body: "Your backup appears once, on the Game Boy. It never touches your phone or the internet, and it restores into any standard wallet.",
  },
  {
    img: "/screens/qr.png",
    title: "Receive with a QR code",
    body: "Your Solana and Ethereum addresses show as QR codes on the Game Boy screen. Scan them straight off the console, so a hacked phone can't swap them.",
  },
  {
    img: "/screens/sign.png",
    title: "Approve on the Game Boy",
    body: "Your phone prepares the transaction. The cartridge decodes it and shows the real amount and address. Hold A to sign, press B to refuse.",
  },
];

const SECURITY = [
  ["Keys never leave the chip", "An NXP SE050 secure element creates your seed and signs inside itself. Plugging the cartridge into a reader gets a thief nothing."],
  ["Five wrong PINs and it wipes", "The retry counter lives inside the secure element, so reflashing the cartridge doesn't reset it."],
  ["What you see is what you sign", "The phone can ask, but only the A button approves. The cartridge freezes each transaction, shows the exact amount, fee and network, and signs exactly those bytes. Anything it can't show you, it refuses."],
  ["Bluetooth carries nothing secret", "Unsigned transactions go in and signatures come out. Someone listening learns what you sent, not how to sign."],
];

const PARTS = [
  ["RP2350", "Talks to the Game Boy over the cartridge bus"],
  ["NXP SE050C", "Holds the keys; signs Solana (Ed25519) and EVM (secp256k1)"],
  ["CYW43439", "Bluetooth LE to your phone"],
  ["LIS3DH", "Accelerometer for shake-to-generate"],
];

export function Landing() {
  const [screen, setScreen] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setScreen((i) => (i + 1) % HERO_SCREENS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="lp">
      <nav className="lp-nav">
        <Link to="/" className="brand">
          {brand.name}
        </Link>
        <div className="lp-links">
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
          <a href="#hardware">Hardware</a>
          <Link to="/demo" className="primary small">
            Live demo
          </Link>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-hero-text">
          <p className="eyebrow">Hardware wallet · Solana + EVM</p>
          <h1>Your crypto keys, in a Game Boy cartridge.</h1>
          <p className="lede">
            {brand.name} turns the original Game Boy into a hardware wallet. A secure chip in the cartridge holds your keys,
            and you approve every transaction on a screen your phone can't touch.
          </p>
          <div className="lp-ctas">
            <Link to="/demo" className="primary">
              Try the live demo
            </Link>
            <a href="#how" className="ghost">
              See how it works
            </a>
          </div>
          <p className="fine">The demo runs the real Game Boy software in your browser and signs real testnet transactions.</p>
        </div>
        <div className="lp-hero-art" aria-hidden>
          <div className="mini-cart">
            <span>{brand.name}</span>
          </div>
          <div className="mini-gb">
            <div className="mini-bezel">
              <span className="mini-led" />
              {HERO_SCREENS.map((src, i) => (
                <img key={src} src={src} alt="" className={i === screen ? "on" : ""} width={320} height={288} />
              ))}
            </div>
            <div className="mini-controls">
              <span className="mini-dpad" />
              <span className="mini-ab">
                <i />
                <i />
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="lp-why">
        <article>
          <h3>A screen your phone can't touch</h3>
          <p>
            A Game Boy has no internet, no app store and no browser. Everything on its screen comes from the cartridge, which
            makes it a good place to check a transaction before you sign it.
          </p>
        </article>
        <article>
          <h3>Old hardware, new job</h3>
          <p>Millions of original Game Boys still work. Plug in the cartridge and one of them guards your wallet.</p>
        </article>
        <article>
          <h3>A wallet you won't lose in a drawer</h3>
          <p>Hardware wallets are easy to forget. This one sits in a console you already care about, and it's fun to use.</p>
        </article>
      </section>

      <section id="how" className="lp-section">
        <h2>How it works</h2>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <div className="lp-shot">
                <img src={s.img} alt={`Game Boy screen: ${s.title}`} width={320} height={288} />
              </div>
              <span className="num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="security" className="lp-section">
        <h2>Security model</h2>
        <div className="lp-grid">
          {SECURITY.map(([t, b]) => (
            <article key={t}>
              <h3>{t}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
        <p className="lp-note">
          Known limits, stated plainly: the cartridge's main chip has published glitch attacks, which is why keys live in the
          separate secure element. A modified Game Boy could fake button presses, so possession plus your PIN is the bar.
          Nothing goes on sale before an external security review.
        </p>
      </section>

      <section id="hardware" className="lp-section">
        <h2>What's in the cartridge</h2>
        <div className="lp-hw">
          <ul className="lp-parts">
            {PARTS.map(([p, d]) => (
              <li key={p}>
                <strong>{p}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <div className="lp-cost">
            <div className="big">$14</div>
            <p>Roughly what the parts cost per cartridge at 100 units, from distributor prices. RP2040-based Game Boy flash carts already prove the bus side works.</p>
          </div>
        </div>

        <h3 className="lp-sub">Roadmap</h3>
        <ol className="lp-road">
          <li className="done">
            <b>Now</b> Game Boy software, chip logic and phone app, running on testnets.
          </li>
          <li>
            <b>Weeks 1–2</b> Dev board: Pico 2 W, SE050 kit and accelerometer wired to an existing flash cart.
          </li>
          <li>
            <b>Weeks 3–8</b> Custom PCB, power testing on a real DMG, signed firmware, link-cable backup between two
            cartridges.
          </li>
          <li>
            <b>Then</b> Small batch and an external security review before anyone stores real funds.
          </li>
        </ol>
      </section>

      <section className="lp-final">
        <h2>Press START.</h2>
        <p>Make a wallet, receive with a QR code and sign a devnet transaction, all on an emulated Game Boy.</p>
        <Link to="/demo" className="primary">
          Open the live demo
        </Link>
      </section>

      <footer className="lp-foot">
        <span>
          {brand.name} is a Colosseum hackathon project. The cartridge is a design; the demo uses Solana devnet and
          Ethereum Sepolia only.
        </span>
        <span>Not affiliated with Nintendo. Game Boy is a trademark of Nintendo.</span>
      </footer>
    </div>
  );
}
