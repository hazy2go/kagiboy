import { useEffect } from "react";
import { Link } from "react-router-dom";
import "./about.css";

// Photos of kagiboy running on a real Game Boy. Drop files in public/gallery/ and list them here;
// the section stays hidden until there is at least one.
const GALLERY: { src: string; caption: string; wide?: boolean }[] = [];

const WHY = [
  {
    stamp: "A BLAST FROM THE PAST",
    paper: "blue",
    body: "A handheld from 1989, signing Solana and Ethereum transactions. Old hardware, a new job, and the same click when the cartridge goes in.",
  },
  {
    stamp: "SMALL ON PURPOSE",
    paper: "pink",
    body: "The Game Boy has no internet, no browser and no app store. It can only show what the cartridge draws, which makes it a calm place to say yes or no.",
  },
  {
    stamp: "NOT A LEDGER RIVAL",
    paper: "lavender",
    body: "kagiboy is a novelty for people who love this console as much as I do. For serious savings, use a serious wallet. For joy, plug in a cartridge.",
  },
] as const;

const PLAYER = [
  ["NAME", "HAZY"],
  ["BASE", "TOKYO"],
  ["WEB3", "5+ YEARS"],
  ["SPEAKS", "EN  TR  DE"],
  ["CONSOLE", "DMG-01"],
] as const;

export function AboutPage() {
  useEffect(() => {
    document.documentElement.classList.add("kb-root");
    document.title = "About kagiboy";
    window.scrollTo(0, 0);
    // printed pieces feed in as they enter the screen, like the landing page
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -10% 0px" },
    );
    document.querySelectorAll(".about .print-in").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("kb-root");
      document.title = "kagiboy";
    };
  }, []);

  return (
    <div className="kb about">
      <nav className="kb-nav" aria-label="Main">
        <Link to="/" className="kb-word" aria-label="kagiboy home">
          kagiboy
        </Link>
        <div className="about-links">
          <Link to="/">Home</Link>
          <Link to="/demo" className="btn btn-ink btn-sm">
            Live demo
          </Link>
        </div>
      </nav>

      <header className="about-hero">
        <p className="px eyebrow">ABOUT</p>
        <h1>A love letter to the Game Boy, with keys inside.</h1>
        <p className="lede">
          kagiboy isn't trying to be the next big hardware wallet. It's a small, honest experiment: what if the console I
          love could hold my crypto keys, and show me every transaction before I sign it?
        </p>
      </header>

      <section className="why" aria-label="Why kagiboy">
        {WHY.map((w, i) => (
          <article key={w.stamp} className={`why-slip receipt paper-${w.paper} print-in`} style={{ ["--i" as string]: i }}>
            <div className="perf" aria-hidden />
            <p className="px">{w.stamp}</p>
            <p>{w.body}</p>
            <div className="perf bottom" aria-hidden />
          </article>
        ))}
      </section>

      <section className="me" aria-labelledby="me-title">
        <div className="player receipt paper-white print-in">
          <div className="perf" aria-hidden />
          <p className="px receipt-title">PLAYER 1</p>
          <ul>
            {PLAYER.map(([k, v]) => (
              <li key={k} className="px">
                <span>{k}</span>
                <i aria-hidden />
                <span>{v}</span>
              </li>
            ))}
          </ul>
          <p className="px receipt-foot">PRESS START</p>
          <div className="perf bottom" aria-hidden />
        </div>
        <div className="me-copy">
          <h2 id="me-title">Hey, I'm hazy.</h2>
          <p>
            I'm a retro gaming enthusiast, and I've lived and worked in Web3 for more than five years. kagiboy is where
            those two things meet.
          </p>
          <p>
            I love the Game Boy: the weight of it, the click of the buttons, the way a cartridge slides home. My keys
            live in devices I never want to look at. I wanted them in something I actually enjoy holding.
          </p>
          <p>
            Old hardware has a quiet advantage, too. A console from 1989 can't browse, can't install anything and can't
            be talked into much. Put the secure part in the cartridge, let the Game Boy be the screen, and you get
            something simple enough to trust and fun enough to keep on your desk.
          </p>
        </div>
      </section>

      {GALLERY.length > 0 && (
        <section className="gallery" aria-labelledby="gallery-title">
          <header>
            <h2 id="gallery-title">On a real Game Boy.</h2>
            <p>The same ROM as the live demo, running on my own DMG from a flash cart.</p>
          </header>
          <div className="gallery-grid">
            {GALLERY.map((g) => (
              <figure key={g.src} className={g.wide ? "wide" : ""}>
                <img src={g.src} alt={g.caption} loading="lazy" />
                <figcaption className="px">{g.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="about-cta">
        <h2>Come play.</h2>
        <div className="actions">
          <Link to="/demo" className="btn btn-ink">
            Try the live demo
          </Link>
          <a href="/#waitlist" className="btn btn-paper">
            Join the waitlist
          </a>
        </div>
      </section>

      <footer className="kb-foot">
        <p>
          kagiboy is a Colosseum hackathon project. The software is real and runs on testnets; the cartridge hardware is a
          work in progress.
        </p>
        <p>Not affiliated with Nintendo. Game Boy is a trademark of Nintendo.</p>
      </footer>
    </div>
  );
}
