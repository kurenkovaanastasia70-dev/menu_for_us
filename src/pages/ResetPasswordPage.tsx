import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/field";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5">
      <h1 className="font-display text-3xl">Новый пароль</h1>
      <Card className="mt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Пароль</Label>
            <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <FieldError>{error}</FieldError>
          <Button className="w-full" disabled={pending}>
            Сохранить
          </Button>
        </form>
      </Card>
    </div>
  );
}
