import "../polyfill"; // must run before @solana/web3.js loads
import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronRight, Copy, Gamepad2, History, Power, Volume2, VolumeX, Wallet as WalletIcon } from "lucide-react";
import qrcode from "qrcode-generator";
import { formatUnits, parseUnits } from "viem";
import type { Chain } from "../chip/protocol";
import { EVM_NETWORKS } from "../chip/networks";
import { useSession } from "../demo/session";
import { explorer } from "../phone/phone";
import { chainOf, intentFor, loadTokens, PARTNER_FEE_BPS, quote, SLIPPAGE_BPS, SWAP_CHAINS, type Quote, type Token } from "./swap";
import { CHAIN_ICONS, SYMBOL_ICONS, TOKEN_ICONS } from "./tokenIcons";
import { blip } from "./sound";
import { SwapTicket, type TicketToken } from "./ui/swap-ticket";
import { ThreeDButton } from "./ui/three-d-button";
import { BottomSheet } from "./ui/bottom-sheet";
import AnimatedBackground from "./ui/animated-background";
import { TransactionList, type ActivityItem } from "./ui/transaction-list";
import { AnimateDigits } from "./ui/animate-digits";
import { SegmentedControl } from "./ui/segmented-control";
import { cn } from "./ui/utils";
import "./tw.css";

/*
 * The kagiboy phone app. Quiet and clean: white surfaces, one accent, motion that explains what
 * changed. The Game Boy shows up as a homage only: the A key on the sign button, the link LED.
 */

type Tab = "wallet" | "swap" | "activity" | "cartridge";

