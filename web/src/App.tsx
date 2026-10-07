import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import brand from "../../brand.json";
import { DemoPage } from "./demo/DemoPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/demo" element={<DemoPage />} />
      </Routes>
    </BrowserRouter>
  );
}

// Placeholder until the real marketing site (see TODO.md).
function Landing() {
  return (
    <main className="landing">
      <p className="eyebrow">Hardware wallet · Solana + EVM</p>
      <h1>{brand.name}</h1>
      <p className="lede">
        {brand.tagline}. Your keys live in a secure chip inside the cartridge. You approve every transaction on the
        Game Boy's own screen and buttons.
      </p>
      <Link className="primary" to="/demo">
        Try the live demo
      </Link>
    </main>
  );
}
