import "../polyfill"; // must run before @solana/web3.js loads
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
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
import { blip, PixelIcon, type PixelName } from "./pixel";
import { SwapTicket, type TicketToken } from "./ui/swap-ticket";
import { ThreeDButton } from "./ui/three-d-button";
import { BottomSheet } from "./ui/bottom-sheet";
import AnimatedBackground from "./ui/animated-background";
import { TransactionList, type ActivityItem } from "./ui/transaction-list";
import "./tw.css";
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
  fees: string;
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
            <ThreeDButton variant="soft" size="lg" className="kb-cta" onClick={() => setSheet(true)}>
              Show the Game Boy
            </ThreeDButton>
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
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <SheetHost.Provider value={{ el: root, contained: !full }}>
    <div ref={setRoot} className={`kapp app-screen ${full ? "is-full" : ""}`}>
      <StatusBar />
      <div className="app-view" key={stage}>
        {stage === "connect" && <Connect onOpen={onOpen} />}
        {stage === "setup" && <Setup onOpen={onOpen} />}
        {stage === "unlock" && <Unlock onOpen={onOpen} />}
        {stage === "pair" && <Pair />}
        {stage === "main" && <Main tab={tab} setTab={setTab} swaps={swaps} setSwaps={setSwaps} onOpen={onOpen} />}
      </div>
    </div>
    </SheetHost.Provider>
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
        <span className={`gb-led ${linked ? "is-on" : s.powered ? "is-warn" : ""}`} aria-hidden />
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
      <ThreeDButton variant="solid" size="lg" className="kb-cta"
        onClick={() => {
          s.powerOn();
          onOpen?.();
        }}
      >
        Switch on
      </ThreeDButton>
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
    <ThreeDButton variant="soft" size="lg" className="kb-cta" onClick={onOpen}>
      Open the Game Boy
    </ThreeDButton>
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
      <ThreeDButton variant="solid" size="lg" className="kb-cta" onClick={() => s.phone.pair()}>
        Pair cartridge
      </ThreeDButton>
    </Hero>
  );
}

/* ---------- the wallet ---------- */

const TABS: { id: Tab; label: string; icon: PixelName }[] = [
  { id: "wallet", label: "Wallet", icon: "wallet" },
  { id: "swap", label: "Swap", icon: "swap" },
  { id: "act-screen", label: "Activity", icon: "activity" },
  { id: "cartridge", label: "Cartridge", icon: "cartridge" },
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
  const s = useSession();
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
        <AnimatedBackground
          defaultValue={tab}
          className="tab-pill"
          transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
          onValueChange={(id) => {
            if (!id || id === tab) return;
            blip(s.muted, 880);
            setTab(id as Tab);
          }}
        >
          {TABS.map((t) => (
            <button key={t.id} data-id={t.id} type="button" className={tab === t.id ? "is-on" : ""} aria-current={tab === t.id ? "page" : undefined}>
              <span className="tab-inner">
                <PixelIcon name={t.icon} size={22} />
                {t.label}
              </span>
            </button>
          ))}
        </AnimatedBackground>
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
      <section className="gb-panel" aria-label="Accounts">
        <div className="gb-bezel-top" aria-hidden>
          <i />
          <span>DOT MATRIX WITH SECURE CHIP</span>
          <i />
        </div>
        <div className="gb-bezel-body">
          <div className="gb-led-col" aria-hidden>
            <span className={`gb-led ${s.chip.paired ? "is-on" : ""}`} />
            <small>LINK</small>
          </div>
          <div className="lcd">
            <div className="lcd-head">
              <PixelIcon name="key" size={14} />
              <b>kagiboy</b>
              <span>UNLOCKED</span>
            </div>
            <div className="lcd-acct">
              <div className="lcd-acct-top">
                <img src={CHAIN_ICONS.solana} alt="" />
                <span>Solana</span>
                <em>DEVNET</em>
              </div>
              <Amount value={sol} decimals={9} symbol="SOL" />
              <p className="lcd-addr">{addr ? short(addr.sol) : "…"}</p>
            </div>
            <div className="lcd-acct">
              <div className="lcd-acct-top">
                <img src={CHAIN_ICONS[SWAP_CHAINS.find((c) => c.side.chain === "evm" && c.side.net === net.id)?.key ?? "ethereum"]} alt="" />
                <select className="lcd-pick" value={net.id} onChange={(e) => s.phone.setEvmNetwork(Number(e.target.value))} aria-label="EVM network">
                  {EVM_NETWORKS.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name === "Robinhood" ? "Robinhood Chain" : n.name}
                    </option>
                  ))}
                </select>
                <em>TESTNET</em>
              </div>
              <Amount value={evm} decimals={18} symbol={net.symbol} />
              <p className="lcd-addr">{addr ? short(addr.evm) : "…"}</p>
            </div>
          </div>
        </div>
      </section>

      {(evm === 0n && (net.faucet || net.fundHint)) && (
        <div className="fund-row">
          {net.faucet ? (
            <a className="fund-chip" href={net.faucet} target="_blank" rel="noreferrer" onClick={() => addr && navigator.clipboard?.writeText(addr.evm).catch(() => {})}>
              Get test {net.symbol} ↗
            </a>
          ) : (
            <p className="acct-hint">{net.fundHint}</p>
          )}
        </div>
      )}

      <div className="wallet-actions">
        <Action label="Send" onClick={onSend} icon="send" />
        <Action label="Receive" onClick={onReceive} icon="receive" />
        <Action label="Swap" onClick={onSwap} icon="swap" />
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

