import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Waitlist } from "./Waitlist";
import { CircuitBoard, Cpu, Gamepad2, PackageCheck } from "lucide-react";
import { Timeline, type TimelineStep } from "../site/ui/timeline";
import { Comparison } from "../site/ui/comparison";
import { Accordion } from "../site/ui/accordion";
import "../site/tw.css";
import "./landing.css";

gsap.registerPlugin(ScrollTrigger);

// windows of the stage's scroll progress in which each chapter's copy shows
const CHAPTERS = [
  { id: "hero", from: -1, to: 0.13 },
  { id: "insert", from: 0.2, to: 0.37 },
  { id: "apart", from: 0.45, to: 0.62 },
  { id: "sign", from: 0.74, to: 2 },
] as const;

// dy nudges each card off its neighbours (px); flip reads to the left of the chip
const CALLOUTS = [
  { part: "SecureElement", name: "SE050C", note: "Secure element. The keys live and sign in here.", dy: -34, flip: false },
  { part: "MCU", name: "RP2350", note: "Talks to the Game Boy over the cartridge bus.", dy: -46, flip: true },
  { part: "BLE", name: "CYW43439", note: "Bluetooth to your phone. Public data only.", dy: 30, flip: false },
  { part: "Accel", name: "LIS3DH", note: "Turns a shake into randomness.", dy: 34, flip: true },
] as const;

const STEPS = [
  { print: "mash", paper: "blue", stamp: ["STEP 1 OF 3", "MASH + SHAKE"], caption: "Mash buttons, then shake it. The chip mixes your noise into its own randomness." },
  { print: "words", paper: "white", stamp: ["STEP 2 OF 3", "12 WORDS", "SAMPLE WALLET"], caption: "Your backup appears once, on the Game Boy, and nowhere else." },
  { print: "pin", paper: "pink", stamp: ["STEP 3 OF 3", "PIN", "5 TRIES, THEN WIPE"], caption: "Pick a PIN. Five wrong tries and the chip erases the keys." },
  { print: "qr", paper: "lavender", stamp: ["RECEIVE", "SCAN IT OFF", "THE SCREEN"], caption: "Your address as a QR code, drawn by the cartridge, not the phone." },
  { print: "sign", paper: "pink", stamp: ["APPROVE", "HOLD A", "1 SECOND"], caption: "The real amount, fee and address. Hold A to sign, B to refuse." },
  { print: "confirmed", paper: "blue", stamp: ["SIGNED", "SENT TO", "YOUR PHONE"], caption: "The signature goes to the phone, which broadcasts it." },
] as const;

const PROMISES = [
  ["KEYS", "NEVER LEAVE THE CHIP"],
  ["SCREEN", "ONLY THE CARTRIDGE DRAWS"],
  ["SIGNS", "EXACTLY WHAT IT SHOWS"],
  ["REFUSES", "WHAT IT CAN'T SHOW"],
  ["PIN", "5 TRIES, THEN WIPE"],
  ["EVM", "5 NETWORKS, NAMED ON SCREEN"],
  ["BLUETOOTH", "PUBLIC DATA ONLY"],
] as const;

const BOM = [
  ["RP2350", "TALKS TO GAME BOY"],
  ["NXP SE050", "HOLDS KEYS"],
  ["CYW43439", "PHONE LINK"],
  ["LIS3DH", "SHAKE = RNG"],
  ["LEVEL SHIFTERS", "5V <> 3V3"],
  ["4MB FLASH", "FIRMWARE"],
] as const;

const ROADMAP: TimelineStep[] = [
  { when: "NOW", title: "The software runs", body: "Game Boy software, the chip's logic and the phone app, working end to end on test networks.", icon: Gamepad2, now: true },
  { when: "Q4 2026", title: "Dev board", body: "Pico 2 W, an SE050 kit and the accelerometer, wired to a flash cart in a real Game Boy.", icon: Cpu },
  { when: "Q1 2027", title: "The real cartridge", body: "Custom PCB, power tests on a real DMG, signed firmware and link-cable backup.", icon: CircuitBoard },
  { when: "THEN", title: "First batch", body: "A small numbered batch, and an outside security review before it holds real funds.", icon: PackageCheck },
];

