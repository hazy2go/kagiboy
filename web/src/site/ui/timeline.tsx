// Based on "Vertical How It Works Timeline" by ln-dev7 on 21st.dev (component id 26902): numbered
// nodes on a dashed rail with a card per step. Adapted for the kagiboy roadmap: the rail fills up
// to "now" as you scroll, the current step is marked live, and the cards fade in one by one.

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import type { LucideIcon } from "lucide-react";

export interface TimelineStep {
  when: string;
  title: string;
  body: string;
  icon: LucideIcon;
  now?: boolean;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const fill = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  return (
    <ol ref={ref} className="relative m-0 flex list-none flex-col gap-5 p-0 pl-14 sm:pl-16">
      {/* the rail, and its filled part following your scroll */}
      <span aria-hidden className="absolute bottom-3 left-[18px] top-3 w-px border-l border-dashed border-border sm:left-[22px]" />
      <motion.span aria-hidden className="absolute left-[17.5px] top-3 w-[2px] rounded-full bg-gradient-to-b from-[#8fb2ff] to-[#f29ab9] sm:left-[21.5px]" style={{ height: reduced ? "100%" : fill }} />
      {steps.map((s, i) => (
        <motion.li
          key={s.when}
          className="relative"
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className={`absolute -left-14 top-3 grid size-9 place-items-center rounded-full border font-px text-[11px] shadow-[0_6px_14px_-8px_rgba(60,70,120,0.5)] sm:-left-16 sm:size-11 ${
              s.now ? "border-transparent bg-[#1f2330] text-white" : "border-border bg-card text-foreground"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
            {s.now && <span className="absolute -inset-1 animate-ping rounded-full border border-[#8fb2ff]/60" aria-hidden />}
          </span>
          <div className="flex items-start gap-4 rounded-[22px] border border-border bg-card p-5 shadow-[0_1px_2px_rgba(40,44,70,0.05),0_16px_32px_-24px_rgba(40,44,70,0.45)]">
            <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${s.now ? "bg-[#e9f0ff] text-[#3b4fb8]" : "bg-muted text-foreground"}`}>
              <s.icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-px text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {s.when}
                {s.now && <span className="ml-2 rounded-full bg-[#dff3e6] px-2 py-0.5 text-[10px] text-[#1f7a48]">LIVE</span>}
              </span>
              <h3 className="m-0 font-display text-[19px] font-semibold tracking-tight text-foreground">{s.title}</h3>
              <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