/** A round button in console plastic, its label printed in the Game Boy's navy italics. */
function Action({ label: text, onClick, icon }: { label: string; onClick: () => void; icon: PixelName }) {
  const s = useSession();
  return (
    <button
      className="wallet-action"
      onClick={() => {
        blip(s.muted);
        onClick();
      }}
    >
      <span className="console-btn">
        <PixelIcon name={icon} size={22} />
      </span>
      <b>{text}</b>
    </button>
  );
}

/** A balance that counts to its new value instead of jumping. */
function Amount({ value, decimals, symbol }: { value: bigint | null; decimals: number; symbol: string }) {
  const target = value === null ? null : Number(formatUnits(value, decimals));
  const shown = useTween(target ?? 0);
  return (
    <p className="lcd-amount">
      {target === null ? <span className="lcd-dash">--.----</span> : shown.toFixed(4)} <small>{symbol}</small>
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
      fees: `${fmt(q.partnerFee + q.solverFee, q.sell.decimals)} ${q.sell.symbol}`,
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

      {qErr && <p className="err">{qErr}</p>}

      <SwapTicket
        pay={sell && ticketToken(sell)}
        get={buy && ticketToken(buy)}
        amount={amount}
        onAmount={setAmount}
        out={q ? outShown.toFixed(Math.min(6, q.buy.decimals > 6 ? 6 : 4)) : ""}
        quoting={quoting}
        onFlip={() => {
          blip(s.muted, 784);
          setSell(buy);
          setBuy(sell);
        }}
        onPick={(side) => setPicking(side === "pay" ? "sell" : "buy")}
        picking={picking === null ? null : picking === "sell" ? "pay" : "get"}
        onClosePicker={() => setPicking(null)}
        picker={
          tokens && (
            <TokenList
              tokens={tokens}
              onPick={(t) => {
                blip(s.muted, 880);
                if (picking === "sell") setSell(t);
                else setBuy(t);
                setPicking(null);
              }}
            />
          )
        }
        footer={
          q && (
          <div className="swap-slip receipt paper-white" aria-label="Quote details">
            <p className="px slip-title">SODAX QUOTE</p>
            <p className="px slip-rate">
              1 {q.sell.symbol} = {rate(q)} {q.buy.symbol}
            </p>
            <ul className="px">
              <li>
                <span>ROUTE</span>
                <i />
                <span>
                  {chainOf(q.sell.chain).name.toUpperCase()} → {chainOf(q.buy.chain).name.toUpperCase()}
                </span>
              </li>
              <li>
                <span>AT LEAST</span>
                <i />
                <span>
                  {fmt(q.minOut, q.buy.decimals)} {q.buy.symbol}
                </span>
              </li>
              <li>
                <span>KAGIBOY {PARTNER_FEE_BPS / 100}%</span>
                <i />
                <span>
                  {fmt(q.partnerFee, q.sell.decimals)} {q.sell.symbol}
                </span>
              </li>
              <li>
                <span>SODAX 0.1%</span>
                <i />
                <span>
                  {fmt(q.solverFee, q.sell.decimals)} {q.sell.symbol}
                </span>
              </li>
              <li>
                <span>SLIPPAGE</span>
                <i />
                <span>{SLIPPAGE_BPS / 100}%</span>
              </li>
            </ul>
            <p className="px slip-foot">FEES ARE INCLUDED ABOVE</p>
          </div>
        )
        }
        cta={{
          label: s.chip.hasPending ? "Waiting for your Game Boy…" : !sellUnits ? "Enter an amount" : quoting && !q ? "Getting a quote…" : "Review on Game Boy",
          enabled: !!q && !quoting && !s.chip.hasPending,
          glyph: (
            <span className="a-glyph" aria-hidden>
              A
            </span>
          ),
          onClick: () => {
            blip(s.muted);
            void review();
          },
        }}
      />
      <p className="fine">Live mainnet quotes. This demo signs on the cartridge but doesn't send the swap.</p>

    </div>
  );
}

