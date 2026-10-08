// Based on "Transaction List" by hari on 21st.dev (component id 2943). Kept: the list whose row
// morphs into a detail view (shared layoutIds for icon, title, subtitle, amount) and back. Changed
// for kagiboy: it fills its column, takes the wallet's own records, and the detail is a short
// receipt of what the cartridge signed.

import { useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "./utils";

export interface ActivityItem {
  id: string;
  icon: ReactNode;
  title: string;
  sub: string;
  state: string;
  tone: "ok" | "wait" | "bad" | "plain";
  details: [string, string][];
  link?: { href: string; label: string };
}

const TONE: Record<ActivityItem["tone"], string> = {
  ok: "text-[#1f7a48]",
  wait: "text-[#3b4fb8]",
  bad: "text-[#b2364e]",
  plain: "text-muted-foreground",
};

export function TransactionList({ items, empty }: { items: ActivityItem[]; empty: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((i) => i.id === openId) ?? null;

  if (items.length === 0) return <>{empty}</>;

  return (
    <LayoutGroup>
      <motion.div layout className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_1px_1px_rgba(40,44,70,0.06),0_14px_30px_-18px_rgba(40,44,70,0.4),inset_0_1px_0_#fff]" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        <AnimatePresence mode="wait" initial={false}>
          {!open ? (
            <motion.ul key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="m-0 list-none divide-y divide-border p-1.5">
              {items.map((t) => (
                <li key={t.id}>
                  <motion.button
                    type="button"
                    layoutId={`act-${t.id}`}
                    onClick={() => setOpenId(t.id)}
                    className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <motion.span layoutId={`act-icon-${t.id}`} className="lcd-chip grid size-10 shrink-0 place-items-center rounded-xl">
                      {t.icon}
                    </motion.span>
                    <span className="min-w-0 flex-1">
                      <motion.span layoutId={`act-title-${t.id}`} className="block truncate text-[14px] font-semibold text-foreground">
                        {t.title}
                      </motion.span>
                      <motion.span layoutId={`act-sub-${t.id}`} className="block truncate text-[12px] text-muted-foreground">
                        {t.sub}
                      </motion.span>
                    </span>
                    <motion.span layoutId={`act-state-${t.id}`} className={cn("shrink-0 text-[12px] font-semibold", TONE[t.tone])}>
                      {t.state}
                    </motion.span>
                  </motion.button>
                </li>
              ))}
            </motion.ul>
          ) : (
            <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="p-4">
              <motion.div layoutId={`act-${open.id}`} className="mb-4 flex items-start justify-between">
                <motion.span layoutId={`act-icon-${open.id}`} className="lcd-chip grid size-12 place-items-center rounded-2xl">
                  {open.icon}
                </motion.span>
                <button type="button" onClick={() => setOpenId(null)} className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Back to the list">
                  <X size={15} />
                </button>
              </motion.div>
              <div className="flex items-end justify-between gap-3 border-b border-dashed border-border pb-4">
                <div className="min-w-0">
                  <motion.p layoutId={`act-title-${open.id}`} className="text-[16px] font-semibold text-foreground">
                    {open.title}
                  </motion.p>
                  <motion.p layoutId={`act-sub-${open.id}`} className="text-[13px] text-muted-foreground">
                    {open.sub}
                  </motion.p>
                </div>
                <motion.p layoutId={`act-state-${open.id}`} className={cn("shrink-0 text-[13px] font-semibold", TONE[open.tone])}>
                  {open.state}
                </motion.p>
              </div>
              <motion.dl initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="m-0 mt-4 grid gap-2.5 font-px text-[11px] uppercase tracking-[0.08em]">
                {open.details.map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <i className="flex-1 -translate-y-[3px] border-b border-dotted border-muted-foreground/50" />
                    <dd className="m-0 max-w-[60%] truncate text-right text-foreground">{v}</dd>
                  </div>
                ))}
              </motion.dl>
              {open.link && (
                <a href={open.link.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#3b4fb8]">
                  {open.link.label} <ArrowUpRight size={14} />
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}
