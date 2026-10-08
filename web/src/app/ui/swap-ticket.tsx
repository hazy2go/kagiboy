// Based on "Swap Ticket" by ssychui on 21st.dev (component id 27122). Kept: the amount cards, the
// flip button on the seam whose cards really trade places (layout animation), the rate footer and
// the CTA whose label animates between states. Changed for kagiboy: it is controlled by the host
// (live SODAX quotes, real token logos with chain badges, the cartridge's states) and the amounts
// sit in quiet neutral wells.

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpDown, ChevronDown, X } from "lucide-react";
import { cn } from "./utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface TicketToken {
  key: string;
  symbol: string;
  /** small line under the symbol (the chain) */
  sub: string;
  icon: ReactNode;
}

function AmountCard({
  side,
  value,
  onChange,
  token,
  onPick,
  note,
  busy,
}: {
  side: "pay" | "get";
  value: string;
  onChange?: (v: string) => void;
  token: TicketToken | null;
  onPick: () => void;
  note?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] border border-border bg-card p-4 shadow-[0_1px_2px_rgba(20,22,35,0.04),0_10px_24px_-18px_rgba(20,22,35,0.3)]">
      <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        <span>You {side}</span>
        {note}
      </div>
      <div className="flex items-center gap-3">
        <input
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^\d*\.?\d*$/.test(v)) onChange?.(v);
          }}
          readOnly={!onChange}
          placeholder="0"
          inputMode="decimal"
          aria-label={side === "pay" ? "Amount to pay" : "Amount you get"}
          className={cn(
            "w-full min-w-0 border-0 bg-transparent p-0 font-display text-[32px] font-medium leading-tight tracking-[-0.02em] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40",
            busy && "animate-pulse",
          )}
        />
        <button
          type="button"
          onClick={onPick}
          disabled={!token}
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-muted py-1.5 pl-1.5 pr-3 transition-[transform,background-color] hover:bg-muted/70 active:scale-95"
          aria-haspopup="listbox"
        >
          {token?.icon ?? <span className="size-8 animate-pulse rounded-full bg-muted" />}
          <span className="flex flex-col text-left leading-tight">
            <span className="text-[15px] font-bold text-foreground">{token?.symbol ?? "…"}</span>
            <span className="text-[11px] text-muted-foreground">{token?.sub ?? ""}</span>
          </span>
          <ChevronDown size={14} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export interface SwapTicketProps {
  pay: TicketToken | null;
  get: TicketToken | null;
  amount: string;
  onAmount: (v: string) => void;
  /** the quoted amount, already formatted ("" while there is none) */
  out: string;
  quoting: boolean;
  onFlip: () => void;
  onPick: (side: "pay" | "get") => void;
  /** which side's picker is open; the host renders the list inside it */
  picking: "pay" | "get" | null;
  onClosePicker: () => void;
  picker: ReactNode;
  footer?: ReactNode;
  cta: { label: string; enabled: boolean; onClick: () => void; glyph?: ReactNode };
  className?: string;
}

export function SwapTicket({ pay, get, amount, onAmount, out, quoting, onFlip, onPick, picking, onClosePicker, picker, footer, cta, className }: SwapTicketProps) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("relative flex w-full flex-col", className)}>
      <div className="relative flex flex-col gap-1.5">
        <motion.div key={(pay?.key ?? "pay") + "-pay"} layout layoutId={`swap-card-${pay?.key ?? "pay"}`} transition={{ type: "spring", stiffness: 400, damping: 32 }}>
          <AmountCard side="pay" value={amount} onChange={onAmount} token={pay} onPick={() => onPick("pay")} />
        </motion.div>
        <motion.button
          type="button"
          onClick={onFlip}
          whileTap={reduced ? undefined : { scale: 0.9, rotate: 180 }}
          className="absolute left-1/2 top-1/2 z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-4 border-background bg-card text-foreground shadow-[0_2px_8px_-2px_rgba(20,22,35,0.2)]"
          aria-label="Flip pair"
        >
          <ArrowUpDown size={16} />
        </motion.button>
        <motion.div key={(get?.key ?? "get") + "-get"} layout layoutId={`swap-card-${get?.key ?? "get"}`} transition={{ type: "spring", stiffness: 400, damping: 32 }}>
          <AmountCard side="get" value={out} token={get} onPick={() => onPick("get")} busy={quoting} />
        </motion.div>
      </div>

      {footer}

      <motion.button
        type="button"
        disabled={!cta.enabled}
        onClick={cta.onClick}
        whileHover={cta.enabled && !reduced ? { y: -1 } : undefined}
        whileTap={cta.enabled && !reduced ? { scale: 0.97, y: 0 } : undefined}
        transition={{ duration: 0.2, ease: EASE }}
        className="relative mt-4 flex h-[54px] items-center justify-center gap-2.5 rounded-2xl bg-foreground text-[16px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.3),0_8px_20px_-10px_rgba(20,22,35,0.55),inset_0_1px_1px_rgba(255,255,255,0.14)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        {cta.glyph}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={cta.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.14, ease: EASE }}
            className="block"
          >
            {cta.label}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* token picker covers the ticket, like the original overlay */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="absolute -inset-1 z-20 flex flex-col rounded-[24px] border border-border bg-card p-3 shadow-[0_24px_48px_-24px_rgba(20,22,35,0.4)]"
            role="dialog"
            aria-label={picking === "pay" ? "Choose what you pay with" : "Choose what you get"}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[15px] font-semibold text-foreground">{picking === "pay" ? "You pay with" : "You get"}</span>
              <button type="button" onClick={onClosePicker} className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{picker}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
