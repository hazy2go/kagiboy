import { useSession } from "./session";

/** Live view of the cartridge bus: every request the Game Boy makes and every reply. */
export function BusMonitor() {
  const s = useSession();
  const rows = s.chip.log.slice(-40).reverse();
  return (
    <section className="bus">
      <header>
        <h4>Cartridge bus</h4>
        <span>Mailbox at 0xD800 · what the Game Boy and key chip say to each other</span>
      </header>
      <ol>
        {rows.length === 0 && <li className="idle">Switch on the Game Boy to see traffic.</li>}
        {rows.map((r, i) => (
          <li key={`${r.t}-${i}`} className={r.dir === "gb>chip" ? "req" : "resp"}>
            <span className="dir">{r.dir === "gb>chip" ? "GB → CHIP" : "CHIP → GB"}</span>
            <span className="cmd">{r.cmd}</span>
            <code>{r.hex}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
