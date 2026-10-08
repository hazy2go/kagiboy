import "../polyfill"; // must run before @solana/web3.js loads
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router-dom";
import { BusMonitor } from "./BusMonitor";
import { GameBoyShell } from "./GameBoyShell";
import { KagiApp } from "../app/AppPage";
import { useSession } from "./session";
import "./demo.css";

export function DemoPage() {
  const s = useSession();
  const gbRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const [radio, setRadio] = useState<{ x: number; y: number } | null>(null);
  const pending = s.chip.hasPending;

  // On narrow screens the phone sits below the Game Boy; bring the console back into view to approve.
  useEffect(() => {
    if (pending && window.matchMedia("(max-width: 960px)").matches) {
      gbRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pending]);

  useEffect(() => {
    document.documentElement.classList.add("kb-root");
    document.title = "kagiboy demo";
    return () => {
      document.documentElement.classList.remove("kb-root");
      document.title = "kagiboy";
    };
  }, []);

  const mobile = useMedia("(max-width: 760px)");
  if (mobile) return <MobileDemo />;

  return (
    <div className="kb demo">
      <nav className="kb-nav" aria-label="Main">
        <Link to="/" className="kb-word" aria-label="kagiboy home">
          kagiboy
        </Link>
        <span className="net">Live demo · test networks</span>
      </nav>

      <header className="demo-intro">
        <div>
          <h1>Try kagiboy.</h1>
          <p className="sub">
            The real Game Boy ROM, with the cartridge's chip simulated in your browser. The phone beside it is the
            companion app.
          </p>
        </div>
        <p className="next-step" aria-live="polite">
          <span className="px">NEXT</span>
          <span>{nextStep(s)}</span>
          {!s.powered && (
            <button className="btn btn-ink btn-sm" onClick={() => s.powerOn()}>
              Switch on
            </button>
          )}
        </p>
      </header>

      <div className="rig" ref={rigRef}>
        <div ref={gbRef} className="rig-gb">
          <GameBoyShell onRadio={setRadio} />
        </div>
        <div className="wire" aria-hidden>
          <span className="px">BLUETOOTH</span>
        </div>
        <div className="phone kapp-phone">
          <div className="phone-notch" />
          <KagiApp />
        </div>
        <BtLink rig={rigRef} radio={radio} />
      </div>

      <BusMonitor />

      <footer className="kb-foot">
        <p>
          Demo build: the cartridge's chip is simulated in your browser, and this wallet is saved in this browser's
          storage. Testnet funds only.
        </p>
        <p>Not affiliated with Nintendo. Game Boy is a trademark of Nintendo.</p>
      </footer>
    </div>
  );
}

type Pt = { x: number; y: number };

/**
 * The Bluetooth link, drawn across the gap between the console and the phone. It runs while the cartridge
 * is powered, and a packet travels along it whenever the phone and the cartridge actually talk.
 */
function BtLink({ rig, radio }: { rig: RefObject<HTMLDivElement | null>; radio: Pt | null }) {
  const s = useSession();
  const [ends, setEnds] = useState<{ a: Pt; b: Pt; w: number; h: number } | null>(null);
  const packet = useRef<SVGAnimateMotionElement>(null);
  const [dir, setDir] = useState<"in" | "out">("in");
  const [flying, setFlying] = useState(false);

  // measure in the rig's own coordinates, so page scroll never moves the line
  useEffect(() => {
    const el = rig.current;
    if (!el || !radio) return setEnds(null);
    const measure = () => {
      const phone = el.querySelector(".phone");
      if (!phone) return;
      const r = el.getBoundingClientRect();
      const p = phone.getBoundingClientRect();
      const y = radio.y - r.top;
      // same breathing room on both sides: the dots touch neither device
      const GAP = 20;
      setEnds({
        a: { x: radio.x - r.left + GAP, y },
        b: { x: p.left - r.left - GAP, y },
        w: r.width,
        h: r.height,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rig, radio]);

  // what crosses the air: a sign request goes to the cartridge; balances and results come back to the phone
  const pending = s.chip.hasPending;
  const latest = s.phone.activity[0];
  const traffic = `${pending}|${s.chip.pairingCode}|${s.chip.paired}|${latest?.state ?? ""}|${s.phone.activity.length}|${s.chip.state}|${s.phone.balances.sol}|${s.phone.balances.evm}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!s.powered) return;
    setDir(pending || s.chip.pairingCode ? "in" : "out");
    // restart on the next frame, once the keyPoints for the new direction are in the DOM
    setFlying(true);
    const raf = requestAnimationFrame(() => packet.current?.beginElement());
    const done = setTimeout(() => setFlying(false), 820);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [traffic]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ends) return null;
  const { a, b } = ends;
  const d = `M${a.x},${a.y} L${b.x},${b.y}`;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const on = s.powered && s.chip.paired;

  return (
    <div className={`bt-link ${on ? "is-on" : ""}`} aria-hidden>
      <svg width={ends.w} height={ends.h} viewBox={`0 0 ${ends.w} ${ends.h}`}>
        <defs>
          <linearGradient id="bt-grad" x1={a.x} y1={a.y} x2={b.x} y2={b.y} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7d9cf5" />
            <stop offset="1" stopColor="#f08fb4" />
          </linearGradient>
        </defs>
        <path className="bt-halo" d={d} />
        <path className="bt-line" d={d} />
        <circle className="bt-end" cx={a.x} cy={a.y} r={4.5} />
        <circle className="bt-end" cx={b.x} cy={b.y} r={4.5} />
        <circle className={`bt-packet ${flying ? "is-flying" : ""}`} r={5}>
          <animateMotion
            ref={packet}
            begin="indefinite"
            dur="0.8s"
            path={d}
            keyPoints={dir === "out" ? "0;1" : "1;0"}
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      </svg>
      <span className="bt-tag" style={{ left: mid.x, top: mid.y }}>
        <svg viewBox="0 0 12 18" width="9" height="14">
          <path d="M1 5l10 8-5 4V1l5 4L1 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span className="px">{on ? "BLUETOOTH" : s.chip.pairingCode ? "PAIRING" : s.powered ? "NOT PAIRED" : "NOT LINKED"}</span>
      </span>
    </div>
  );
}

function nextStep(s: ReturnType<typeof useSession>): string {
  if (!s.powered) return "Switch on the Game Boy.";
  if (s.chip.hasPending) return "Check the amount and address on the Game Boy, then hold A to sign or press B to reject.";
  switch (s.chip.state) {
    case "none":
      return "Press START, mash the buttons, hold “shake”, write down your 12 words and pick a PIN.";
    case "locked":
      return "Press START on the Game Boy, then enter your PIN (arrows change digits, A confirms).";
    default:
      if (s.chip.pairingCode) return "Check the Game Boy shows the same code as the phone, then press A on it to pair.";
      if (!s.chip.paired) return "Now pair your phone: open the Wallet, tap “Pair cartridge”, then accept the code on the Game Boy.";
      if (!s.phone.balances.sol && !s.phone.balances.evm) return "Fund the wallet: tap “Get test SOL” on the phone (your address is copied for you), or press A on the Game Boy to show its QR code.";
      return "Send a test transfer from the phone and approve it on the Game Boy. Left and right on the Game Boy switch the EVM network.";
  }
}

const TABS = [
  { id: "gb", label: "Game Boy" },
  { id: "phone", label: "Wallet" },
  { id: "bus", label: "Bus" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Phones get an app: one device per screen, a tab bar to move between them. Every pane stays mounted. */
function MobileDemo() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("gb");
  const pending = s.chip.hasPending;
  const seenActivity = useRef(0);
  const [walletDot, setWalletDot] = useState(false);

  // sign and pairing requests land on the Game Boy, where they have to be approved
  const asking = pending || !!s.chip.pairingCode;
  useEffect(() => {
    if (asking) setTab("gb");
  }, [asking]);

  // a new line in the wallet's activity while you're elsewhere earns the tab a dot
  const count = s.phone.activity.length;
  useEffect(() => {
    if (count > seenActivity.current && tab !== "phone") setWalletDot(true);
    seenActivity.current = count;
  }, [count, tab]);

  useEffect(() => {
    if (tab === "phone") setWalletDot(false);
  }, [tab]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("demo-app-root");
    return () => html.classList.remove("demo-app-root");
  }, []);

  const at = TABS.findIndex((t) => t.id === tab);
  // the wallet is set up but the phone isn't paired yet: point people at the Wallet tab
  const needsPair = s.powered && s.chip.state === "unlocked" && !s.chip.paired && !s.chip.pairingCode;

  return (
    <div className="kb demo-app">
      <header className="app-top">
        <div className="app-top-row">
          <Link to="/" className="kb-word" aria-label="kagiboy home">
            kagiboy
          </Link>
          <span className="net">testnets</span>
        </div>
        <p className="next-step" aria-live="polite">
          <span className="px">NEXT</span>
          <span>{nextStep(s)}</span>
          {!s.powered && (
            <button className="btn btn-ink btn-sm" onClick={() => s.powerOn()}>
              Switch on
            </button>
          )}
          {needsPair && tab !== "phone" && (
            <button className="btn btn-ink btn-sm" onClick={() => setTab("phone")}>
              Go to Wallet
            </button>
          )}
        </p>
      </header>

      <main className="panes" style={{ "--at": at } as CSSProperties}>
        <section className="pane pane-gb" aria-label="Game Boy" inert={tab !== "gb"}>
          <GameBoyShell active={tab === "gb"} />
        </section>
        <section className="pane pane-phone" aria-label="Wallet app" inert={tab !== "phone"}>
          <KagiApp />
        </section>
        <section className="pane pane-bus" aria-label="Cartridge bus" inert={tab !== "bus"}>
          <BusMonitor />
          <footer className="kb-foot">
            <p>
              Demo build: the cartridge's chip is simulated in your browser, and this wallet is saved in this browser's
              storage. Testnet funds only.
            </p>
            <p>Not affiliated with Nintendo. Game Boy is a trademark of Nintendo.</p>
          </footer>
        </section>
      </main>

      <nav className="tabbar" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${t.id === tab ? "on" : ""} ${t.id === "phone" && needsPair && tab !== "phone" ? "beckon" : ""}`}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <TabIcon id={t.id} />
            <span>{t.label}</span>
            {t.id === "phone" && needsPair && tab !== "phone" ? (
              <i className="pair-badge">Pair</i>
            ) : (
              ((t.id === "gb" && pending && tab !== "gb") || (t.id === "phone" && walletDot)) && <i className="dot" aria-label="needs attention" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TabIcon({ id }: { id: Tab }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      {id === "gb" && (
        <g {...common}>
          <rect x="5" y="2.5" width="14" height="19" rx="2" />
          <rect x="7.5" y="5" width="9" height="7" rx="0.8" />
          <path d="M8 16.5h3M9.5 15v3" />
          <circle cx="15.5" cy="16" r="0.9" />
        </g>
      )}
      {id === "phone" && (
        <g {...common}>
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
          <path d="M10.5 5h3M9.5 12h5M9.5 15h3" />
        </g>
      )}
      {id === "bus" && (
        <g {...common}>
          <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
          <path d="M9 8h6M9 11.5h6M9 15h4" />
        </g>
      )}
    </svg>
  );
}

function useMedia(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
  );
}