const COMPARE = {
  caption: "kagiboy compared with a typical hardware wallet and a phone wallet",
  columns: [
    { name: "kagiboy", summary: "A cartridge for the Game Boy you already own", featured: true },
    { name: "Hardware wallet", summary: "A Ledger, a Trezor" },
    { name: "Phone wallet", summary: "Phantom, MetaMask" },
  ],
  rows: [
    { label: "Keys never touch your phone or computer", cells: [true, true, false] },
    { label: "You approve on a screen the phone can't draw on", cells: [true, true, false] },
    { label: "The screen device has no Wi-Fi and runs no apps", cells: [true, "Varies", false] },
    { label: "12 or 24 words restore it in any standard wallet", cells: [true, true, true] },
    { label: "Swaps from the companion app", cells: ["0.1% fee", "Through partners", true] },
    { label: "Outside security audit", cells: ["Before sale", true, "Varies"] },
    { label: "Something you'd keep on a shelf", cells: [true, false, false] },
  ],
};

const FAQ = [
  { id: "breaks", title: "What if my cartridge breaks?", content: "Your 12 words bring everything back, in a new kagiboy or in any regular wallet app like Phantom or MetaMask. If the Game Boy breaks, any Game Boy will do." },
  { id: "gameboy", title: "Do I need a real Game Boy?", content: "Yes, kagiboy is a cartridge for the original Game Boy. Until it ships, the live demo runs the same Game Boy software in your browser." },
  { id: "phone", title: "Can my phone move my money?", content: "No. The phone can only ask. The cartridge shows the real amount and address on the Game Boy's own screen and signs only when you hold A. Its Bluetooth carries requests and public addresses, never keys." },
  { id: "chains", title: "Which chains does it support?", content: "Solana, plus Ethereum, Base, Arbitrum, HyperEVM and Robinhood Chain. One key covers every EVM network, and the Game Boy names the network on every request." },
  { id: "swaps", title: "How do swaps work?", content: "The app gets live quotes from SODAX, and the Game Boy shows what you pay, the least you'll get and the fees before you sign. kagiboy takes 0.1% and SODAX takes 0.1%. In this demo the swap is signed but never sent." },
  { id: "buy", title: "When can I buy one?", content: "Not yet. The software works today and the hardware is in progress. Join the waitlist and you'll get one email when the first small batch is ready, after an outside security review." },
  { id: "nintendo", title: "Is this made by Nintendo?", content: "No. kagiboy is an independent project. Game Boy is a trademark of Nintendo." },
];

