import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { History, LayoutGrid, Package, ShoppingBag, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

const nav = [
  { to: "/", label: "Неделя", icon: LayoutGrid, end: true },
  { to: "/products", label: "Продукты", icon: Package },
  { to: "/cart", label: "Корзина", icon: ShoppingBag },
  { to: "/history", label: "История", icon: History },
  { to: "/profile", label: "Профиль", icon: UserRound },
];

export function Shell() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
        <h1 className="font-display text-4xl">Меню для нас</h1>
        <p className="mt-4 text-muted">
          Приложение собрано, но ещё не подключено к Supabase. Откройте README и добавьте ключи в
          GitHub Secrets / файл .env.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-1 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold",
                  isActive ? "text-sage" : "text-muted",
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Screen({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="px-5 pt-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
        {action}
      </div>
      {children}
    </main>
  );
}

export function EmptyHint({
  text,
  cta,
  onClick,
}: {
  text: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-white/70 p-6 text-center">
      <p className="text-muted">{text}</p>
      <Button className="mt-4 w-full" onClick={onClick}>
        {cta}
      </Button>
    </div>
  );
}
