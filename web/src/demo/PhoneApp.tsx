import { useState, type FormEvent } from "react";
import brand from "../../../brand.json";
import type { Chain } from "../chip/protocol";
import { explorer, type Activity } from "../phone/phone";
import { useSession } from "./session";

const SEPOLIA_FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const SOLANA_FAUCET = "https://faucet.solana.com";

export function PhoneApp() {
  const s = useSession();
  const addr = s.chip.addresses;
  const state = !s.powered ? "off" : s.chip.state;

  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        <header className="app-head">
          <strong>{brand.name}</strong>
          <span className={`link-pill ${s.powered ? "up" : ""}`}>
            <i /> {s.powered ? "Cartridge linked" : "No cartridge"}
          </span>
        </header>

        {state === "off" && <Empty title="Switch on your Game Boy" body="The app pairs with the cartridge over Bluetooth once it's powered." />}
        {state === "none" && <Empty title="Set up on the Game Boy" body="Mash buttons, shake it, write down your 12 words, choose a PIN. Keys are made inside the cartridge and never come to this phone." />}
        {state === "locked" && <Empty title="Locked" body="Enter your PIN on the Game Boy to unlock." />}

        {state === "unlocked" && addr && (
          <>
            <Balances sol={s.phone.balances.sol} evm={s.phone.balances.evm} addr={addr} />
            <SendForm pending={s.chip.hasPending} />
            <ActivityList items={s.phone.activity} />
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Balances({ sol, evm, addr }: { sol: number | null; evm: number | null; addr: Record<Chain, string> }) {
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
          <span>Solana · devnet</span>
          <a href={explorer.solAddr(addr.sol)} target="_blank" rel="noreferrer">
            Explorer ↗
          </a>
        </div>
        <div className="amount">{sol == null ? "…" : sol.toFixed(4)} <small>SOL</small></div>
        <Copy text={addr.sol} />
        <div className="card-actions">
          <button onClick={doAirdrop} disabled={airdrop === "busy"}>
            {airdrop === "busy" ? "Requesting…" : "Airdrop 1 SOL"}
          </button>
          {airdrop === "failed" && (
            <a href={SOLANA_FAUCET} target="_blank" rel="noreferrer" className="hint">
              Faucet is rate limited. Use faucet.solana.com ↗
            </a>
          )}
        </div>
      </article>
      <article className="card evm">
        <div className="card-top">
          <span>Ethereum · Sepolia</span>
          <a href={explorer.evmAddr(addr.evm)} target="_blank" rel="noreferrer">
            Explorer ↗
          </a>
        </div>
        <div className="amount">{evm == null ? "…" : evm.toFixed(4)} <small>ETH</small></div>
        <Copy text={addr.evm} />
        <div className="card-actions">
          <a href={SEPOLIA_FAUCET} target="_blank" rel="noreferrer" className="hint">
            Get Sepolia ETH ↗
          </a>
        </div>
      </article>
    </section>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
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
      <code>{text.slice(0, 6)}…{text.slice(-6)}</code>
      <span>{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

function SendForm({ pending }: { pending: boolean }) {
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
          <button className="primary" disabled={!to || !amount}>
            Ask cartridge to sign
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
};

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
              <span className="state">{STATE_LABEL[a.state]}</span>
              {a.hash && (
                <a href={explorer[a.chain](a.hash)} target="_blank" rel="noreferrer">
                  View ↗
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
