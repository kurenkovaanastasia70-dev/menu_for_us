import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-3xl border border-line bg-paper p-4 shadow-[0_12px_40px_rgba(36,49,42,0.06)]", className)}
      {...props}
    />
  );
}
