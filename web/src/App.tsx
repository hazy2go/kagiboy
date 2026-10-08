import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./landing/Landing";
import { AboutPage } from "./about/AboutPage";
import { NotFound } from "./NotFound";

// the emulator and both chain SDKs only load on /demo
const DemoPage = lazy(() => import("./demo/DemoPage").then((m) => ({ default: m.DemoPage })));
const AppPage = lazy(() => import("./app/AppPage").then((m) => ({ default: m.AppPage })));

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
        <Route
          path="/app"
          element={
            <Suspense fallback={<p className="loading">Opening the app…</p>}>
              <AppPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
