import "../polyfill"; // must run before @solana/web3.js loads
import { Link } from "react-router-dom";
import brand from "../../../brand.json";
import { BusMonitor } from "./BusMonitor";
import { GameBoyShell } from "./GameBoyShell";
import { PhoneApp } from "./PhoneApp";

export function DemoPage() {
  return (
    <div className="demo">
      <header className="demo-head">
        <Link to="/" className="brand">
          {brand.name}
        </Link>
        <span className="net">Testnets only · Solana devnet · Ethereum Sepolia</span>
      </header>

      <div className="rig">
        <GameBoyShell />
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