export function Landing() {
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const calloutRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const slipRef = useRef<HTMLDivElement>(null);
  const heroSlipRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [railAt, setRailAt] = useState(0);

  // the menu sheet locks the page underneath
  useEffect(() => {
    document.documentElement.style.overflow = menu ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    return () => {
      // leaving the page from inside the menu (e.g. "Try the live demo") must not leave the next page locked
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  useEffect(() => {
    document.documentElement.classList.add("kb-root");
    return () => document.documentElement.classList.remove("kb-root");
  }, []);

  // smooth scroll + the 3D stage
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lenis: Lenis | null = null;
    const tick = (t: number) => lenis?.raf(t * 1000);
    if (!reduced) {
      lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    // "print" elements feed out when they enter the viewport
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -12% 0px" },
    );
    document.querySelectorAll(".print-in").forEach((el) => io.observe(el));

    let disposed = false;
    let raf = 0;
    let cleanupScene = () => {};
    const stage = stageRef.current!;
    const canvas = canvasRef.current!;

    const paintChapters = (p: number) => {
      for (const c of CHAPTERS) {
        const el = chapterRefs.current[c.id];
        if (!el) continue;
        const fade = 0.035;
        const vis = Math.min(1, Math.max(0, (p - c.from) / fade), Math.max(0, (c.to - p) / fade));
        el.style.opacity = String(vis);
        el.style.transform = `translate3d(0, ${(1 - vis) * 18}px, 0)`;
        el.style.visibility = vis > 0.01 ? "visible" : "hidden";
      }
      slipRef.current?.style.setProperty("--feed", String(Math.min(1, Math.max(0, (p - 0.92) / 0.05))));
      // the hero's strip is already part-way out at rest and winds back in as you scroll
      heroSlipRef.current?.style.setProperty("--feed", String(Math.max(0, 0.42 - p * 5)));
      stage.style.setProperty("--hint", String(Math.max(0, 1 - p / 0.04)));
      stage.dataset.feed = p > 0.93 ? "1" : "0";
    };

    // measured once per layout; offsetWidth every frame would force a reflow mid-scroll
    const cardWidths = new Map<HTMLElement, number>();
    const forgetWidths = () => cardWidths.clear();
    window.addEventListener("resize", forgetWidths);
    const placeCallouts = (scene: { project(n: string): { x: number; y: number } | null }, p: number) => {
      const vis = Math.min(1, Math.max(0, (p - 0.5) / 0.03), Math.max(0, (0.62 - p) / 0.03));
      for (const c of CALLOUTS) {
        const el = calloutRefs.current[c.part];
        const at = scene.project(c.part);
        if (!el || !at) continue;
        el.style.opacity = String(vis);
        el.style.visibility = vis > 0.01 ? "visible" : "hidden";
        el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
        el.style.setProperty("--dy", `${c.dy}px`);
        // keep the card inside the 16px gutter on narrow screens; the dot stays on its chip
        if (vis > 0.01) {
          const card = el.querySelector<HTMLElement>(".callout-card");
          if (card) {
            let w = cardWidths.get(card);
            if (w === undefined) cardWidths.set(card, (w = card.offsetWidth));
            const left = c.flip ? at.x - 22 - w : at.x + 22;
            const right = window.innerWidth - 16;
            const nx = left < 16 ? 16 - left : left + w > right ? right - w - left : 0;
            card.style.translate = `${Math.round(nx)}px 0`;
          }
        }
      }
    };

    (async () => {
      const { HeroScene } = await import("./scene");
      if (disposed) return;
      let scene: InstanceType<typeof HeroScene>;
      try {
        scene = new HeroScene(canvas, { still: reduced });
      } catch {
        stage.classList.add("no-webgl");
        return;
      }
      const fit = () => {
        const r = canvas.getBoundingClientRect();
        scene.resize(r.width, r.height);
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(canvas);
      cleanupScene = () => {
        ro.disconnect();
        scene.dispose();
      };

      await scene.load("/3d/kagiboy.glb");
      if (disposed) return;
      const still = new Image();
      still.src = "/screens/home.png";
      still.onload = () => scene.setScreen(still);
      stage.classList.add("is-ready");

      const st = ScrollTrigger.create({
        trigger: stage,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (s) => scene.setProgress(s.progress),
      });

      // the real ROM, loaded after first paint so the page opens fast
      let attract: import("./attract").Attract | null = null;
      if (!reduced) {
        import("./attract").then(async ({ startAttract }) => {
          if (disposed) return;
          const a = await startAttract();
          if (disposed) return;
          attract = a;
          scene.setScreen(attract.canvas);
          attract.frameListener = () => scene.screenChanged();
        });
      }

      let last = performance.now();
      let debt = 0;
      let visible = true;
      const vis = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
      vis.observe(stage);
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = now - last;
        last = now;
        if (!visible) return; // nothing to draw once the stage has scrolled away
        if (attract) {
          debt = Math.min(debt + dt, 70);
          while (debt >= 16.74) {
            attract.step();
            debt -= 16.74;
          }
          attract.scene(scene.progress > 0.74 ? "sign" : "home");
        }
        const p = scene.frame();
        paintChapters(p);
        placeCallouts(scene, p);
        // the sign slip hangs from the console's bottom edge, centred under it
        const edge = scene.projectPoint(0, -0.0735, 0.012);
        slipRef.current?.style.setProperty("--edge-x", `${edge.x}px`);
        slipRef.current?.style.setProperty("--edge-y", `${edge.y}px`);
      };
      raf = requestAnimationFrame(loop);

      cleanupScene = () => {
        st.kill();
        vis.disconnect();
        ro.disconnect();
        scene.dispose();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanupScene();
      io.disconnect();
      gsap.ticker.remove(tick);
      lenis?.destroy();
      window.removeEventListener("resize", forgetWidths);
    };
  }, []);

  return (
    <div className="kb">
      <nav className="kb-nav" aria-label="Main">
        <Link to="/" className="kb-word" aria-label="kagiboy home">
          kagiboy
        </Link>
        <div className="kb-links">
          <a href="#setup">How it works</a>
          <a href="#security">Security</a>
          <a href="#inside">Inside</a>
          <Link to="/about">About</Link>
          <Link to="/app">App</Link>
          <Link to="/demo" className="btn btn-ink btn-sm">
            Live demo
          </Link>
        </div>
        <button className="menu-btn" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <path d="M4 9h16M4 15h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      <div className={`menu-sheet ${menu ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu">
        <header>
          <span className="kb-word">kagiboy</span>
          <button className="menu-btn" aria-label="Close menu" onClick={() => setMenu(false)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <nav aria-label="Sections" onClick={() => setMenu(false)}>
          <a href="#setup">How it works</a>
          <a href="#security">Security</a>
          <a href="#inside">Inside</a>
          <a href="#waitlist">Waitlist</a>
          <Link to="/about">About</Link>
          <Link to="/app">The app</Link>
        </nav>
        <div className="menu-actions">
          <Link to="/demo" className="btn btn-ink">
            Try the live demo
          </Link>
          <a href="#waitlist" className="btn btn-paper" onClick={() => setMenu(false)}>
            Join the waitlist
          </a>
        </div>
      </div>


      <section className="stage" ref={stageRef} aria-label="The cartridge, up close">
        <div className="stage-sticky">
          <div className="haze" aria-hidden />
          <img className="stage-still" src="/renders/hero-front34.webp" alt="" aria-hidden />
          <canvas
            className="stage-canvas"
            ref={canvasRef}
            role="img"
            aria-label="A Game Boy with the kagiboy cartridge, running the wallet"
          />

          <div className="ch ch-hero" ref={(el) => void (chapterRefs.current.hero = el)}>
            <h1>Your keys, in a Game Boy cartridge.</h1>
            <p className="lede">
              kagiboy turns the original Game Boy into a hardware wallet. Your keys live in a chip inside the cartridge, and nothing gets signed until you hold A.
            </p>
            <p className="lede-short">A hardware wallet for Solana and EVM chains. Nothing signs until you hold A.</p>
            <div className="hero-aside">
              <div className="actions">
                <Link to="/demo" className="btn btn-ink">
                  Try the live demo
                </Link>
                <a href="#waitlist" className="btn btn-paper">
                  Join the waitlist
                </a>
              </div>
              <p className="live-note">
                <span className="dot" aria-hidden /> The screen runs the real Game Boy software.
              </p>
            </div>
          </div>
          <div className="slip slip-hero" ref={heroSlipRef} aria-hidden>
            <div className="slip-paper paper-pink">
              <div className="perf" />
              <p className="px">KAGIBOY READY</p>
              <p className="px slip-scroll">
                <i aria-hidden>▼</i> SCROLL DOWN <i aria-hidden>▼</i>
              </p>
              <img src="/prints/home.png" alt="" />
            </div>
          </div>

          <div className="ch ch-insert" ref={(el) => void (chapterRefs.current.insert = el)}>
            <h2>Slide it in. Feel the click.</h2>
            <p>Any original Game Boy will do. Your keys are made inside the cartridge and never leave it.</p>
          </div>

          <div className="ch ch-apart" ref={(el) => void (chapterRefs.current.apart = el)}>
            <h2>What's under the label?</h2>
            <p>Four main chips. One keeps your keys, one talks to the Game Boy, one talks to your phone, and one turns a shake into randomness.</p>
            <ul className="chip-list">
              {CALLOUTS.map((c) => (
                <li key={c.part}>
                  <b className="px">{c.name}</b> {c.note}
                </li>
              ))}
            </ul>
          </div>
          {CALLOUTS.map((c) => (
            <div
              key={c.part}
              className={`callout ${c.flip ? "flip" : ""}`}
              ref={(el) => void (calloutRefs.current[c.part] = el)}
              aria-hidden
            >
              <span className="callout-dot" />
              <span className="callout-card">
                <b className="px">{c.name}</b>
                <span>{c.note}</span>
              </span>
            </div>
          ))}

          <div className="ch ch-sign" ref={(el) => void (chapterRefs.current.sign = el)}>
            <h2>Hold A to sign.</h2>
            <p>
              Your phone can only ask. The cartridge shows the real amount and address on the Game Boy's own screen, then
              waits for your thumb.
            </p>
          </div>
          <div className="slip slip-sign" ref={slipRef} aria-hidden>
            <div className="slip-paper paper-pink">
              <div className="perf" />
              <img src="/prints/sign.png" alt="" />
              <p className="px">APPROVED ON THE GAME BOY</p>
              <p className="px faint">0.25 SOL</p>
            </div>
          </div>

          <p className="scroll-hint" aria-hidden>
            Scroll down
          </p>
        </div>
      </section>

      <section className="origin" aria-labelledby="origin-title">
        <FleaMarketGameBoy />
        <div className="origin-copy">
        <p className="px eyebrow">HOW IT STARTED</p>
        <h2 id="origin-title">My dad found it at a flea market.</h2>
        <p>
          I was so young I didn't know what Nintendo was. The game was Super Mario Land, and I never beat it. I didn't
          care. I had the music and a whole world in my hands, at a time when the best thing on a phone was Snake.
        </p>
        <p>
          Years later I work in crypto, and holding my keys has never felt like that. So I gave the Game Boy a new job.
        </p>
        <Link to="/about" className="origin-link">
          Read the whole story <span aria-hidden>→</span>
        </Link>
        </div>
      </section>

      <section className="setup" id="setup">
        <header className="sec-head">
          <h2>Setup feels like starting a new game</h2>
          <p>Mash some buttons, give it a shake, write down your 12 words, pick a PIN. Your phone never gets to see any of it.</p>
        </header>
        <div
          className="rail"
          role="list"
          ref={railRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const max = el.scrollWidth - el.clientWidth;
            setRailAt(max > 0 ? Math.round((el.scrollLeft / max) * (STEPS.length - 1)) : 0);
          }}
        >
          {STEPS.map((s, i) => (
            <figure key={s.print} className="strip print-in" role="listitem" style={{ ["--i" as string]: i }}>
              <div className={`strip-paper paper-${s.paper}`}>
                <div className="perf" aria-hidden />
                <img
                  src={`/prints/${s.print}.png`}
                  alt={`Game Boy screen: ${s.stamp.join(", ").toLowerCase()}`}
                  loading="lazy"
                />
                <div className="stamp px">
                  {s.stamp.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
                <div className="perf bottom" aria-hidden />
              </div>
              <figcaption>{s.caption}</figcaption>
            </figure>
          ))}
        </div>
        <div className="rail-dots" aria-hidden>
          {STEPS.map((st, i) => (
            <i key={st.print} className={i === railAt ? "on" : ""} />
          ))}
        </div>
      </section>

      <section className="security" id="security">
        <header className="sec-head">
          <h2>Why a console from 1989?</h2>
          <p>
            Because it can't do much. The Game Boy itself has no Wi-Fi, no Bluetooth and no app store. It's a screen and a few buttons, and it only talks to the cartridge. The cartridge has a small Bluetooth radio for your phone, but it only carries requests and public addresses, never keys. What the Game Boy shows you is exactly what gets signed.
          </p>
        </header>
        <div className="receipt-wrap">
          <div className="ghost-slip" aria-hidden>
            <p className="px">REJECTED</p>
            <p className="px">NOTHING WAS SIGNED</p>
          </div>
          <div className="receipt paper-white print-in">
            <div className="perf" aria-hidden />
            <p className="px receipt-title">KAGIBOY SECURITY</p>
            <ul>
              {PROMISES.map(([k, v]) => (
                <li key={k} className="px">
                  <span>{k}</span>
                  <i aria-hidden />
                  <span>{v}</span>
                </li>
              ))}
            </ul>
            <p className="px receipt-foot">CHECKED ON EVERY REQUEST</p>
            <div className="perf bottom" aria-hidden />
          </div>
          <aside className="limits">
            <h3>Known limits</h3>
            <p>
              The cartridge's main chip has published glitch attacks, which is why the keys live in a separate secure
              element. A modified Game Boy could fake button presses, so possession plus your PIN is the bar. A Solana
              transaction doesn't say which network it's for, so keep test and real seeds apart. Nothing goes on
              sale before an outside security review.
            </p>
          </aside>
        </div>
      </section>

      <section className="compare" aria-labelledby="compare-title">
        <header className="sec-head">
          <h2 id="compare-title">How it compares</h2>
          <p>Not a Ledger rival, just a different place to keep your keys, with the same rules underneath.</p>
        </header>
        <Comparison {...COMPARE} />
      </section>

      <section className="inside" id="inside">
        <header className="sec-head">
          <h2>Made from parts you can buy today</h2>
          <p>Modern flash carts already run on the same family of chip. kagiboy adds a secure element for your keys and a small radio for your phone.</p>
        </header>
        <div className="inside-grid">
          <img
            className="exploded"
            src="/renders/cart-exploded.webp"
            alt="The kagiboy cartridge taken apart: front shell with label, circuit board with four chips, back shell"
            loading="lazy"
          />
          <div className="receipt bom paper-blue print-in">
            <div className="perf" aria-hidden />
            <p className="px receipt-title">WHAT'S INSIDE</p>
            <ul>
              {BOM.map(([k, v]) => (
                <li key={k} className="px">
                  <span>{k}</span>
                  <i aria-hidden />
                  <span>{v}</span>
                </li>
              ))}
            </ul>
            <p className="px total">
              <span>6 PARTS</span>
              <span>0 SECRETS OUT</span>
            </p>
            <p className="px faint">ALL OFF-THE-SHELF PARTS</p>
            <div className="perf bottom" aria-hidden />
          </div>
        </div>
      </section>

      <section className="status">
        <header className="sec-head">
          <h2>Where we're at</h2>
          <p>The software runs today. The cartridge is in the works, and here's the plan.</p>
        </header>
        <div className="road-21">
          <Timeline steps={ROADMAP} />
        </div>
      </section>

      <section className="demo-cta">
        <img src="/renders/hero-front34.webp" alt="The Game Boy with the kagiboy cartridge, showing the wallet home screen" loading="lazy" />
        <div>
          <h2>Go on, press Start</h2>
          <p>
            The real Game Boy software runs right in your browser, with the cartridge's chip simulated next to it. It
            signs real transactions on Solana, Ethereum, Base, Arbitrum, HyperEVM and Robinhood Chain.
          </p>
          <div className="demo-cta-actions">
            <Link to="/demo" className="btn btn-ink">
              Open the live demo
            </Link>
            <Link to="/app" className="btn btn-paper">
              See the app
            </Link>
          </div>
        </div>
      </section>

      <section className="faq" aria-labelledby="faq-title">
        <header className="sec-head">
          <h2 id="faq-title">Questions</h2>
        </header>
        <Accordion items={FAQ} maxPanelHeight={320} />
      </section>

      <section className="waitlist" id="waitlist">
        <h2>Want one for your shelf?</h2>
        <p>I'll build a small first batch if enough of you want one. Leave your email and I'll write once, when it's ready.</p>
        <Waitlist />
      </section>

      <footer className="kb-foot">
        <p>
          kagiboy is a Colosseum hackathon project. The software is real and runs on testnets; the cartridge hardware is a
          work in progress.
        </p>
        <p>Not affiliated with Nintendo. Game Boy is a trademark of Nintendo.</p>
        <p className="foot-links">
          <Link to="/demo">Live demo</Link> · <Link to="/app">App</Link> · <Link to="/about">About</Link>
        </p>
      </footer>
    </div>
  );
}

/** The origin story on a Game Boy screen: an original pixel loop, played only while it's in view. */
function FleaMarketGameBoy() {
  const lcd = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = lcd.current;
    if (!canvas) return;
    let loop: import("./fleaLoop").FleaLoop | null = null;
    let visible = false;
    let gone = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./fleaLoop").then(({ FleaLoop }) => {
      if (gone) return;
      loop = new FleaLoop(canvas);
      loop.still();
      if (visible && !reduced) loop.start();
    });
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!loop || reduced) return;
      if (visible) loop.start();
      else loop.stop();
    });
    io.observe(canvas);
    return () => {
      gone = true;
      io.disconnect();
      loop?.stop();
    };
  }, []);
  return (
    <figure className="origin-gb">
      <img src="/renders/front-ortho.webp" alt="" loading="lazy" />
      <canvas
        ref={lcd}
        className="origin-lcd"
        role="img"
        aria-label="Pixel animation: a kid walks through a flea market, finds a Game Boy on a table and holds it up as music plays"
      />
    </figure>
  );
}
