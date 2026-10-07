import { useMemo, useState, type FormEvent } from "react";
import qrcode from "qrcode-generator";
import type { Chain } from "../chip/protocol";
import { formatUnits } from "viem";
import { explorer, type Activity } from "../phone/phone";
import { useSession } from "./session";

const SEPOLIA_FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const SOLANA_FAUCET = "https://faucet.solana.com";

/** The companion app. `bare` drops the drawn phone so it can be the real screen on a phone. */
export function PhoneApp({ bare = false }: { bare?: boolean }) {
  const s = useSession();
  const addr = s.chip.addresses;
  const state = !s.powered ? "off" : s.chip.state;

  return (
    <div className={`phone ${bare ? "bare" : ""}`}>
      {!bare && <div className="phone-notch" />}
      <div className="phone-screen">
        <header className="app-head">
          <strong>kagiboy</strong>
          <span className={`link-pill ${s.powered ? "up" : ""}`}>
            <i /> {s.powered ? "Cartridge linked" : "No cartridge"}
          </span>
        </header>
        <div className="app-body">

        {state === "off" && <Empty title="Switch on your Game Boy" body="The app pairs with the cartridge over Bluetooth once it's powered." />}
        {state === "none" && <Empty title="Set up on the Game Boy" body="Mash buttons, shake it, write down your 12 words, choose a PIN. Keys are made inside the cartridge and never come to this phone." note="Testnet demo: never restore a real recovery phrase here." />}
        {state === "locked" && <Empty title="Locked" body="Enter your PIN on the Game Boy to unlock." />}

        {state === "unlocked" && addr && (
          <>
            <Balances sol={s.phone.balances.sol} evm={s.phone.balances.evm} addr={addr} />
            <SendForm pending={s.chip.hasPending} latest={s.phone.activity[0]} />
            <ActivityList items={s.phone.activity} />
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function Empty({ title, body, note }: { title: string; body: string; note?: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {note && <p className="empty-note">{note}</p>}
    </div>
  );
}

function Balances({ sol, evm, addr }: { sol: bigint | null; evm: bigint | null; addr: Record<Chain, string> }) {
  const s = useSession();
  const [airdrop, setAirdrop] = useState<"idle" | "busy" | "failed">("idle");
  const doAirdrop = async () => {
    setAirdrop("busy");
    try {
      await s.phone.airdrop();
      setAirdrop("idle");
    } catch {
      setAirdrop("failed");
    }
  };
  return (
    <section className="cards">
      <article className="card sol">
        <div className="card-top">
          <span>Solana</span>
          <a href={explorer.solAddr(addr.sol)} target="_blank" rel="noreferrer">
            Explorer <Out />
          </a>
        </div>
        <div className="amount">{show(sol, 9)} <small>SOL</small></div>
        <Copy text={addr.sol} />
        <div className="card-actions">
          <button onClick={doAirdrop} disabled={airdrop === "busy"}>
            {airdrop === "busy" ? "Requesting…" : "Airdrop 1 SOL"}
          </button>
          {airdrop === "failed" && (
            <a href={SOLANA_FAUCET} target="_blank" rel="noreferrer" className="hint">
              Faucet is rate limited. Use faucet.solana.com <Out />
            </a>
          )}
        </div>
      </article>
      <article className="card evm">
        <div className="card-top">
          <span>Ethereum</span>
          <a href={explorer.evmAddr(addr.evm)} target="_blank" rel="noreferrer">
            Explorer <Out />
          </a>
        </div>
        <div className="amount">{show(evm, 18)} <small>ETH</small></div>
        <Copy text={addr.evm} />
        <div className="card-actions">
          <a href={SEPOLIA_FAUCET} target="_blank" rel="noreferrer" className="hint">
            Get Sepolia ETH <Out />
          </a>
        </div>
      </article>
    </section>
  );
}

/** Balance with 4 decimals, rounded down. */
function show(units: bigint | null, decimals: number) {
  if (units == null) return "…";
  const [whole, frac = ""] = formatUnits(units, decimals).split(".");
  return `${whole}.${frac.padEnd(4, "0").slice(0, 4)}`;
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);

  return (
    <>
      <div className="addr-row">
        <button
          className="addr"
          title="Copy address"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1200);
            });
          }}
        >
          <code>
            {text.slice(0, 6)}…{text.slice(-6)}
          </code>
          <span>{done ? "Copied" : "Copy"}</span>
        </button>
        <button className="qr-toggle" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
          QR
        </button>
      </div>
      {showQr && (
        // generated locally from the address, so injecting the SVG is safe
        <div className="qr" role="img" aria-label={`QR code for ${text}`} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </>
  );
}

function SendForm({ pending, latest }: { pending: boolean; latest?: Activity }) {
  const s = useSession();
  const [chain, setChain] = useState<Chain>("sol");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    s.phone.send(chain, to.trim(), amount).catch((err: Error) => setError(err.message));
  };

  return (
    <section className="send">
      <h4>Send</h4>
      {latest && !pending && (
        <p className={`last-tx ${latest.state}`}>
          Last: {latest.amount} · {label(latest)}
          {latest.hash && (
            <>
              {" · "}
              <a href={explorer[latest.chain](latest.hash)} target="_blank" rel="noreferrer">
                View <Out />
              </a>
            </>
          )}
        </p>
      )}
      {pending ? (
        <div className="confirm-callout">
          <strong>Check your Game Boy</strong>
          <p>Hold A to sign, or press B to reject. The amount and address on its screen come from the cartridge, not from this phone.</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="seg" role="tablist">
            {(["sol", "evm"] as const).map((c) => (
              <button type="button" key={c} className={chain === c ? "on" : ""} onClick={() => setChain(c)}>
                {c === "sol" ? "SOL" : "ETH"}
              </button>
            ))}
          </div>
          <label>
            To
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={chain === "sol" ? "Solana address" : "0x…"} spellCheck={false} />
          </label>
          <label>
            Amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>
          <button className="btn btn-ink" disabled={!to || !amount || s.phone.sending}>
            {s.phone.sending ? "Preparing…" : "Ask cartridge to sign"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </section>
  );
}

const STATE_LABEL: Record<Activity["state"], string> = {
  waiting: "Waiting for Game Boy",
  rejected: "Rejected on Game Boy",
  broadcast: "Sent, confirming",
  confirmed: "Confirmed",
  failed: "Failed",
  unknown: "Sent, status unknown",
};

// "rejected" with a reason means the request was dropped (switched off, locked), not refused
function label(a: Activity) {
  return a.state === "rejected" && a.error ? "Cancelled" : STATE_LABEL[a.state];
}

function ActivityList({ items }: { items: Activity[] }) {
  if (!items.length) return null;
  return (
    <section className="activity">
      <h4>Activity</h4>
      <ul>
        {items.map((a) => (
          <li key={a.id} className={a.state}>
            <div>
              <strong>{a.amount}</strong>
              <span>to {a.to.slice(0, 6)}…{a.to.slice(-4)}</span>
            </div>
            <div className="right">
              <span className="state">{label(a)}</span>
              {a.hash && (
                <a href={explorer[a.chain](a.hash)} target="_blank" rel="noreferrer">
                  View <Out />
                </a>
              )}
              {a.error && <span className="error">{a.error}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Small drawn "opens elsewhere" arrow. */
function Out() {
  return (
    <svg className="out" viewBox="0 0 12 12" width="10" height="10" aria-hidden>
      <path d="M4 2.5h5.5V8M9.2 2.8 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
