// Based on "Comparison Table" by Mohammad Shehadeh (Hirael comparison-02, MIT) on 21st.dev
// (component id 26827): a featured column lifted onto a card, check and dash marks with screen-reader
// text, string cells for nuance. Adapted: kagiboy against the wallets people already know, no
// shadcn Badge/Button dependency.

import { Check, Minus } from "lucide-react";

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

export function Comparison({ columns, rows, caption }: ComparisonProps) {
  return (
    <div className="overflow-x-auto rounded-[24px] [scrollbar-width:thin]">
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
