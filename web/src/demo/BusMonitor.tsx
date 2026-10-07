import { useSession } from "./session";

/** Every request the Game Boy makes and every reply, printed as a running tape. */
export function BusMonitor() {
  const s = useSession();
  const rows = s.chip.log.slice(-28).reverse();
  return (
    <section className="bus" aria-label="Cartridge bus log">
      <header>
        <h2>The cartridge bus</h2>
        <p>What the Game Boy and the key chip say to each other, through the mailbox at 0xD800. PINs and words are never shown.</p>
      </header>
      <div className="tape paper-white">
        <ol>
          {rows.length === 0 && (
            <li className="px idle">{s.powered ? "PRESS START ON THE GAME BOY" : "SWITCH ON THE GAME BOY TO SEE TRAFFIC"}</li>
          )}
          {rows.map((r, i) => (
            <li key={`${r.t}-${i}`} className={`px ${r.dir === "gb>chip" ? "req" : "resp"}`}>
              <span className="dir">{r.dir === "gb>chip" ? "GB > CHIP" : "CHIP > GB"}</span>
              <span className="cmd">{r.cmd}</span>
              <code>{r.hex}</code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
