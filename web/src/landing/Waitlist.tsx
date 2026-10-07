import { useState, type FormEvent } from "react";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; position: number; already: boolean }
  | { kind: "error"; message: string };

/** Email sign-up that prints a numbered ticket on success. */
export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that. Try again in a minute.");
      setState({ kind: "done", position: body.position, already: !!body.already });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't save that." });
    }
  };

  if (state.kind === "done") {
    const n = String(state.position).padStart(4, "0");
    return (
      <div className="ticket print-in is-in" role="status">
        <div className="ticket-perf" aria-hidden />
        <p className="px ticket-head">KAGIBOY WAITLIST</p>
        <p className="px ticket-no">No. {n}</p>
        <p className="px">{state.already ? "ALREADY ON THE LIST" : "YOU'RE ON THE LIST"}</p>
        <p className="px ticket-mail">{maskEmail(email)}</p>
        <p className="px ticket-foot">ONE EMAIL WHEN IT SHIPS. NOTHING ELSE.</p>
        <div className="ticket-perf bottom" aria-hidden />
      </div>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={submit} noValidate>
      <label className="sr" htmlFor="wl-email">
        Email address
      </label>
      <input
        id="wl-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-invalid={state.kind === "error"}
        aria-describedby="wl-msg"
      />
      <button className="btn btn-ink" disabled={state.kind === "sending" || !email}>
        {state.kind === "sending" ? "Printing…" : "Print my ticket"}
      </button>
      <p id="wl-msg" className={`waitlist-msg ${state.kind === "error" ? "is-error" : ""}`} aria-live="polite">
        {state.kind === "error" ? state.message : "One email when kagiboy ships. Nothing else."}
      </p>
    </form>
  );
}

function maskEmail(e: string) {
  const [user, domain] = e.split("@");
  if (!domain) return e.toUpperCase();
  return `${user.slice(0, 2)}${"·".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`.toUpperCase();
}
