import { useEffect, useRef } from "react";
import "./flea.css";

/** The origin story on a Game Boy screen: an original pixel loop, played only while it's in view. */
export function FleaMarketGameBoy({ className = "" }: { className?: string }) {
  const lcd = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = lcd.current;
    if (!canvas) return;
    let loop: import("../landing/fleaLoop").FleaLoop | null = null;
    let visible = false;
    let gone = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("../landing/fleaLoop").then(({ FleaLoop }) => {
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
    <figure className={`flea-gb ${className}`}>
      <img src="/renders/front-ortho.webp" alt="" loading="lazy" />
      <canvas
        ref={lcd}
                role="img"
        aria-label="Pixel animation: a kid walks through a flea market, finds a Game Boy on a table and holds it up as music plays"
      />
    </figure>
  );
}
