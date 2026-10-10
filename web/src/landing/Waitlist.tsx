import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; position: number | null; already: boolean }
  | { kind: "error"; message: string };

// The form-to-ticket swap and the celebration follow "Waitlist Form" by preetsuthar17 on 21st.dev
// (component id 2276): the form blurs out, the printed ticket blurs in, and confetti falls, here
// in the site's pastels.
const BLUR_IN = { opacity: 1, filter: "blur(0px)", transition: { duration: 0.5 } };
const BLUR_OUT = { opacity: 0, filter: "blur(10px)", transition: { duration: 0.35 } };
const COLORS = ["#cfe2ff", "#ffdce8", "#e6e0ff", "#8fb2ff", "#f29ab9"];

async function celebrate() {
  const { default: confetti } = await import("canvas-confetti"); // only needed once, on success
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: COLORS, scalar: 0.9, ticks: 160 });
  setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.65 }, colors: COLORS, scalar: 0.7, ticks: 140 }), 180);
}

/** Email sign-up that prints a numbered ticket on success. */
export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const reduced = useReducedMotion();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setState({ kind: "error", message: email.trim() ? "That email doesn't look right." : "Enter your email first." });
      return;
    }
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that. Try again in a minute.");
      // the server never gives a number back for an email already on the list (so nobody can look up when
      // someone joined); this browser remembers the number it was given the first time instead
      const key = `kagiboy.waitlist.${email.trim().toLowerCase()}`;
      let position: number | null = typeof body.position === "number" ? body.position : null;
      try {
        if (position != null) localStorage.setItem(key, String(position));
        else position = Number(localStorage.getItem(key)) || null;
      } catch {
        /* storage blocked: no remembered number */
      }
      setState({ kind: "done", position, already: !!body.already });
      if (!body.already && !reduced) void celebrate();
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't save that." });
    }
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.kind === "done" ? (
        <motion.div key="ticket" className="ticket" role="status" initial={{ opacity: 0, filter: "blur(10px)", y: -14 }} animate={{ ...BLUR_IN, y: 0 }} exit={BLUR_OUT}>
          <div className="ticket-perf" aria-hidden />
          <p className="px ticket-head">KAGIBOY WAITLIST</p>
          <p className="px ticket-no">{state.position == null ? "YOU'RE IN" : `No. ${String(state.position).padStart(4, "0")}`}</p>
          <p className="px">{state.already ? "ALREADY ON THE LIST" : "YOU'RE ON THE LIST"}</p>
          <p className="px ticket-mail">{maskEmail(email)}</p>
          <p className="px ticket-foot">ONE EMAIL WHEN IT SHIPS. NOTHING ELSE.</p>
          <div className="ticket-perf bottom" aria-hidden />
        </motion.div>
      ) : (
        <motion.form key="form" className="ticket ticket-blank" onSubmit={submit} noValidate initial={{ opacity: 0, filter: "blur(10px)" }} animate={BLUR_IN} exit={BLUR_OUT}>
          <div className="ticket-perf" aria-hidden />
          <p className="px ticket-head">KAGIBOY WAITLIST</p>
          <p className="px ticket-no">No. ----</p>
          <label className="px ticket-label" htmlFor="wl-email">
            EMAIL
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
          <button className="btn btn-ink" disabled={state.kind === "sending"}>
            {state.kind === "sending" ? "Printing…" : "Print my ticket"}
          </button>
          <p id="wl-msg" className={`waitlist-msg ${state.kind === "error" ? "is-error" : ""}`} aria-live="polite">
            {state.kind === "error" ? state.message : "One email when kagiboy ships. Nothing else."}
          </p>
          <div className="ticket-perf bottom" aria-hidden />
        </motion.form>
      )}
    </AnimatePresence>
  );
}

function maskEmail(e: string) {
  const [user, domain] = e.split("@");
  if (!domain) return e.toUpperCase();
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`.toUpperCase();
}
