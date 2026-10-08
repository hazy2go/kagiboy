// Based on "Comparison Table" by Mohammad Shehadeh (Hirael comparison-02, MIT) on 21st.dev
// (component id 26827): a featured column lifted onto a card, check and dash marks with screen-reader
// text, string cells for nuance. Adapted: kagiboy against the wallets people already know, no
// shadcn Badge/Button dependency. On phones the table becomes kagiboy against one wallet at a time,
// picked with the app's 21st.dev Segmented Control, so it fits without scrolling sideways.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Minus } from "lucide-react";
import { SegmentedControl } from "../../app/ui/segmented-control";

type Cell = boolean | string;

export interface ComparisonProps {
  columns: { name: string; summary: string; featured?: boolean }[];
  rows: { label: string; cells: Cell[] }[];
  caption: string;
}

function CellValue({ value }: { value: Cell }) {
  if (typeof value === "string") return <span className="text-[14px] text-muted-foreground">{value}</span>;
  return value ? (
    <>
      <Check aria-hidden className="size-[18px] text-[#1f7a48]" strokeWidth={2.4} />
      <span className="sr-only">Yes</span>
    </>
  ) : (
    <>
      <Minus aria-hidden className="size-[18px] text-muted-foreground/45" />
      <span className="sr-only">No</span>
    </>
  );
}

export function Comparison(props: ComparisonProps) {
  return (
    <>
      <div className="max-[640px]:hidden">
        <ComparisonTable {...props} />
      </div>
      <div className="min-[641px]:hidden">
        <ComparisonVs {...props} />
      </div>
    </>
  );
}

/** Phones: the featured column stays, the other side is picked with a switch. */
function ComparisonVs({ columns, rows, caption }: ComparisonProps) {
  const reduced = useReducedMotion();
  const mine = Math.max(0, columns.findIndex((c) => c.featured));
  const others = columns.map((c, i) => ({ c, i })).filter(({ i }) => i !== mine);
  const [pick, setPick] = useState(others[0]?.i ?? 0);
  const other = columns[pick];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-px text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Compared with a</span>
        <SegmentedControl
          className="w-full"
          label="Compare kagiboy with"
          options={others.map(({ c, i }) => ({ value: String(i), label: c.name.replace(/ wallet$/i, "") }))}
          value={String(pick)}
          onValueChange={(v) => setPick(Number(v))}
        />
      </div>
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{`${caption}: ${columns[mine].name} and ${other.name}`}</caption>
        <colgroup>
          <col />
          <col className="w-[26%]" />
          <col className="w-[26%]" />
        </colgroup>
        <thead>
          <tr>
            <td />
            <th scope="col" className="rounded-t-[18px] border border-b-0 border-border bg-card px-2 pb-2 pt-3 text-center align-bottom shadow-[0_-10px_30px_-24px_rgba(60,70,120,0.5)]">
              <span className="font-display text-[15px] font-semibold text-foreground">{columns[mine].name}</span>
            </th>
            <th scope="col" className="px-2 pb-2 pt-3 text-center align-bottom">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={pick}
                  className="block text-[13px] font-semibold leading-tight text-foreground"
                  initial={reduced ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reduced ? undefined : { opacity: 0, y: -6, filter: "blur(4px)" }}
                  transition={{ duration: 0.18 }}
                >
                  {other.name}
                </motion.span>
              </AnimatePresence>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.label} className="border-t border-border">
              <th scope="row" className="py-3.5 pr-3 text-[14px] font-normal leading-snug text-foreground">
                {r.label}
              </th>
              <td className={`border-x border-border bg-card px-2 py-3.5 text-center ${ri === rows.length - 1 ? "rounded-b-[18px] border-b" : ""}`}>
                <span className="flex justify-center text-center [&>span]:text-[13px]">
                  <CellValue value={r.cells[mine]} />
                </span>
              </td>
              <td className="px-2 py-3.5 text-center">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={pick}
                    className="flex justify-center text-center [&>span]:text-[13px]"
                    initial={reduced ? false : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduced ? undefined : { opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.16, delay: reduced ? 0 : ri * 0.025 }}
                  >
                    <CellValue value={r.cells[pick]} />
                  </motion.span>
                </AnimatePresence>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 text-[13px] text-muted-foreground">{other.summary}</p>
    </div>
  );
}

function ComparisonTable({ columns, rows, caption }: ComparisonProps) {
  return (
    <div className="relative overflow-x-auto rounded-[24px] [scrollbar-width:thin]">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[30%] p-4 align-bottom">
              <span className="font-px text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Wallet</span>
            </th>
            {columns.map((c) => (
              <th
                key={c.name}
                scope="col"
                className={`p-4 align-bottom ${c.featured ? "rounded-t-[22px] border border-b-0 border-border bg-card shadow-[0_-10px_30px_-24px_rgba(60,70,120,0.5)]" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`text-[16px] ${c.featured ? "font-display font-semibold" : "font-semibold"} text-foreground`}>{c.name}</span>
                  {c.featured && <span className="rounded-full bg-gradient-to-r from-[#dbe8ff] to-[#ffe0ea] px-2 py-0.5 font-px text-[9px] uppercase tracking-[0.12em] text-foreground">This one</span>}
                </span>
                <span className="mt-1 block text-[13px] font-normal text-muted-foreground">{c.summary}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.label} className="border-t border-border">
              <th scope="row" className="p-4 text-[15px] font-normal text-foreground">
                {r.label}
              </th>
              {r.cells.map((cell, i) => (
                <td
                  key={columns[i].name}
                  className={`p-4 align-middle ${columns[i].featured ? `border-x border-border bg-card ${ri === rows.length - 1 ? "rounded-b-[22px] border-b" : ""}` : ""}`}
                >
                  <span className="flex items-center">
                    <CellValue value={cell} />
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
