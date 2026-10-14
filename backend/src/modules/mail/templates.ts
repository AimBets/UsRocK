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