function ticketToken(t: Token): TicketToken {
  return { key: `${t.chain}:${t.address}`, symbol: t.symbol, sub: chainOf(t.chain).name, icon: <TokenIcon token={t} /> };
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
      <div className={`result-lcd ${ok ? "ok" : "no"}`} aria-hidden>
        <svg className="result-mark" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" />
          {ok ? <path d="M20 33l8 8 16-17" /> : <path d="M23 23l18 18M41 23 23 41" />}
        </svg>
        <span className="px">{ok ? "SIGNED" : "NOT SIGNED"}</span>
      </div>
      <h1>{ok ? "Signed on your Game Boy" : result.state === "rejected" ? "Not signed" : "Couldn't ask the cartridge"}</h1>
      <p>{result.text}</p>
      {ok && <p className="fine">Demo build: the signed swap isn't sent. Swaps go live with the cartridge.</p>}
      <ThreeDButton variant="solid" size="lg" className="kb-cta" onClick={onAgain}>
        {ok ? "New swap" : "Try again"}
      </ThreeDButton>
    </div>
  );
}

/* ---------- activity, cartridge ---------- */

function Activity({ swaps }: { swaps: SwapRecord[] }) {
  const s = useSession();
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const items: ActivityItem[] = [
    ...swaps.map((w): ActivityItem => ({
      id: w.id,
      icon: <PixelIcon name="swap" size={20} />,
      title: `${w.sell} → ${w.buy}`,
      sub: w.route,
      state: swapLabel(w.state),
      tone: w.state === "signed" ? "ok" : w.state === "waiting" ? "wait" : w.state === "failed" ? "bad" : "plain",
      details: [
        ["Swap", w.route],
        ["You pay", w.sell],
        ["You get", w.buy],
        ["Fees", w.fees],
        ["Time", time(w.at)],
        ["Sent", "No, demo build"],
      ],
    })),
    ...s.phone.activity.map((a): ActivityItem => {
      const url = a.hash ? explorer[a.chain](a.hash, a.net) : "";
      return {
        id: a.id,
        icon: <PixelIcon name="send" size={20} />,
        title: `Sent ${a.amount}`,
        sub: `to ${short(a.to)}`,
        state: label(a.state),
        tone: a.state === "confirmed" ? "ok" : a.state === "waiting" || a.state === "broadcast" ? "wait" : a.state === "failed" ? "bad" : "plain",
        details: [
          ["To", short(a.to)],
          ["Amount", a.amount],
          ["Network", a.chain === "sol" ? "Solana devnet" : (EVM_NETWORKS.find((n) => n.id === a.net)?.name ?? "EVM") + " testnet"],
          ...(a.hash ? ([["Hash", short(a.hash)]] as [string, string][]) : []),
          ...(a.error ? ([["Note", a.error]] as [string, string][]) : []),
        ],
        link: url ? { href: url, label: "View on explorer" } : undefined,
      };
    }),
  ];
  return (
    <div className="act-screen">
      <h1 className="screen-title">Activity</h1>
      <p className="screen-sub">Tap one to see what the cartridge signed.</p>
      <TransactionList items={items} empty={<p className="empty-line">Your sends and swaps will show up here.</p>} />
    </div>
  );
}

function Cartridge({ onOpen }: { onOpen?: () => void }) {
  const s = useSession();
  return (
    <div className="cartridge">
      <h1 className="screen-title">Cartridge</h1>
      <div className="cart-card">
        <img src="/renders/cart-hero.webp" alt="" />
        <div className="cart-card-txt">
          <span className="px">CARTRIDGE</span>
          <b>kagiboy</b>
          <small>
            <span className={`gb-led ${s.chip.paired ? "is-on" : ""}`} aria-hidden /> {s.chip.paired ? "Paired with this phone" : "Not paired"}
          </small>
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
      <ThreeDButton variant="soft" size="lg" className="w-full !text-[#b2364e] kb-cta" onClick={() => s.phone.unpair()}>
        Unpair this phone
      </ThreeDButton>
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
      <ThreeDButton type="submit" variant="solid" size="lg" className="w-full kb-cta" disabled={s.phone.sending || s.chip.hasPending}>
        Ask cartridge to sign
      </ThreeDButton>
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
      <ThreeDButton variant="solid" size="lg" className="w-full kb-cta"
        onClick={() => {
          navigator.clipboard?.writeText(addr).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }).catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy address"}
      </ThreeDButton>
      <p className="fine">{chain === "evm" ? "The same address on every EVM network." : "Solana devnet."} The Game Boy can show this as a QR code too.</p>
    </div>
  );
}

/* ---------- pieces ---------- */

/** Where the app's sheets mount: inside the app screen, so they keep its look and stay in its frame. */
const SheetHost = createContext<{ el: HTMLElement | null; contained: boolean }>({ el: null, contained: false });

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const host = useContext(SheetHost);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      snapPoints={["auto"]}
      container={host.el}
      contained={host.contained}
      className="kapp-sheet"
    >
      {children}
    </BottomSheet>
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
