import "../polyfill"; // must run before @solana/web3.js loads
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { BusMonitor } from "./BusMonitor";
import { GameBoyShell } from "./GameBoyShell";
import { PhoneApp } from "./PhoneApp";
import { useSession } from "./session";
import "./demo.css";

export function DemoPage() {
  const s = useSession();
  const gbRef = useRef<HTMLDivElement>(null);
  const pending = s.chip.hasPending;

  // On narrow screens the phone sits below the Game Boy; bring the console back into view to approve.
  useEffect(() => {
    if (pending && window.matchMedia("(max-width: 960px)").matches) {
      gbRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pending]);

  useEffect(() => {
    document.documentElement.classList.add("kb-root");
    return () => document.documentElement.classList.remove("kb-root");
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
        <h1>Try kagiboy.</h1>
        <p className="next-step" aria-live="polite">
          <span className="px">NEXT</span>
          <span>{nextStep(s)}</span>
        </p>
      </header>

      <div className="rig">
        <div ref={gbRef} className="rig-gb">
          <GameBoyShell />
        </div>
        <div className="wire" aria-hidden>
          <span className="px">BLUETOOTH</span>
        </div>
        <PhoneApp />
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

function nextStep(s: ReturnType<typeof useSession>): string {
  if (!s.powered) return "Switch on the Game Boy.";
  if (s.chip.hasPending) return "Check the amount and address on the Game Boy, then hold A to sign or press B to reject.";
  switch (s.chip.state) {
    case "none":
      return "Press START, mash the buttons, hold “shake”, write down your 12 words and pick a PIN.";
    case "locked":
      return "Enter your PIN on the Game Boy (arrows change digits, A confirms).";
    default:
      if (!s.phone.balances.sol && !s.phone.balances.evm) return "Fund the wallet: tap “Get test SOL” on the phone (your address is copied for you), or press A on the Game Boy to show its QR code.";
      return "Send a test transfer from the phone and approve it on the Game Boy.";
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

  // a sign request always lands on the Game Boy, where it has to be approved
  useEffect(() => {
    if (pending) setTab("gb");
  }, [pending]);

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
        </p>
      </header>

      <main className="panes" style={{ "--at": at } as CSSProperties}>
        <section className="pane pane-gb" aria-label="Game Boy" inert={tab !== "gb"}>
          <GameBoyShell active={tab === "gb"} />
        </section>
        <section className="pane pane-phone" aria-label="Wallet app" inert={tab !== "phone"}>
          <PhoneApp bare />
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
            className={t.id === tab ? "on" : ""}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <TabIcon id={t.id} />
            <span>{t.label}</span>
            {((t.id === "gb" && pending && tab !== "gb") || (t.id === "phone" && walletDot)) && (
              <i className="dot" aria-label="needs attention" />
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
