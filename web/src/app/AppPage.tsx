import "../polyfill"; // must run before @solana/web3.js loads
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import qrcode from "qrcode-generator";
import { formatUnits, parseUnits } from "viem";
import type { Chain } from "../chip/protocol";
import { EVM_NETWORKS } from "../chip/networks";
import { GameBoyShell } from "../demo/GameBoyShell";
import { useSession } from "../demo/session";
import { explorer } from "../phone/phone";
import { chainOf, intentFor, loadTokens, PARTNER_FEE_BPS, quote, SLIPPAGE_BPS, SWAP_CHAINS, type Quote, type Token } from "./swap";
import { CHAIN_ICONS, SYMBOL_ICONS, TOKEN_ICONS } from "./tokenIcons";
import "../demo/demo.css";
import "./app.css";

type Tab = "wallet" | "swap" | "act-screen" | "cartridge";

interface SwapRecord {
  id: string;
  sell: string;
  buy: string;
  route: string;
  state: "waiting" | "signed" | "rejected" | "failed";
  at: number;
}

/**
 * The kagiboy app on its own, the way you'd have it on your phone. The Game Boy isn't on screen:
 * it slides up (phones) or opens as a panel (desktop) whenever the cartridge needs you.
 */
export function AppPage() {
  const s = useSession();
  const desktop = useMedia("(min-width: 960px)");
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("kb-root", "app-html");
    document.title = "kagiboy app";
    return () => {
      html.classList.remove("kb-root", "app-html");
      document.title = "kagiboy";
    };
  }, []);

  // the cartridge asks for you: bring the Game Boy up, and put it away once it's answered
  const asking = s.chip.hasPending || !!s.chip.pairingCode;
  useEffect(() => {
    if (asking) setSheet(true);
  }, [asking]);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (wasAsking.current && !asking) {
      const t = setTimeout(() => setSheet(false), 1600);
      return () => clearTimeout(t);
    }
    wasAsking.current = asking;
  }, [asking]);

  return (
    <div className={`kb app ${desktop ? "is-desk" : "is-phone"}`}>
      {desktop && (
        <header className="app-head-bar">
          <Link to="/" className="kb-word" aria-label="kagiboy home">
            kagiboy
          </Link>
          <span className="app-head-note" />
          <Link to="/demo" className="app-head-link">
            Live demo with the Game Boy
          </Link>
        </header>
      )}

      <div className="app-stage">
        {desktop && (
          <section className="app-pitch">
            <p className="px eyebrow">THE KAGIBOY APP</p>
            <h1>Your phone asks. Your Game Boy decides.</h1>
            <p>
              Balances, sends and swaps across Solana and five EVM networks, with SODAX swaps built in. Nothing is signed
              until you see it on the Game Boy and hold A.
            </p>
            <button className="pill-btn ghost" onClick={() => setSheet(true)}>
              Show the Game Boy
            </button>
          </section>
        )}
        <div className="app-device">
          <KagiApp onOpen={() => setSheet(true)} full={!desktop} />
        </div>
      </div>

      <div className={`gb-sheet ${sheet ? "is-open" : ""}`} aria-hidden={!sheet}>
        <button className="gb-sheet-scrim" aria-label="Close the Game Boy" onClick={() => !asking && setSheet(false)} tabIndex={sheet ? 0 : -1} />
        <div className="gb-sheet-body" role="dialog" aria-label="Your Game Boy">
          <button className="gb-sheet-grab" onClick={() => !asking && setSheet(false)} aria-label="Hide the Game Boy" tabIndex={sheet ? 0 : -1}>
            <i />
          </button>
          <p className="gb-sheet-title">{asking ? "Your Game Boy needs you" : "Your Game Boy"}</p>
          <GameBoyShell active={sheet} />
        </div>
      </div>
    </div>
  );
}

/**
 * The app's screen, everything you'd see on the phone. Used on its own at /app and inside the phone
 * beside the Game Boy at /demo. `onOpen` brings the Game Boy into view where it isn't already; `full`
 * makes it the whole page (a phone), with its tab bar and sheets fixed to the viewport.
 */
