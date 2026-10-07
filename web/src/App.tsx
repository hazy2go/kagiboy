import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./landing/Landing";
import { AboutPage } from "./about/AboutPage";

// the emulator and both chain SDKs only load on /demo
const DemoPage = lazy(() => import("./demo/DemoPage").then((m) => ({ default: m.DemoPage })));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="/demo"
          element={
            <Suspense fallback={<p className="loading">Inserting the cartridge…</p>}>
              <DemoPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
