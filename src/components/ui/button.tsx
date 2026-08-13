import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

const styles = {
  primary:
    "bg-sage text-white hover:bg-sage-dark shadow-[0_10px_24px_rgba(61,107,79,0.22)]",
  secondary: "bg-white text-ink border border-line hover:bg-cream",
  ghost: "text-sage hover:bg-white/70",
  clay: "bg-clay text-white hover:brightness-95",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof styles }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
