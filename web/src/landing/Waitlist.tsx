import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import "./waitlist.css";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; position: number | null; already: boolean }
  | { kind: "error"; message: string };

// The celebration follows "Waitlist Form" by preetsuthar17 on 21st.dev (component id 2276): confetti
// in the site's pastels once the ticket is torn off.
const COLORS = ["#cfe2ff", "#ffdce8", "#e6e0ff", "#8fb2ff", "#f29ab9"];

async function celebrate() {
  const { default: confetti } = await import("canvas-confetti"); // only needed once, on success
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: COLORS, scalar: 0.9, ticks: 160 });
  setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { y: 0.65 }, colors: COLORS, scalar: 0.7, ticks: 140 }), 180);
}

// the printer's renders (assets/3d/printer.py): where the paper and the slot land, as shares of the image
const STEP = (n: number) => (t: number) => Math.floor(t * n) / n; // paper moves in print-head steps
type Phase = "form" | "in" | "print" | "torn";

/**
 * Email sign-up on the kagiboy printer. The form is a sheet sticking out of the slot; on success the
 * printer takes it back in, feeds out a numbered ticket in small steps and tears it off.
 */
export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [phase, setPhase] = useState<Phase>("form");
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
      setState({ kind: "done", position: typeof body.position === "number" ? body.position : null, already: !!body.already });
      setPhase(reduced ? "torn" : "in");
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't save that." });
    }
  };

  const done = state.kind === "done" ? state : null;
  const tear = () => {
    setPhase("torn");
    if (done && !done.already) void celebrate();
  };

  return (
    <div className={`printer is-${phase}`}>
      <div className="printer-paper">
        <div className="sheet-stub paper-blue" aria-hidden />
        <motion.form
          className="ticket ticket-blank sheet"
          onSubmit={submit}
          noValidate
          inert={phase !== "form"}
          animate={{ y: phase === "form" ? "0%" : "104%" }}
          transition={reduced ? { duration: 0 } : { duration: 0.9, ease: STEP(16) }}
          onAnimationComplete={() => phase === "in" && setPhase("print")}
        >
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
        </motion.form>
        {done && (
          <motion.div
            className="ticket sheet sheet-ticket"
            role="status"
            initial={{ y: reduced ? "0%" : "104%" }}
            animate={
              phase === "torn" ? { y: reduced ? 0 : -30, rotate: reduced ? 0 : -2.5 } : phase === "print" ? { y: "0%" } : { y: "104%" }
            }
            transition={
              phase === "print"
                ? { duration: 1.9, ease: STEP(30) }
                : phase === "torn"
                  ? { type: "spring", stiffness: 260, damping: 14 }
                  : { duration: 0 }
            }
            onAnimationComplete={() => phase === "print" && tear()}
          >
            <p className="px ticket-head">KAGIBOY WAITLIST</p>
            <p className="px ticket-no">No. {done.position == null ? "----" : String(done.position).padStart(4, "0")}</p>
            <p className="px">{done.already ? "ALREADY ON THE LIST" : "YOU'RE ON THE LIST"}</p>
            <p className="px ticket-mail">{maskEmail(email)}</p>
            <p className="px ticket-foot">ONE EMAIL WHEN IT SHIPS. NOTHING ELSE.</p>
          </motion.div>
        )}
      </div>
      <img
        className="printer-back"
        src="/printer/printer-back-1x.webp"
        srcSet="/printer/printer-back-1x.webp 1000w, /printer/printer-back.webp 2000w"
        sizes="(max-width: 520px) 150vw, 760px"
        width={1000}
        height={560}
        alt="The kagiboy thermal printer, with its paper slot and serrated tear bar"
        loading="lazy"
      />
      <img
        className="printer-front"
        src="/printer/printer-front-1x.webp"
        srcSet="/printer/printer-front-1x.webp 1000w, /printer/printer-front.webp 2000w"
        sizes="(max-width: 520px) 150vw, 760px"
        width={1000}
        height={560}
        alt=""
        aria-hidden
        loading="lazy"
      />
    </div>
  );
}

function maskEmail(e: string) {
  const [user, domain] = e.split("@");
  if (!domain) return e.toUpperCase();
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`.toUpperCase();
}