interface SwapRecord {
  id: string;
  sell: string;
  buy: string;
  route: string;
  fees: string;
  state: "waiting" | "signed" | "rejected" | "failed";
  at: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Where the app's sheets mount: inside the app, so they stay in its frame on the demo page. */
const SheetHost = createContext<{ el: HTMLElement | null; contained: boolean }>({ el: null, contained: true });

/**
 * The app screen. `onOpen` brings the Game Boy into view where it isn't already (the phone layout
 * of /demo); `full` makes it the whole page, with its tab bar and sheets fixed to the viewport.
 */
export function KagiApp({ onOpen, full = false }: { onOpen?: () => void; full?: boolean }) {
  const s = useSession();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<Tab>("wallet");
  const [swaps, setSwaps] = useState<SwapRecord[]>([]);
  const stage = !s.powered ? "connect" : s.chip.state === "none" ? "setup" : s.chip.state === "locked" ? "unlock" : !s.chip.paired ? "pair" : "main";

  return (
    <SheetHost.Provider value={{ el: root, contained: !full }}>
      <div ref={setRoot} className={cn("kapp relative flex flex-col overflow-hidden bg-background font-sans text-foreground antialiased", full ? "min-h-svh" : "h-full")}>
        <Header />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stage}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {stage === "connect" && <Connect onOpen={onOpen} />}
            {stage === "setup" && <Setup onOpen={onOpen} />}
            {stage === "unlock" && <Unlock onOpen={onOpen} />}
            {stage === "pair" && <Pair />}
            {stage === "main" && <Main tab={tab} setTab={setTab} swaps={swaps} setSwaps={setSwaps} onOpen={onOpen} full={full} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </SheetHost.Provider>
  );
}

/* ---------- header ---------- */

function Header() {
  const s = useSession();
  const linked = s.powered && s.chip.paired;
  const label = !s.powered ? "No cartridge" : s.chip.state === "locked" ? "Locked" : s.chip.state === "none" ? "Setting up" : linked ? "Linked" : "Not paired";
  return (
    <header className="kapp-head flex items-center justify-between px-5 pb-2 pt-4">
      <span className="font-display text-[19px] font-semibold tracking-[-0.03em]">kagiboy</span>
      <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
        <span className="relative grid size-2 place-items-center">
          {linked && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />}
          <span className={cn("relative inline-flex size-2 rounded-full", linked ? "bg-emerald-500" : s.powered ? "bg-amber-400" : "bg-zinc-300")} />
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </header>
  );
}

/* ---------- before the wallet ---------- */

function Intro({ title, children, live = false }: { title: string; children: ReactNode; live?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-7 pb-8 text-center">
      <div className="relative mb-7 grid size-36 place-items-center">
        {live &&
          !reduced &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border border-[#8fb2ff]/50"
              initial={{ scale: 0.55, opacity: 0.8 }}
              animate={{ scale: 1.25, opacity: 0 }}
              transition={{ duration: 3, delay: i, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        <span className="absolute inset-4 rounded-full bg-gradient-to-br from-[#e6efff] to-[#ffe9f0]" />
        <motion.img
          src="/renders/front-ortho.webp"
          alt=""
          className="relative w-[68px] drop-shadow-[0_14px_16px_rgba(40,44,70,0.22)]"
          animate={reduced ? undefined : { y: [0, -5, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <h1 className="m-0 font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h1>
      {children}
    </div>
  );
}

const lede = "mx-auto mt-3 max-w-[19rem] text-[15px] leading-relaxed text-muted-foreground";

function Cta({ children, onClick, variant = "solid", disabled, type = "button", className }: { children: ReactNode; onClick?: () => void; variant?: "solid" | "soft"; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  const s = useSession();
  return (
    <ThreeDButton
      type={type}
      variant={variant}
      size="lg"
      disabled={disabled}
      className={cn("h-[52px] rounded-2xl px-7 text-[15px]", variant === "solid" && "bg-foreground hover:bg-foreground/90", className)}
      onClick={() => {
        blip(s.muted);
        onClick?.();
      }}
    >
      {children}
    </ThreeDButton>
  );
}

function Connect({ onOpen }: { onOpen?: () => void }) {
  const s = useSession();
  return (
    <Intro title="Connect your kagiboy">
      <p className={lede}>Put the cartridge in your Game Boy and switch it on. Your keys stay in the cartridge; this app can only ask.</p>
      <Cta
        className="mt-7 min-w-[200px]"
        onClick={() => {
          s.powerOn();
          onOpen?.();
        }}
      >
        Switch on
      </Cta>
    </Intro>
  );
}

function Setup({ onOpen }: { onOpen?: () => void }) {
  const steps = ["Press START and mash the buttons", "Shake it, then write down your 12 words", "Pick a PIN"];
  return (
    <Intro title="Set up on your Game Boy" live>
      <ol className="m-0 mt-5 grid list-none gap-2.5 p-0 text-left">
        {steps.map((t, i) => (
          <motion.li key={t} className="flex items-center gap-3 text-[15px] text-foreground/80" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08, ease: EASE }}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold text-foreground">{i + 1}</span>
            {t}
          </motion.li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl bg-[#fff1f5] px-3.5 py-2 text-[13px] text-[#9b3355]">Testnet demo: never restore a real recovery phrase here.</p>
      {onOpen && (
        <Cta variant="soft" className="mt-5" onClick={onOpen}>
          Open the Game Boy
        </Cta>
      )}
    </Intro>
  );
}

function Unlock({ onOpen }: { onOpen?: () => void }) {
  return (
    <Intro title="Unlock with your PIN" live>
      <p className={lede}>Press START on the Game Boy, then enter your PIN. Arrows change digits, A confirms.</p>
      {onOpen && (
        <Cta variant="soft" className="mt-6" onClick={onOpen}>
          Open the Game Boy
        </Cta>
      )}
    </Intro>
  );
}

function Pair() {
  const s = useSession();
  const code = s.chip.pairingCode;
  const waiting = s.phone.pairState === "waiting" && code;
  return (
    <Intro title={waiting ? "Check the code" : "Pair this phone"} live>
      {waiting ? (
        <>
          <div className="mt-6 flex gap-1.5" aria-label={`Pairing code ${code.split("").join(" ")}`}>
            {code.split("").map((d, i) => (
              <motion.span
                key={i}
                className={cn("grid h-14 w-11 place-items-center rounded-xl border border-border bg-card font-display text-[28px] font-semibold shadow-[0_6px_16px_-12px_rgba(20,22,35,0.45)]", i === 2 && "mr-2")}
                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 380, damping: 26 }}
              >
                {d}
              </motion.span>
            ))}
          </div>
          <p className={lede}>Your Game Boy shows a code too. If they match, press A on the Game Boy.</p>
        </>
      ) : (
        <>
          <p className={lede}>Both screens will show the same 6-digit code. Accept it on the Game Boy, and this phone can ask the cartridge to sign.</p>
          {s.phone.pairState === "refused" && <p className="mt-4 rounded-xl bg-[#fff1f5] px-3.5 py-2 text-[13px] text-[#9b3355]">{s.phone.pairError || "Pairing was turned down on the Game Boy."}</p>}
          <Cta className="mt-7 min-w-[200px]" onClick={() => s.phone.pair()}>
            Pair cartridge
          </Cta>
        </>
      )}
    </Intro>
  );
}

/* ---------- the wallet ---------- */

const TABS: { id: Tab; label: string; icon: typeof WalletIcon }[] = [
  { id: "wallet", label: "Wallet", icon: WalletIcon },
  { id: "swap", label: "Swap", icon: ArrowLeftRight },
  { id: "activity", label: "Activity", icon: History },
  { id: "cartridge", label: "Cartridge", icon: Gamepad2 },
];

function Main({
  tab,
  setTab,
  swaps,
  setSwaps,
  onOpen,
  full,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  swaps: SwapRecord[];
  setSwaps: React.Dispatch<React.SetStateAction<SwapRecord[]>>;
  onOpen?: () => void;
  full: boolean;
}) {
  const s = useSession();
  const [sheet, setSheet] = useState<null | "send" | "receive" | "network">(null);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-1 [scrollbar-width:none]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28, ease: EASE }}>
            {tab === "wallet" && <Wallet onSheet={setSheet} onSwap={() => setTab("swap")} swaps={swaps} />}
            {tab === "swap" && <Swap onRecord={(r) => setSwaps((all) => [r, ...all.filter((x) => x.id !== r.id)])} onOpen={onOpen} />}
            {tab === "activity" && <Activity swaps={swaps} />}
            {tab === "cartridge" && <Cartridge onOpen={onOpen} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <nav className={cn("kapp-tabs inset-x-3 bottom-3 z-30 rounded-[22px] border border-border bg-card/95 p-1.5 shadow-[0_10px_30px_-14px_rgba(20,22,35,0.35)] backdrop-blur", full ? "fixed" : "absolute")} aria-label="App">
        <div className="grid grid-cols-4">
          <AnimatedBackground
            defaultValue={tab}
            className="rounded-[16px] bg-muted"
            transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
            onValueChange={(id) => {
              if (!id || id === tab) return;
              blip(s.muted, 880);
              setTab(id as Tab);
            }}
          >
            {TABS.map((t) => (
              <button key={t.id} data-id={t.id} type="button" className="w-full justify-center border-0 bg-transparent p-0" aria-current={tab === t.id ? "page" : undefined}>
                <span className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors", tab === t.id ? "text-foreground" : "text-muted-foreground")}>
                  <t.icon className="size-[21px]" strokeWidth={tab === t.id ? 2.2 : 1.8} />
                  {t.label}
                </span>
              </button>
            ))}
          </AnimatedBackground>
        </div>
      </nav>

      <Sheet open={sheet === "send"} onClose={() => setSheet(null)} title="Send">
        <SendSheet onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "receive"} onClose={() => setSheet(null)} title="Receive">
        <ReceiveSheet />
      </Sheet>
      <Sheet open={sheet === "network"} onClose={() => setSheet(null)} title="EVM network">
        <NetworkSheet onDone={() => setSheet(null)} />
      </Sheet>
    </>
  );
}

function evmChainKey(id: number) {
  return SWAP_CHAINS.find((c) => c.side.chain === "evm" && c.side.net === id)?.key ?? "ethereum";
}

function Wallet({ onSheet, onSwap, swaps }: { onSheet: (s: "send" | "receive" | "network") => void; onSwap: () => void; swaps: SwapRecord[] }) {
  const s = useSession();
  const addr = s.chip.addresses;
  const net = s.phone.evmNet;
  const rows = [
    { key: "sol", name: "Solana", net: "Devnet", icon: CHAIN_ICONS.solana, value: s.phone.balances.sol, decimals: 9, symbol: "SOL", addr: addr?.sol ?? "", onNet: undefined as undefined | (() => void) },
    { key: "evm", name: net.name === "Robinhood" ? "Robinhood Chain" : net.name, net: "Testnet", icon: CHAIN_ICONS[evmChainKey(net.id)], value: s.phone.balances.evm, decimals: 18, symbol: net.symbol, addr: addr?.evm ?? "", onNet: () => onSheet("network") },
  ];
  const recent = useRecent(swaps).slice(0, 3);
  const needSol = s.phone.balances.sol === 0n;
  const needEvm = s.phone.balances.evm === 0n;
  return (
    <div className="pt-2">
      <p className="m-0 text-[13px] font-medium text-muted-foreground">Accounts</p>
      <div className="mt-2.5 divide-y divide-border overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_1px_2px_rgba(20,22,35,0.04),0_10px_24px_-18px_rgba(20,22,35,0.3)]">
        {rows.map((r, i) => (
          <motion.div key={r.key} className="flex items-center gap-3 px-4 py-3.5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.07, ease: EASE }}>
            <img src={r.icon} alt="" className="size-10 rounded-full" />
            <div className="min-w-0 flex-1">
              {r.onNet ? (
                <button type="button" onClick={r.onNet} className="flex items-center gap-1 border-0 bg-transparent p-0 text-[15px] font-semibold text-foreground">
                  {r.name}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ) : (
                <p className="m-0 text-[15px] font-semibold">{r.name}</p>
              )}
              <p className="m-0 truncate text-[12px] text-muted-foreground">
                {r.net} · {short(r.addr)}
              </p>
            </div>
            <div className="text-right">
              <Balance value={r.value} decimals={r.decimals} />
              <p className="m-0 text-[12px] text-muted-foreground">{r.symbol}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {(needSol || needEvm) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {needSol && <FaucetChip href="https://faucet.solana.com" copy={addr?.sol} label="Get test SOL" />}
          {needEvm && net.faucet && <FaucetChip href={net.faucet} copy={addr?.evm} label={`Get test ${net.symbol}`} />}
          {needEvm && !net.faucet && net.fundHint && <p className="m-0 text-[12px] leading-snug text-muted-foreground">{net.fundHint}</p>}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <QuickAction icon={ArrowUp} label="Send" onClick={() => onSheet("send")} />
        <QuickAction icon={ArrowDown} label="Receive" onClick={() => onSheet("receive")} />
        <QuickAction icon={ArrowLeftRight} label="Swap" onClick={onSwap} />
      </div>

      <p className="m-0 mt-7 text-[13px] font-medium text-muted-foreground">Recent</p>
      <div className="mt-2.5">
        <TransactionList items={recent} empty={<p className="m-0 rounded-[18px] border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">Nothing yet. Send something or try a swap.</p>} />
      </div>
    </div>
  );
}

function Balance({ value, decimals }: { value: bigint | null; decimals: number }) {
  if (value === null) return <span className="inline-block h-5 w-16 animate-pulse rounded-md bg-muted" />;
  const n = Number(formatUnits(value, decimals));
  return <AnimateDigits value={n.toFixed(4)} className="justify-end font-display text-[17px] font-semibold tabular-nums" />;
}

function FaucetChip({ href, copy, label }: { href: string; copy?: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => copy && navigator.clipboard?.writeText(copy).catch(() => {})}
      className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground no-underline shadow-[0_1px_2px_rgba(20,22,35,0.05)] transition-colors hover:bg-muted"
    >
      {label} ↗
    </a>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof ArrowUp; label: string; onClick: () => void }) {
  const s = useSession();
  return (
    <button
      type="button"
      onClick={() => {
        blip(s.muted);
        onClick();
      }}
      className="group flex flex-col items-center gap-2 border-0 bg-transparent p-0"
    >
      <span className="grid size-[54px] place-items-center rounded-full border border-border bg-card shadow-[0_1px_1px_rgba(0,0,0,0.04),0_8px_18px_-12px_rgba(20,22,35,0.4)] transition-transform duration-200 group-active:scale-90">
        <Icon className="size-[22px]" strokeWidth={2} />
      </span>
      <span className="text-[13px] font-medium text-foreground">{label}</span>
    </button>
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
  const [picking, setPicking] = useState<null | "pay" | "get">(null);
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

  const review = async () => {
    if (!q) return;
    const rec: SwapRecord = {
      id: crypto.randomUUID(),
      sell: `${fmt(q.sellAmount, q.sell.decimals)} ${q.sell.symbol}`,
      buy: `${fmt(q.minOut, q.buy.decimals)}+ ${q.buy.symbol}`,
      route: `${chainOf(q.sell.chain).name} → ${chainOf(q.buy.chain).name}`,
      fees: `${fmt(q.partnerFee + q.solverFee, q.sell.decimals)} ${q.sell.symbol}`,
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

  const outText = q ? Number(formatUnits(q.out, q.buy.decimals)).toFixed(q.buy.decimals > 6 ? 6 : 4) : "";

  return (
    <div className="pt-2">
      <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.03em]">Swap</h1>
      <p className="m-0 mt-1 text-[14px] text-muted-foreground">Across chains with SODAX. You approve every swap on the Game Boy.</p>
      {(loadErr || qErr) && <p className="m-0 mt-3 text-[13px] text-[#b2364e]">{loadErr || qErr}</p>}

      <SwapTicket
        className="mt-4"
        pay={sell && ticketToken(sell)}
        get={buy && ticketToken(buy)}
        amount={amount}
        onAmount={setAmount}
        out={outText}
        quoting={quoting}
        onFlip={() => {
          blip(s.muted, 784);
          setSell(buy);
          setBuy(sell);
        }}
        onPick={(side) => setPicking(side)}
        picking={picking}
        onClosePicker={() => setPicking(null)}
        picker={
          tokens && (
            <TokenList
              tokens={tokens}
              onPick={(t) => {
                blip(s.muted, 880);
                if (picking === "pay") setSell(t);
                else setBuy(t);
                setPicking(null);
              }}
            />
          )
        }
        footer={q ? <QuoteDetails q={q} /> : null}
        cta={{
          label: s.chip.hasPending ? "Waiting for your Game Boy…" : !sellUnits ? "Enter an amount" : quoting && !q ? "Getting a quote…" : "Review on Game Boy",
          enabled: !!q && !quoting && !s.chip.hasPending,
          glyph: (
            <span aria-hidden className="grid size-[22px] place-items-center rounded-full bg-[#c13a73] text-[11px] font-bold italic text-white shadow-[inset_0_-1px_2px_rgba(0,0,0,0.3)]">
              A
            </span>
          ),
          onClick: () => {
            blip(s.muted);
            void review();
          },
        }}
      />
      <p className="m-0 mt-3 text-center text-[12px] leading-snug text-muted-foreground">Live mainnet quotes. This demo signs on the cartridge but doesn't send the swap.</p>
    </div>
  );
}

function QuoteDetails({ q }: { q: Quote }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ["Route", `${chainOf(q.sell.chain).name} → ${chainOf(q.buy.chain).name}`],
    ["Least you'll get", `${fmt(q.minOut, q.buy.decimals)} ${q.buy.symbol}`],
    [`kagiboy fee · ${PARTNER_FEE_BPS / 100}%`, `${fmt(q.partnerFee, q.sell.decimals)} ${q.sell.symbol}`],
    ["SODAX fee · 0.1%", `${fmt(q.solverFee, q.sell.decimals)} ${q.sell.symbol}`],
    ["Slippage", `${SLIPPAGE_BPS / 100}%`],
  ];
  return (
    <div className="mt-3 rounded-[18px] border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between border-0 bg-transparent px-4 py-3 text-[14px] text-foreground">
        <span>
          1 {q.sell.symbol} ≈ {rate(q)} {q.buy.symbol}
        </span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 32 }}>
          <ChevronRight className="size-4 text-muted-foreground" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.dl initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="m-0 overflow-hidden px-4">
            <div className="grid gap-2 border-t border-border pb-3.5 pt-3">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[13px]">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="m-0 text-right text-foreground">{v}</dd>
                </div>
              ))}
            </div>
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  );
}

function SwapResult({ result, onAgain }: { result: { state: "signed" | "rejected" | "failed"; text: string }; onAgain: () => void }) {
  const ok = result.state === "signed";
  return (
    <div className="flex flex-col items-center px-4 pt-14 text-center">
      <motion.div
        className={cn("grid size-20 place-items-center rounded-full", ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
      >
        <motion.svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d={ok ? "M5 12.5l4.5 4.5L19 7.5" : "M7 7l10 10M17 7 7 17"} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.45, ease: EASE }} />
        </motion.svg>
      </motion.div>
      <h2 className="m-0 mt-5 font-display text-[22px] font-semibold tracking-[-0.02em]">{ok ? "Signed on your Game Boy" : result.state === "rejected" ? "Not signed" : "Couldn't ask the cartridge"}</h2>
      <p className="m-0 mt-2 max-w-[18rem] text-[14px] text-muted-foreground">{result.text}</p>
      {ok && <p className="m-0 mt-3 max-w-[18rem] text-[12px] text-muted-foreground">Demo build: the signed swap isn't sent. Swaps go live with the cartridge.</p>}
      <Cta className="mt-6 min-w-[170px]" onClick={onAgain}>
        {ok ? "New swap" : "Try again"}
      </Cta>
    </div>
  );
}

function ticketToken(t: Token): TicketToken {
  return { key: `${t.chain}:${t.address}`, symbol: t.symbol, sub: chainOf(t.chain).name, icon: <TokenIcon token={t} /> };
}

/** The token's real logo, its chain's logo in the corner (local files, see scripts/fetch_token_icons.py). */
function TokenIcon({ token, size = 32 }: { token: Token; size?: number }) {
  const src = TOKEN_ICONS[`${token.chain}:${token.address.toLowerCase()}`] ?? SYMBOL_ICONS[token.symbol.toUpperCase()];
  const chain = CHAIN_ICONS[token.chain];
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" className="size-full rounded-full" /> : <span className="grid size-full place-items-center rounded-full bg-muted text-[13px] font-bold">{token.symbol[0]}</span>}
      {chain && <img src={chain} alt="" loading="lazy" className="absolute -bottom-0.5 -right-0.5 size-[14px] rounded-full ring-2 ring-card" />}
    </span>
  );
}

function TokenList({ tokens, onPick }: { tokens: Token[]; onPick: (t: Token) => void }) {
  const [find, setFind] = useState("");
  const [chain, setChain] = useState<string>("all");
  const shown = tokens.filter((t) => (chain === "all" || t.chain === chain) && (!find || `${t.symbol} ${t.name}`.toLowerCase().includes(find.toLowerCase())));
  return (
    <div className="flex flex-col gap-3">
      <input
        placeholder="Search tokens"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        aria-label="Search tokens"
        className="w-full rounded-xl border border-border bg-muted px-3.5 py-2.5 text-[15px] text-foreground outline-none focus:border-foreground/30"
      />
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {[{ key: "all", name: "All" }, ...SWAP_CHAINS].map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChain(c.key)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors", chain === c.key ? "border-foreground bg-foreground text-white" : "border-border bg-card text-muted-foreground hover:text-foreground")}
          >
            {c.name}
          </button>
        ))}
      </div>
      <ul className="m-0 list-none p-0">
        {shown.slice(0, 80).map((t) => (
          <li key={`${t.chain}:${t.address}`}>
            <button type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2.5 text-left transition-colors hover:bg-muted">
              <TokenIcon token={t} size={34} />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">{t.symbol}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {t.name} · {chainOf(t.chain).name}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- activity ---------- */

function useRecent(swaps: SwapRecord[]): ActivityItem[] {
  const s = useSession();
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return [
    ...swaps.map(
      (w): ActivityItem => ({
        id: w.id,
        icon: <ArrowLeftRight className="size-[18px]" />,
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
      }),
    ),
    ...s.phone.activity.map((a): ActivityItem => {
      const url = a.hash ? explorer[a.chain](a.hash, a.net) : "";
      return {
        id: a.id,
        icon: <ArrowUp className="size-[18px]" />,
        title: `Sent ${a.amount}`,
        sub: `to ${short(a.to)}`,
        state: label(a.state),
        tone: a.state === "confirmed" ? "ok" : a.state === "waiting" || a.state === "broadcast" ? "wait" : a.state === "failed" ? "bad" : "plain",
        details: [
          ["To", short(a.to)],
          ["Amount", a.amount],
          ["Network", a.chain === "sol" ? "Solana devnet" : `${EVM_NETWORKS.find((n) => n.id === a.net)?.name ?? "EVM"} testnet`],
          ...(a.hash ? ([["Hash", short(a.hash)]] as [string, string][]) : []),
          ...(a.error ? ([["Note", a.error]] as [string, string][]) : []),
        ],
        link: url ? { href: url, label: "View on explorer" } : undefined,
      };
    }),
  ];
}

function Activity({ swaps }: { swaps: SwapRecord[] }) {
  const items = useRecent(swaps);
  return (
    <div className="pt-2">
      <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.03em]">Activity</h1>
      <p className="m-0 mt-1 text-[14px] text-muted-foreground">Tap one to see what the cartridge signed.</p>
      <div className="mt-4">
        <TransactionList items={items} empty={<p className="m-0 rounded-[18px] border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">Your sends and swaps will show up here.</p>} />
      </div>
    </div>
  );
}

/* ---------- cartridge ---------- */

function Cartridge({ onOpen }: { onOpen?: () => void }) {
  const s = useSession();
  const ph = s.chip.phone;
  const rowCls = "flex w-full items-center gap-3 border-0 bg-transparent px-4 py-3.5 text-left text-[15px] text-foreground";
  return (
    <div className="pt-2">
      <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.03em]">Cartridge</h1>
      <div className="mt-4 flex items-center gap-4 rounded-[22px] border border-border bg-gradient-to-br from-[#f2f6ff] to-[#fff4f7] p-4">
        <img src="/renders/front-ortho.webp" alt="" className="w-12 drop-shadow-[0_8px_10px_rgba(40,44,70,0.2)]" />
        <div className="min-w-0">
          <p className="m-0 font-display text-[18px] font-semibold tracking-[-0.02em]">kagiboy</p>
          <p className="m-0 text-[13px] text-muted-foreground">{ph ? `Paired with this ${ph.name === "IPHONE" ? "iPhone" : "phone"}` : "Not paired"}</p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-[22px] border border-border bg-card">
        {onOpen && (
          <button type="button" className={rowCls} onClick={onOpen}>
            <Gamepad2 className="size-5 text-muted-foreground" />
            <span className="flex-1">Open the Game Boy</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        )}
        <div className={rowCls}>
          {s.muted ? <VolumeX className="size-5 text-muted-foreground" /> : <Volume2 className="size-5 text-muted-foreground" />}
          <span className="flex-1">Sound</span>
          <SegmentedControl
            label="Sound"
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            value={s.muted ? "off" : "on"}
            onValueChange={(v) => (v === "off") !== s.muted && s.toggleMute()}
          />
        </div>
        <div className={rowCls}>
          <ArrowLeftRight className="size-5 text-muted-foreground" />
          <span className="flex-1">Swap fee</span>
          <span className="text-[14px] text-muted-foreground">{PARTNER_FEE_BPS / 100}% to kagiboy</span>
        </div>
        <button type="button" className={rowCls} onClick={() => s.powerOff()}>
          <Power className="size-5 text-muted-foreground" />
          <span className="flex-1">Switch off</span>
        </button>
      </div>

      <Cta variant="soft" className="mt-4 w-full !text-[#b2364e]" onClick={() => s.phone.unpair()}>
        Unpair this phone
      </Cta>
      <p className="m-0 mt-3 text-center text-[12px] leading-snug text-muted-foreground">On the real cartridge the keys stay inside it and this phone only sees public addresses. In this demo the cartridge is simulated in your browser.</p>
    </div>
  );
}

/* ---------- sheets ---------- */

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const host = useContext(SheetHost);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={title} snapPoints={["auto"]} container={host.el} contained={host.contained} className="kapp-sheet">
      {children}
    </BottomSheet>
  );
}

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
  const field = "w-full rounded-xl border border-border bg-muted px-3.5 py-3 text-[15px] text-foreground outline-none transition-colors focus:border-foreground/30 focus:bg-card";
  return (
    <form className="grid gap-4 pt-1" onSubmit={submit}>
      <SegmentedControl
        label="Asset"
        options={[
          { value: "sol", label: "SOL" },
          { value: "evm", label: s.phone.evmNet.symbol },
        ]}
        value={chain}
        onValueChange={(v) => setChain(v as Chain)}
        className="w-full"
      />
      <label className="grid gap-1.5 text-[13px] font-medium text-muted-foreground">
        To
        <input className={field} value={to} onChange={(e) => setTo(e.target.value)} placeholder={chain === "sol" ? "Solana address" : "0x…"} autoComplete="off" spellCheck={false} />
      </label>
      <label className="grid gap-1.5 text-[13px] font-medium text-muted-foreground">
        Amount
        <input className={field} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0.0" />
      </label>
      {err && <p className="m-0 text-[13px] text-[#b2364e]">{err}</p>}
      <Cta type="submit" className="w-full" disabled={s.phone.sending || s.chip.hasPending}>
        Ask cartridge to sign
      </Cta>
    </form>
  );
}

function ReceiveSheet() {
  const s = useSession();
  const [chain, setChain] = useState<Chain>("sol");
  const [copied, setCopied] = useState(false);
  const addr = s.chip.addresses?.[chain] ?? "";
  const svg = useMemo(() => {
    if (!addr) return "";
    const q = qrcode(0, "M");
    q.addData(addr);
    q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }, [addr]);
  return (
    <div className="grid justify-items-center gap-4 pt-1">
      <SegmentedControl
        label="Chain"
        options={[
          { value: "sol", label: "Solana" },
          { value: "evm", label: "EVM" },
        ]}
        value={chain}
        onValueChange={(v) => setChain(v as Chain)}
        className="w-full"
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={chain} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.22, ease: EASE }} className="w-52 rounded-[22px] border border-border bg-white p-3 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      </AnimatePresence>
      <p className="m-0 max-w-full break-all text-center font-mono text-[12px] text-muted-foreground">{addr}</p>
      <Cta
        className="w-full"
        onClick={() => {
          navigator.clipboard
            ?.writeText(addr)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            })
            .catch(() => {});
        }}
      >
        <span className="flex items-center gap-2">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy address"}
        </span>
      </Cta>
      <p className="m-0 text-center text-[12px] text-muted-foreground">{chain === "evm" ? "The same address on every EVM network." : "Solana devnet."} The Game Boy can show it as a QR code too.</p>
    </div>
  );
}

function NetworkSheet({ onDone }: { onDone: () => void }) {
  const s = useSession();
  return (
    <ul className="m-0 grid list-none gap-1 p-0 pt-1">
      {EVM_NETWORKS.map((n) => {
        const on = s.phone.evmNet.id === n.id;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                blip(s.muted, 880);
                s.phone.setEvmNetwork(n.id);
                onDone();
              }}
              className={cn("flex w-full items-center gap-3 rounded-xl border-0 px-3 py-3 text-left transition-colors", on ? "bg-muted" : "bg-transparent hover:bg-muted/60")}
            >
              <img src={CHAIN_ICONS[evmChainKey(n.id)]} alt="" className="size-8 rounded-full" />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-foreground">{n.name === "Robinhood" ? "Robinhood Chain" : n.name}</span>
                <span className="block text-[12px] text-muted-foreground">{n.symbol} · testnet</span>
              </span>
              {on && <Check className="size-4 text-foreground" />}
            </button>
          </li>
        );
      })}
      <li className="px-3 pt-2 text-[12px] text-muted-foreground">One address on every network. Left and right on the Game Boy switch it too.</li>
    </ul>
  );
}

/* ---------- helpers ---------- */

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
