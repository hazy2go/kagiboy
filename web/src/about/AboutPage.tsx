import { useEffect } from "react";
import { Link } from "react-router-dom";
import "./about.css";
import { MasonryLightbox } from "../site/ui/masonry-lightbox";
import { FleaMarketGameBoy } from "../site/FleaMarketGameBoy";
import "../site/tw.css";

// Photos of kagiboy on hazy's own Game Boy (the real ROM from a flash cart). The section hides
// itself when the list is empty.
const PLACEHOLDER_PHOTOS = false;
const GALLERY: { src: string; w: number; h: number; caption: string; alt: string; wide?: boolean; focus?: string }[] = [
  { src: "/gallery/boot.webp", w: 1400, h: 1317, caption: "PRESS START", alt: "A grey Game Boy on a wooden desk next to a tablet, showing the kagiboy title screen", wide: true, focus: "88% 50%" },
  { src: "/gallery/welcome.webp", w: 1120, h: 1400, caption: "NO WALLET YET", alt: "Hands holding the Game Boy on the kagiboy welcome screen: new wallet or restore" },
  { src: "/gallery/mash.webp", w: 1120, h: 1400, caption: "STEP 1, MASH 17/40", alt: "Thumbs mashing the buttons while the Game Boy counts to forty" },
  { src: "/gallery/shake.webp", w: 1120, h: 1400, caption: "STEP 2, SHAKE IT", alt: "The Game Boy asking to be shaken for a few seconds" },
  { src: "/gallery/pin.webp", w: 1120, h: 1400, caption: "WELCOME BACK, PIN", alt: "The Game Boy on a desk asking for the four-digit PIN" },
  { src: "/gallery/home.webp", w: 1120, h: 1400, caption: "UNLOCKED, 2.48 SOL", alt: "Hands holding the Game Boy on the wallet home screen with Solana and Ethereum balances", wide: true },
];

const WHY = [
  {
    stamp: "THE GAME BOY STAYS OFFLINE",
    paper: "blue",
    body: "The console has no Wi-Fi and no apps. The cartridge's small radio only talks to your phone, and only to pass along requests and public addresses. Your keys never travel.",
  },
  {
    stamp: "MADE FOR THE SHELF",
    paper: "pink",
    body: "When it ships, load it with the coins you plan to keep for years, back up your 12 words, and put it somewhere you'll smile at it, like a safe, a shelf or a friend's birthday.",
  },
  {
    stamp: "NOT A LEDGER RIVAL",
    paper: "lavender",
    body: "I'm not out to beat the big wallet companies. This is for people who grew up with a Game Boy and ended up in crypto, like me.",
  },
] as const;

const PLAYER = [
  ["NAME", "HAZY"],
  ["BASE", "JAPAN"],
  ["1ST GAME", "MARIO LAND"],
  ["FOUND AT", "FLEA MARKET"],
  ["COLLECTS", "GB TO GAMECUBE"],
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

      <main className="kb-main">
      <header className="about-hero">
        <div>
          <p className="px eyebrow">THE STORY</p>
          <h1>My first console came from a flea market.</h1>
          <p className="lede">
            My dad bought it for me when I was so young I didn't even know what Nintendo was. All I knew was that I was holding
            something magical.
          </p>
        </div>
        <FleaMarketGameBoy className="about-flea" scene="chain" eager />
      </header>

      <section className="story" aria-label="How kagiboy started">
        <div className="story-part">
          <div>
            <p>
              The game was Super Mario Land. I never beat it. It was way too hard for me, and I didn't care, because I had the
              music and a whole world I could carry around. The most exciting thing on a phone back then was Snake on a Nokia.
              This was a real game, in my hands, anywhere I wanted.
            </p>
            <p>
              Then came Castlevania, then Pokémon Yellow. That grey Game Boy was the first console I ever called my own, and
              it never really left me. Today I live in Japan and collect old consoles: Game Boy, PSP, PS1, N64, GameCube. The
              Game Boy is still my favourite.
            </p>
          </div>
        </div>
        <div className="story-part">
          <div>
            <h2>Crypto never felt like that.</h2>
            <p>
              I've spent years working in Web3, and holding keys has always made me a little nervous, whatever wallet I used.
              Meanwhile hardware wallets keep getting fancier, with touchscreens, Wi-Fi and colour displays. To me, every extra feature is one more thing to worry about.
            </p>
            <p>
              One day I looked at my Game Boy and thought: you can't connect this to anything. No Wi-Fi, no Bluetooth, no
              extras. Just a screen and some buttons. What if the cartridge held my keys, my phone could only ask, and this little screen was the only place I could say yes?
              The cartridge would need a tiny radio to hear the phone, but it would only ever carry public data.
            </p>
          </div>
        </div>
      </section>

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
            I'm doing this because I want to bring one of my favourite things in the world back to life, and
            maybe give you a little of the magic I felt the first time I held one.
          </p>
          <p>
            If the Game Boy breaks, any Game Boy will do. If the cartridge breaks, your 12 words bring everything back, in a new kagiboy or in a regular wallet app like Phantom or MetaMask. And one day you get
            to say: yes, my wallet is a Game Boy.
          </p>
          <p className="kagi">
            <span lang="ja">鍵</span> <b>kagi</b> means key in Japanese, a small thank-you to where the Game Boy was
            born, and where kagiboy is being made.
          </p>
        </div>
      </section>

      {GALLERY.length > 0 && (
        <section className="gallery" aria-labelledby="gallery-title">
          <header>
            <h2 id="gallery-title">{PLACEHOLDER_PHOTOS ? "How it'll look." : "On a real Game Boy."}</h2>
            <p>
              {PLACEHOLDER_PHOTOS
                ? "Mockups for now: the scenes are generated, the screens are the real ROM. Photos of my own Game Boy running it are on the way."
                : "The same screens as the live demo, on my own Game Boy, loaded from a flash cart. This test build has a pretend chip inside the ROM: it holds no real keys and signs nothing, until the cartridge exists."}
            </p>
          </header>
          <MasonryLightbox
            images={GALLERY.map((g, i) => ({ id: i + 1, src: g.src, alt: g.alt, description: g.caption, width: g.w, height: g.h, position: g.focus }))}
          />
        </section>
      )}

      <section className="about-cta">
        <h2>Want to follow along?</h2>
        <div className="actions">
          <Link to="/demo" className="btn btn-ink">
            Press Start
          </Link>
          <a href="/#waitlist" className="btn btn-paper">
            Join the waitlist
          </a>
        </div>
      </section>
      </main>

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
