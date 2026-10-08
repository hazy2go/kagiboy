import { useEffect, useRef } from "react";
import "./flea.css";

/** The origin story on a Game Boy screen: an original pixel loop, played only while it's in view. */
/** `eager`: the console is the first big thing on the page (About), so it loads first, not lazily. */
export function FleaMarketGameBoy({ className = "", scene = "flea", eager = false }: { className?: string; scene?: "flea" | "chain"; eager?: boolean }) {
  const lcd = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = lcd.current;
    if (!canvas) return;
    let loop: { still(): void; start(): void; stop(): void } | null = null;
    let visible = false;
    let gone = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const load = scene === "chain" ? import("./chainLoop").then((m) => m.ChainLoop) : import("../landing/fleaLoop").then((m) => m.FleaLoop);
    load.then((Loop) => {
      if (gone) return;
      loop = new Loop(canvas);
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
  }, [scene]);
  return (
    <figure className={`flea-gb ${className}`}>
      <img src="/renders/front-ortho.webp" alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" />
      <canvas
        ref={lcd}
                role="img"
        aria-label={
          scene === "chain"
            ? "Pixel animation: a little character hops along a chain of blocks collecting coins, then puts its key in a safe"
            : "Pixel animation: a kid walks through a flea market, finds a Game Boy on a table and holds it up as music plays"
        }
      />
    </figure>
  );
}
