import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/field";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";
import { Link } from "react-router-dom";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setMessage("Если такой аккаунт есть, письмо для сброса пароля уже отправлено.");
      } else {
        const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
        if (signError) throw signError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <p className="text-sm font-semibold tracking-[0.2em] text-sage uppercase">для двоих</p>
      <h1 className="font-display mt-2 text-4xl">Меню для нас</h1>
      <p className="mt-3 text-muted">Питание, корзина и бюджет — без лишней ручной работы.</p>
      <Card className="mt-8">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode === "login" && (
            <div>
              <Label>Пароль</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <FieldError>{error}</FieldError>
          {message && <p className="text-sm text-sage">{message}</p>}
          <Button className="w-full" disabled={pending}>
            {mode === "login" ? "Войти" : "Отправить ссылку"}
          </Button>
        </form>
        <button
          className="mt-4 text-sm font-semibold text-sage"
          onClick={() => setMode(mode === "login" ? "reset" : "login")}
        >
          {mode === "login" ? "Забыли пароль?" : "Вернуться ко входу"}
        </button>
      </Card>
      <p className="mt-6 text-sm text-muted">
        Регистрация закрыта. Аккаунты создаются в Supabase, затем можно{" "}
        <Link to="/reset" className="font-semibold text-sage">
          задать пароль
        </Link>
        .
      </p>
    </div>
  );
}