export function KagiApp({ onOpen, full = false }: { onOpen?: () => void; full?: boolean }) {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("wallet");
  const [swaps, setSwaps] = useState<SwapRecord[]>([]);
  const stage = !s.powered ? "connect" : s.chip.state === "none" ? "setup" : s.chip.state === "locked" ? "unlock" : !s.chip.paired ? "pair" : "main";
  return (
    <div className={`kapp app-screen ${full ? "is-full" : ""}`}>
      <StatusBar />
      <div className="app-view" key={stage}>
        {stage === "connect" && <Connect onOpen={onOpen} />}
        {stage === "setup" && <Setup onOpen={onOpen} />}
        {stage === "unlock" && <Unlock onOpen={onOpen} />}
        {stage === "pair" && <Pair />}
        {stage === "main" && <Main tab={tab} setTab={setTab} swaps={swaps} setSwaps={setSwaps} onOpen={onOpen} />}
      </div>
    </div>
  );
}

/* ---------- chrome ---------- */

function StatusBar() {
  const s = useSession();
  const linked = s.powered && s.chip.paired;
  return (
    <div className="app-status">
      <strong className="app-brand">kagiboy</strong>
      <span className={`app-link ${linked ? "is-on" : ""}`}>
        <span className="app-link-dot" aria-hidden />
        {!s.powered ? "No cartridge" : s.chip.state === "locked" ? "Locked" : s.chip.state === "none" ? "Setting up" : linked ? "Cartridge linked" : "Not paired"}
      </span>
    </div>
  );
}

/* ---------- before the wallet ---------- */

function Hero({ art, title, children }: { art: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="hero-screen">
      <div className="hero-art">{art}</div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

function Radar({ live = false }: { live?: boolean }) {
  return (
    <div className={`radar ${live ? "is-live" : ""}`} aria-hidden>
      <i />
      <i />
      <i />
      <img src="/renders/front-ortho.webp" alt="" />
    </div>
  );
}

function Connect({ onOpen }: { onOpen?: () => void }) {
  const s = useSession();
  return (
    <Hero art={<Radar />} title="Connect your kagiboy">
      <p className="hero-lede">Put the cartridge in your Game Boy and switch it on. Your keys stay in the cartridge; this app can only ask.</p>
      <button
        className="pill-btn"
        onClick={() => {
          s.powerOn();
          onOpen?.();
        }}
      >
        Switch on
      </button>
    </Hero>
  );
}

function Setup({ onOpen }: { onOpen?: () => void }) {
  return (
    <Hero art={<Radar live />} title="Set up on your Game Boy">
      <ol className="steps">
        <li>
          <b>1</b> Press START and mash the buttons
        </li>
        <li>
          <b>2</b> Shake it, then write down your 12 words
        </li>
        <li>
          <b>3</b> Pick a PIN
        </li>
      </ol>
      <p className="hero-note">Testnet demo: never restore a real recovery phrase here.</p>
      <OpenGameBoy onOpen={onOpen} />
    </Hero>
  );
}

function Unlock({ onOpen }: { onOpen?: () => void }) {
  return (
    <Hero art={<Radar live />} title="Unlock with your PIN">
      <p className="hero-lede">Press START on the Game Boy, then enter your PIN. Arrows change digits, A confirms.</p>
      <OpenGameBoy onOpen={onOpen} />
    </Hero>
  );
}

function OpenGameBoy({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <button className="pill-btn ghost" onClick={onOpen}>
      Open the Game Boy
    </button>
  );
}

function Pair() {
  const s = useSession();
  const code = s.chip.pairingCode;
  if (s.phone.pairState === "waiting" && code) {
    return (
      <Hero art={<Radar live />} title="Check the code">
        <p className="pair-digits" aria-label={`Pairing code ${code.split("").join(" ")}`}>
          {code.split("").map((d, i) => (
            <span key={i} style={{ ["--i" as string]: i }}>
              {d}
            </span>
          ))}
        </p>
        <p className="hero-lede">Your Game Boy shows a code too. If they match, press A on the Game Boy.</p>
      </Hero>
    );
  }
  return (
    <Hero art={<Radar live />} title="Pair this phone">
      <p className="hero-lede">Both screens will show the same 6-digit code. Accept it on the Game Boy, and this phone can ask the cartridge to sign.</p>
      {s.phone.pairState === "refused" && <p className="hero-note">{s.phone.pairError || "Pairing was turned down on the Game Boy."}</p>}
      <button className="pill-btn" onClick={() => s.phone.pair()}>
        Pair cartridge
      </button>
    </Hero>
  );
}

/* ---------- the wallet ---------- */

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "wallet", label: "Wallet", icon: <path d="M4 7.5h16v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V7.5Zm0 0V6a1.5 1.5 0 0 1 1.5-1.5H17M15.5 13.5h1.5" /> },
  { id: "swap", label: "Swap", icon: <path d="M7 4.5 4 7.5l3 3M4 7.5h13M17 13.5l3 3-3 3M20 16.5H7" /> },
  { id: "act-screen", label: "Activity", icon: <path d="M4 12h3.5l2.5-6 4 12 2.5-6H20" /> },
  { id: "cartridge", label: "Cartridge", icon: <path d="M6 3.5h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1ZM8.5 8h7v5h-7z" /> },
];

