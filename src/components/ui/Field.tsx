import type { InputHTMLAttributes, ReactNode } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`focus-ring h-10 w-full rounded-card border border-line bg-surface-2/70 px-3 text-sm text-fg
        placeholder:text-muted/70 ${className}`}
    />
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-6 w-11 rounded-full transition ${checked ? "bg-accent" : "bg-fg/15"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40"
      />
      <span className="w-12 text-right text-xs tabular-nums text-muted">
        {value}
        {unit}
      </span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[calc(var(--radius)+4px)] border border-line bg-surface/60 px-5 py-2">
      <h3 className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
      <div className="divide-y divide-line/70">{children}</div>
    </section>
  );
}
