import "../polyfill"; // must run before @solana/web3.js loads
import { useEffect, useRef } from "react";
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

  return (
    <div className="kb demo">
      <nav className="kb-nav" aria-label="Main">
        <Link to="/" className="kb-word" aria-label="kagiboy home">
          kagiboy
        </Link>
        <span className="net">Live demo · Solana devnet · Ethereum Sepolia</span>
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
      if (!s.phone.balances.sol && !s.phone.balances.evm) return "Fund the wallet: tap “Airdrop 1 SOL” on the phone, or press A on the Game Boy to show your QR code.";
      return "Send a test transfer from the phone and approve it on the Game Boy.";
  }
}