function Main({
  tab,
  setTab,
  swaps,
  setSwaps,
  onOpen,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  swaps: SwapRecord[];
  setSwaps: React.Dispatch<React.SetStateAction<SwapRecord[]>>;
  onOpen?: () => void;
}) {
  const [sheet, setSheet] = useState<null | "send" | "receive">(null);
  return (
    <>
      <div className="tab-view" key={tab}>
        {tab === "wallet" && <Wallet onSend={() => setSheet("send")} onReceive={() => setSheet("receive")} onSwap={() => setTab("swap")} swaps={swaps} />}
        {tab === "swap" && <Swap onRecord={(r) => setSwaps((all) => [r, ...all.filter((x) => x.id !== r.id)])} onOpen={onOpen} />}
        {tab === "act-screen" && <Activity swaps={swaps} />}
        {tab === "cartridge" && <Cartridge onOpen={onOpen} />}
      </div>
      <nav className="app-tabs" aria-label="App">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden>
              {t.icon}
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
      <Sheet open={sheet === "send"} onClose={() => setSheet(null)} title="Send">
        <SendSheet onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "receive"} onClose={() => setSheet(null)} title="Receive">
        <ReceiveSheet />
      </Sheet>
    </>
  );
}

function Wallet({ onSend, onReceive, onSwap, swaps }: { onSend: () => void; onReceive: () => void; onSwap: () => void; swaps: SwapRecord[] }) {
  const s = useSession();
  const addr = s.chip.addresses;
  const sol = s.phone.balances.sol;
  const evm = s.phone.balances.evm;
  const net = s.phone.evmNet;
  const recent = [...s.phone.activity.slice(0, 2).map((a) => ({ id: a.id, title: `Sent ${a.amount}`, sub: label(a.state), at: 0 })), ...swaps.slice(0, 2).map((w) => ({ id: w.id, title: `${w.sell} → ${w.buy}`, sub: swapLabel(w.state), at: w.at }))];
  return (
    <div className="wallet">
      <section className="acct-cards" aria-label="Accounts">
        <article className="acct acct-sol" style={{ ["--n" as string]: 0 }}>
          <header>
            <span>Solana</span>
            <span className="acct-net">Devnet</span>
          </header>
          <Amount value={sol} decimals={9} symbol="SOL" />
          <p className="acct-addr">{addr ? short(addr.sol) : "…"}</p>
        </article>
        <article className="acct acct-evm" style={{ ["--n" as string]: 1 }}>
          <header>
            <select className="acct-pick" value={net.id} onChange={(e) => s.phone.setEvmNetwork(Number(e.target.value))} aria-label="EVM network">
              {EVM_NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name === "Robinhood" ? "Robinhood Chain" : n.name}
                </option>
              ))}
            </select>
            <span className="acct-net">Testnet</span>
          </header>
          <Amount value={evm} decimals={18} symbol={net.symbol} />
          <p className="acct-addr">{addr ? short(addr.evm) : "…"}</p>
          {evm === 0n && net.faucet && (
            <a className="acct-fund" href={net.faucet} target="_blank" rel="noreferrer" onClick={() => addr && navigator.clipboard?.writeText(addr.evm).catch(() => {})}>
              Get test {net.symbol} ↗
            </a>
          )}
          {evm === 0n && !net.faucet && net.fundHint && <p className="acct-hint">{net.fundHint}</p>}
        </article>
      </section>

      <div className="wallet-actions">
        <Action label="Send" onClick={onSend} d="M12 19V5m0 0-6 6m6-6 6 6" />
        <Action label="Receive" onClick={onReceive} d="M12 5v14m0 0 6-6m-6 6-6-6" />
        <Action label="Swap" onClick={onSwap} d="M7 4.5 4 7.5l3 3M4 7.5h13M17 13.5l3 3-3 3M20 16.5H7" />
      </div>

      {sol === 0n && (
        <a className="fund" href="https://faucet.solana.com" target="_blank" rel="noreferrer" onClick={() => addr && navigator.clipboard?.writeText(addr.sol).catch(() => {})}>
          <b>Get test SOL</b>
          <span>Your address is copied. Paste it on the faucet.</span>
        </a>
      )}

      <section className="recent">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p className="empty-line">Nothing yet. Send something or try a swap.</p>
        ) : (
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <span>{r.title}</span>
                <small>{r.sub}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Action({ label: text, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button className="wallet-action" onClick={onClick}>
      <span>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={d} />
        </svg>
      </span>
      {text}
    </button>
  );
}

/** A balance that counts to its new value instead of jumping. */
function Amount({ value, decimals, symbol }: { value: bigint | null; decimals: number; symbol: string }) {
  const target = value === null ? null : Number(formatUnits(value, decimals));
  const shown = useTween(target ?? 0);
  return (
    <p className="acct-amount">
      {target === null ? <span className="shimmer">0.0000</span> : shown.toFixed(4)} <small>{symbol}</small>
    </p>
  );
}

/* ---------- swap ---------- */

function Swap({ onRecord, onOpen }: { onRecord: (r: SwapRecord) => void; onOpen?: () => void }) {
  const s = useSession();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [sell, setSell] = useState<Token | null>(null);
  const [buy, setBuy] = useState<Token | null>(null);
  const [amount, setAmount] = useState("1");
  const [q, setQ] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qErr, setQErr] = useState("");
  const [picking, setPicking] = useState<null | "sell" | "buy">(null);
  const [flip, setFlip] = useState(0);
  const [details, setDetails] = useState(false);
  const [result, setResult] = useState<null | { state: "signed" | "rejected" | "failed"; text: string }>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    loadTokens()
      .then((t) => {
        if (!live) return;
        setTokens(t);
        setSell(t.find((x) => x.chain === "solana" && x.symbol === "SOL") ?? t[0]);
        setBuy(t.find((x) => x.chain === "0x2105.base" && x.symbol === "USDC") ?? t[1]);
      })
      .catch(() => live && setLoadErr("Couldn't reach SODAX. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, []);

  const sellUnits = useMemo(() => {
    if (!sell) return null;
    try {
      const u = parseUnits(amount.trim() || "0", sell.decimals);
      return u > 0n ? u : null;
    } catch {
      return null;
    }
  }, [amount, sell]);

  // live quote: after typing settles, and again every 20 seconds while you look at it
  useEffect(() => {
    if (!sell || !buy || !sellUnits) {
      setQ(null);
      return;
    }
    if (sell.chain === buy.chain && sell.address === buy.address) {
      setQ(null);
      setQErr("Pick two different tokens.");
      return;
    }
    let live = true;
    setQuoting(true);
    setQErr("");
    const t = setTimeout(() => {
      quote(sell, buy, sellUnits)
        .then((r) => live && setQ(r))
        .catch((e) => {
          if (!live) return;
          setQ(null);
          setQErr((e as Error).message);
        })
        .finally(() => live && setQuoting(false));
    }, 380);
    const again = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => {
      live = false;
      clearTimeout(t);
      clearInterval(again);
    };
  }, [sell, buy, sellUnits, tick]);

  const outNum = q ? Number(formatUnits(q.out, q.buy.decimals)) : 0;
  const outShown = useTween(outNum);

  const review = async () => {
    if (!q) return;
    const id = crypto.randomUUID();
    const rec: SwapRecord = {
      id,
      sell: `${fmt(q.sellAmount, q.sell.decimals)} ${q.sell.symbol}`,
      buy: `${fmt(q.minOut, q.buy.decimals)}+ ${q.buy.symbol}`,
      route: `${chainOf(q.sell.chain).name} → ${chainOf(q.buy.chain).name}`,
      state: "waiting",
      at: Date.now(),
    };
    try {
      const req = s.chip.requestSignature({ chain: "swap", swap: intentFor(q) });
      onRecord(rec);
      onOpen?.();
      const r = await req.result;
      if (r.approved) {
        onRecord({ ...rec, state: "signed" });
        setResult({ state: "signed", text: `${rec.sell} for at least ${rec.buy}` });
      } else {
        onRecord({ ...rec, state: "rejected" });
        setResult({ state: "rejected", text: r.reason === "rejected" ? "You pressed B on the Game Boy. Nothing was signed." : "The cartridge stopped before signing." });
      }
    } catch (e) {
      setResult({ state: "failed", text: (e as Error).message });
    }
  };

  if (result) return <SwapResult result={result} onAgain={() => setResult(null)} />;

  return (
    <div className="swap">
      <h1 className="screen-title">Swap</h1>
      <p className="screen-sub">Across chains with SODAX. Your Game Boy shows the deal before anything is signed.</p>

      {loadErr && <p className="err">{loadErr}</p>}

      <div className="swap-box">
        <div className="swap-side">
          <span className="swap-label">You pay</span>
          <div className="swap-row">
            <input
              className="swap-amt"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
              aria-label="Amount to pay"
              placeholder="0"
            />
            <TokenButton token={sell} onClick={() => setPicking("sell")} />
          </div>
        </div>

        <button
          className="swap-flip"
          style={{ rotate: `${flip * 180}deg` }}
          onClick={() => {
            setFlip((f) => f + 1);
            setSell(buy);
            setBuy(sell);
          }}
          aria-label="Swap direction"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
          </svg>
        </button>

        <div className="swap-side is-get">
          <span className="swap-label">You get</span>
          <div className="swap-row">
            <p className={`swap-amt is-out ${quoting ? "is-busy" : ""}`} aria-live="polite">
              {q ? outShown.toFixed(Math.min(6, q.buy.decimals > 6 ? 6 : 4)) : quoting ? <span className="shimmer">0.0000</span> : "0"}
            </p>
            <TokenButton token={buy} onClick={() => setPicking("buy")} />
          </div>
        </div>
      </div>

      {qErr && <p className="err">{qErr}</p>}

      {q && (
        <button className={`swap-details ${details ? "is-open" : ""}`} onClick={() => setDetails((d) => !d)} aria-expanded={details}>
          <span className="swap-rate">
            1 {q.sell.symbol} ≈ {rate(q)} {q.buy.symbol}
          </span>
          <span className="swap-chev" aria-hidden>
            ›
          </span>
          <dl>
            <div>
              <dt>Route</dt>
              <dd>
                {chainOf(q.sell.chain).name} → {chainOf(q.buy.chain).name} via SODAX
              </dd>
            </div>
            <div>
              <dt>Least you'll get</dt>
              <dd>
                {fmt(q.minOut, q.buy.decimals)} {q.buy.symbol}
              </dd>
            </div>
            <div>
              <dt>kagiboy fee ({PARTNER_FEE_BPS / 100}%)</dt>
              <dd>
                {fmt(q.partnerFee, q.sell.decimals)} {q.sell.symbol}
              </dd>
            </div>
            <div>
              <dt>SODAX fee (0.1%)</dt>
              <dd>
                {fmt(q.solverFee, q.sell.decimals)} {q.sell.symbol}
              </dd>
            </div>
            <div>
              <dt>Slippage</dt>
              <dd>{SLIPPAGE_BPS / 100}%</dd>
            </div>
          </dl>
        </button>
      )}

      <button className="pill-btn wide" disabled={!q || quoting || s.chip.hasPending} onClick={review}>
        {s.chip.hasPending ? "Waiting for your Game Boy…" : "Review on Game Boy"}
      </button>
      <p className="fine">Live mainnet quotes. This demo signs on the cartridge but doesn't send the swap.</p>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title={picking === "sell" ? "Pay with" : "Receive"}>
        {tokens && (
          <TokenList
            tokens={tokens}
            onPick={(t) => {
              if (picking === "sell") setSell(t);
              else setBuy(t);
              setPicking(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function TokenButton({ token, onClick }: { token: Token | null; onClick: () => void }) {
  return (
    <button className="tok-btn" onClick={onClick} disabled={!token}>
      {token ? <TokenIcon token={token} /> : <span className="tok-icon shimmer" />}
      <span className="tok-txt">
        <b>{token?.symbol ?? "…"}</b>
        <small>{token ? chainOf(token.chain).name : ""}</small>
      </span>
      <span className="tok-chev" aria-hidden>
        ⌄
      </span>
    </button>
  );
}

/** The token's real logo with its chain's logo in the corner (local files, see scripts/fetch_token_icons.py). */
function TokenIcon({ token }: { token: Token }) {
  const src = TOKEN_ICONS[`${token.chain}:${token.address.toLowerCase()}`] ?? SYMBOL_ICONS[token.symbol.toUpperCase()];
  const chain = CHAIN_ICONS[token.chain];
  return (
    <span className="tok-icon" aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : <b>{token.symbol.slice(0, 1)}</b>}
      {chain && <img className="tok-chain" src={chain} alt="" loading="lazy" />}
    </span>
  );
}

function TokenList({ tokens, onPick }: { tokens: Token[]; onPick: (t: Token) => void }) {
  const [find, setFind] = useState("");
  const [chain, setChain] = useState<string>("all");
  const shown = tokens.filter((t) => (chain === "all" || t.chain === chain) && (!find || `${t.symbol} ${t.name}`.toLowerCase().includes(find.toLowerCase())));
  return (
    <div className="tok-list">
      <input className="tok-find" placeholder="Search" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search tokens" />
      <div className="chips" role="tablist">
        {[{ key: "all", name: "All" }, ...SWAP_CHAINS].map((c) => (
          <button key={c.key} className={chain === c.key ? "is-on" : ""} onClick={() => setChain(c.key)}>
            {c.name}
          </button>
        ))}
      </div>
      <ul>
        {shown.slice(0, 80).map((t) => (
          <li key={`${t.chain}:${t.address}`}>
            <button onClick={() => onPick(t)}>
              <TokenIcon token={t} />
              <span>
                <b>{t.symbol}</b>
                <small>
                  {t.name} · {chainOf(t.chain).name}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwapResult({ result, onAgain }: { result: { state: "signed" | "rejected" | "failed"; text: string }; onAgain: () => void }) {
  const ok = result.state === "signed";
  return (
    <div className="result">
      <svg className={`result-mark ${ok ? "ok" : "no"}`} viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="28" />
        {ok ? <path d="M20 33l8 8 16-17" /> : <path d="M23 23l18 18M41 23 23 41" />}
      </svg>
      <h1>{ok ? "Signed on your Game Boy" : result.state === "rejected" ? "Not signed" : "Couldn't ask the cartridge"}</h1>
      <p>{result.text}</p>
      {ok && <p className="fine">Demo build: the signed swap isn't sent. Swaps go live with the cartridge.</p>}
      <button className="pill-btn" onClick={onAgain}>
        {ok ? "New swap" : "Try again"}
      </button>
    </div>
  );
}

/* ---------- activity, cartridge ---------- */

function Activity({ swaps }: { swaps: SwapRecord[] }) {
  const s = useSession();
  const sends = s.phone.activity;
  return (
    <div className="act-screen">
      <h1 className="screen-title">Activity</h1>
      {sends.length === 0 && swaps.length === 0 && <p className="empty-line">Your sends and swaps will show up here.</p>}
      <ul className="act-list">
        {swaps.map((w) => (
          <li key={w.id} className={`act act-${w.state}`}>
            <span className="act-ico swap" aria-hidden>
              ⇄
            </span>
            <span className="act-main">
              <b>
                {w.sell} → {w.buy}
              </b>
              <small>{w.route}</small>
            </span>
            <span className="act-state">{swapLabel(w.state)}</span>
          </li>
        ))}
        {sends.map((a) => {
          const url = a.hash ? explorer[a.chain](a.hash, a.net) : "";
          return (
            <li key={a.id} className={`act act-${a.state}`}>
              <span className="act-ico" aria-hidden>
                ↑
              </span>
              <span className="act-main">
                <b>{a.amount}</b>
                <small>to {short(a.to)}</small>
              </span>
              <span className="act-state">
                {label(a.state)}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer">
                    View
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Cartridge({ onOpen }: { onOpen?: () => void }) {
  const s = useSession();
  return (
    <div className="cartridge">
      <h1 className="screen-title">Cartridge</h1>
      <div className="cart-card">
        <img src="/renders/front-ortho.webp" alt="" />
        <div>
          <b>kagiboy</b>
          <small>{s.chip.paired ? "Paired with this phone" : "Not paired"}</small>
        </div>
      </div>
      <ul className="settings">
        {onOpen && (
          <li>
            <span>Game Boy</span>
            <button className="link-like" onClick={onOpen}>
              Open
            </button>
          </li>
        )}
        <li>
          <span>Sound</span>
          <button className="link-like" onClick={() => s.toggleMute()}>
            {s.muted ? "Off" : "On"}
          </button>
        </li>
        <li>
          <span>Swap fee</span>
          <span className="muted">{PARTNER_FEE_BPS / 100}% to kagiboy</span>
        </li>
        <li>
          <span>Power</span>
          <button className="link-like" onClick={() => s.powerOff()}>
            Switch off
          </button>
        </li>
      </ul>
      <button className="pill-btn ghost wide danger" onClick={() => s.phone.unpair()}>
        Unpair this phone
      </button>
      <p className="fine">Keys are made and kept inside the cartridge. This phone only ever sees public addresses.</p>
    </div>
  );
}

/* ---------- send, receive ---------- */

function SendSheet({ onDone }: { onDone: () => void }) {
  const s = useSession();
  const [chain, setChain] = useState<Chain>("sol");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [err, setErr] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    // the phone checks the address and amount first; only close once it has handed off to the cartridge
    let failed = false;
    s.phone.send(chain, to.trim(), amt.trim()).catch((x) => {
      failed = true;
      setErr((x as Error).message);
    });
    setTimeout(() => !failed && onDone(), 150);
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="a-seg">
        {(["sol", "evm"] as const).map((c) => (
          <button type="button" key={c} className={chain === c ? "is-on" : ""} onClick={() => setChain(c)}>
            {c === "sol" ? "SOL" : s.phone.evmNet.symbol}
          </button>
        ))}
      </div>
      <label>
        To
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={chain === "sol" ? "Solana address" : "0x…"} autoComplete="off" spellCheck={false} />
      </label>
      <label>
        Amount
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0.0" />
      </label>
      {err && <p className="err">{err}</p>}
      <button className="pill-btn wide" disabled={s.phone.sending || s.chip.hasPending}>
        Ask cartridge to sign
      </button>
    </form>
  );
}

function ReceiveSheet() {
  const s = useSession();
  const [chain, setChain] = useState<Chain>("sol");
  const addr = s.chip.addresses?.[chain] ?? "";
  const svg = useMemo(() => {
    if (!addr) return "";
    const q = qrcode(0, "M");
    q.addData(addr);
    q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [addr]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="receive">
      <div className="a-seg">
        {(["sol", "evm"] as const).map((c) => (
          <button type="button" key={c} className={chain === c ? "is-on" : ""} onClick={() => setChain(c)}>
            {c === "sol" ? "Solana" : "EVM"}
          </button>
        ))}
      </div>
      <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="addr-full">{addr}</p>
      <button
        className="pill-btn wide"
        onClick={() => {
          navigator.clipboard?.writeText(addr).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }).catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy address"}
      </button>
      <p className="fine">{chain === "evm" ? "The same address on every EVM network." : "Solana devnet."} The Game Boy can show this as a QR code too.</p>
    </div>
  );
}

/* ---------- pieces ---------- */

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <div className={`sheet ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <button className="sheet-scrim" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1} />
      <div className="sheet-body" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <b>{title}</b>
          <button onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}>
            ✕
          </button>
        </div>
        {open && children}
      </div>
    </div>
  );
}

function useTween(target: number, ms = 650) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || a === target) {
      from.current = target;
      setV(target);
      return;
    }
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 4);
      const x = a + (target - a) * e;
      from.current = x;
      setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function useMedia(q: string) {
  const sub = useMemo(
    () => (fn: () => void) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    [q],
  );
  return useSyncExternalStore(sub, () => window.matchMedia(q).matches);
}

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function fmt(units: bigint, decimals: number) {
  const n = Number(formatUnits(units, decimals));
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function rate(q: Quote) {
  const r = Number(formatUnits(q.out, q.buy.decimals)) / Number(formatUnits(q.sellAmount, q.sell.decimals));
  return r >= 100 ? r.toFixed(2) : r >= 1 ? r.toFixed(4) : r.toPrecision(4);
}

function label(state: string) {
  return { waiting: "On the Game Boy", rejected: "Cancelled", broadcast: "Sending", confirmed: "Confirmed", failed: "Failed", unknown: "Check explorer" }[state] ?? state;
}

function swapLabel(state: SwapRecord["state"]) {
  return { waiting: "On the Game Boy", signed: "Signed (demo)", rejected: "Cancelled", failed: "Failed" }[state];
}
