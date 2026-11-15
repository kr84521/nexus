import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-lg shadow-accent/25",
  ghost: "text-fg/80 hover:bg-fg/8 hover:text-fg",
  outline: "border border-line text-fg hover:bg-fg/6",
  danger: "text-red-400 hover:bg-red-500/12",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={`focus-ring inline-flex items-center justify-center rounded-card font-medium whitespace-nowrap transition
        disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}

export function IconButton({
  className = "",
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={`focus-ring inline-flex size-9 items-center justify-center rounded-card transition
        ${active ? "bg-accent/18 text-accent" : "text-muted hover:bg-fg/8 hover:text-fg"} ${className}`}
    />
  );
}
