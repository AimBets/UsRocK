"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MailX } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { confirmNewsletter, unsubscribeNewsletter } from "@/lib/api/commerce";

export function NewsletterAction({ token, action }: { token: string; action: "confirm" | "unsubscribe" }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const confirming = action === "confirm";

  async function submit() {
    if (!validToken) { setStatus("error"); setMessage("Este link é inválido ou está incompleto."); return; }
    setStatus("loading");
    try {
      if (confirming) await confirmNewsletter({ token });
      else await unsubscribeNewsletter({ token });
      setStatus("success");
      setMessage(confirming ? "Inscrição confirmada. Agora você pode receber os próximos drops da UsRock." : "Descadastro concluído. Você não receberá novos e-mails de marketing.");
    } catch (error) {
      const invalid = error instanceof ApiError && error.details?.[0]?.code === "invalid_token";
      setStatus("error");
      setMessage(invalid ? "Este link é inválido, já foi usado ou expirou." : error instanceof ApiError ? error.message : "Não foi possível concluir a solicitação.");
    }
  }

  return (
    <div className="auth-confirmation">
      {status === "success" ? <CheckCircle2 size={48} /> : <MailX size={48} />}
      <h2>{confirming ? "Confirme sua inscrição" : "Cancelar newsletter"}</h2>
      <p>{message || (confirming ? "Confirme que deseja receber comunicações de marketing da UsRock." : "Confirme o descadastro dos e-mails de marketing da UsRock.")}</p>
      {status !== "success" && <button className="button-primary mt-6" disabled={status === "loading" || !validToken} onClick={() => void submit()} type="button">{status === "loading" ? "Processando…" : confirming ? "Confirmar inscrição" : "Confirmar descadastro"}</button>}
      <Link className="text-link mt-6" href="/">Voltar à loja</Link>
    </div>
  );
}
