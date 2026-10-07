import "../polyfill"; // must run before @solana/web3.js loads
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import brand from "../../../brand.json";
import { BusMonitor } from "./BusMonitor";
import { GameBoyShell } from "./GameBoyShell";
import { PhoneApp } from "./PhoneApp";
import { useSession } from "./session";

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

  return (
    <div className="demo">
      <header className="demo-head">
        <Link to="/" className="brand">
          {brand.name}
        </Link>
        <span className="net">Testnets only · Solana devnet · Ethereum Sepolia</span>
      </header>

      <p className="next-step" aria-live="polite">
        <span>Next</span> {nextStep(s)}
      </p>

      <div className="rig">
        <div ref={gbRef}>
          <GameBoyShell />
        </div>
        <div className="wire" aria-hidden>
          <span>Bluetooth</span>
        </div>
        <PhoneApp />
      </div>

      <div className="below">
        <ol className="steps">
          <li>
            <b>Switch on.</b> The Game Boy boots the wallet from the cartridge.
          </li>
          <li>
            <b>Make your keys.</b> Mash buttons, then hold “shake”. Both feed the chip's random number generator.
          </li>
          <li>
            <b>Send from the phone.</b> The phone builds the transaction, but only the Game Boy can approve it.
          </li>
        </ol>
        <BusMonitor />
      </div>

      <footer className="demo-foot">
        Demo build: the key chip is simulated in your browser and the wallet is saved in this browser's storage. Use
        testnet funds only.
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
