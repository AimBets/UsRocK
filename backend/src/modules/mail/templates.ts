import type { MailMessage } from "./mailer.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function passwordResetEmail(input: { to: string; name: string; resetUrl: string; expiresInMinutes: number }): MailMessage {
  const name = escapeHtml(input.name);
  const url = escapeHtml(input.resetUrl);
  return {
    to: input.to,
    subject: "Redefinição de senha — UsRock",
    text: [
      `Olá, ${input.name}.`,
      "",
      "Recebemos um pedido para redefinir a senha da sua conta UsRock.",
      `Para criar uma nova senha, acesse o link abaixo (válido por ${input.expiresInMinutes} minutos e de uso único):`,
      "",
      input.resetUrl,
      "",
      "Se você não fez este pedido, ignore este e-mail: sua senha atual continua válida.",
    ].join("\n"),
    html: `<p>Olá, ${name}.</p>
<p>Recebemos um pedido para redefinir a senha da sua conta UsRock.</p>
<p><a href="${url}">Criar nova senha</a></p>
<p>O link é válido por ${input.expiresInMinutes} minutos e pode ser usado uma única vez.</p>
<p>Se você não fez este pedido, ignore este e-mail: sua senha atual continua válida.</p>`,
  };
}

export function newsletterConfirmationEmail(input: {
  to: string;
  confirmUrl: string;
  unsubscribeUrl: string;
  expiresInHours: number;
}): MailMessage {
  const confirmUrl = escapeHtml(input.confirmUrl);
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl);
  return {
    to: input.to,
    subject: "Confirme sua inscrição na newsletter — UsRock",
    text: [
      "Olá!",
      "",
      "Recebemos um pedido para inscrever este e-mail na newsletter da UsRock (lançamentos, drops e campanhas).",
      `Para confirmar, acesse o link abaixo (válido por ${input.expiresInHours} horas):`,
      "",
      input.confirmUrl,
      "",
      "Se você não fez este pedido, ignore este e-mail: sem a confirmação, nada será enviado.",
      `Para cancelar a qualquer momento: ${input.unsubscribeUrl}`,
    ].join("\n"),
    html: `<p>Olá!</p>
<p>Recebemos um pedido para inscrever este e-mail na newsletter da UsRock (lançamentos, drops e campanhas).</p>
<p><a href="${confirmUrl}">Confirmar inscrição</a></p>
<p>O link é válido por ${input.expiresInHours} horas. Se você não fez este pedido, ignore este e-mail: sem a confirmação, nada será enviado.</p>
<p><a href="${unsubscribeUrl}">Cancelar inscrição</a></p>`,
  };
}
