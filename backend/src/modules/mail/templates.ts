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

// --- Pedidos (E5) ------------------------------------------------------------------------------

export interface OrderEmailData {
  to: string;
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  items: { name: string; size: string; quantity: number; lineTotal: string }[];
  subtotal: string;
  discount: string | null;
  shipping: string;
  shippingService: string;
  total: string;
  destination: string;
  isDemo: boolean;
}

function orderSummary(data: OrderEmailData) {
  const lines = data.items.map((item) => `- ${item.quantity}× ${item.name} (${item.size}) — ${item.lineTotal}`);
  const text = [
    ...lines,
    "",
    `Subtotal: ${data.subtotal}`,
    ...(data.discount ? [`Desconto: −${data.discount}`] : []),
    `Frete (${data.shippingService}): ${data.shipping}`,
    `Total: ${data.total}`,
    `Entrega em: ${data.destination}`,
  ];
  const html = `<ul>${data.items
    .map((item) => `<li>${item.quantity}× ${escapeHtml(item.name)} (${escapeHtml(item.size)}) — ${escapeHtml(item.lineTotal)}</li>`)
    .join("")}</ul>
<p>Subtotal: ${escapeHtml(data.subtotal)}<br>${data.discount ? `Desconto: −${escapeHtml(data.discount)}<br>` : ""}Frete (${escapeHtml(
    data.shippingService,
  )}): ${escapeHtml(data.shipping)}<br><strong>Total: ${escapeHtml(data.total)}</strong></p>
<p>Entrega em: ${escapeHtml(data.destination)}</p>`;
  return { text, html };
}

const demoNotice = "Pedido de DEMONSTRAÇÃO (catálogo ilustrativo): nada será cobrado ou enviado de verdade.";

function orderEmail(data: OrderEmailData, subject: string, intro: string[]): MailMessage {
  const summary = orderSummary(data);
  return {
    to: data.to,
    subject,
    text: [
      `Olá, ${data.customerName}.`,
      "",
      ...(data.isDemo ? [demoNotice, ""] : []),
      ...intro,
      "",
      ...summary.text,
      "",
      `Acompanhe o pedido: ${data.orderUrl}`,
    ].join("\n"),
    html: `<p>Olá, ${escapeHtml(data.customerName)}.</p>
${data.isDemo ? `<p><strong>${demoNotice}</strong></p>` : ""}
${intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${summary.html}
<p><a href="${escapeHtml(data.orderUrl)}">Acompanhar pedido</a></p>`,
  };
}

export function orderReceivedEmail(data: OrderEmailData & { payUntil: string }): MailMessage {
  return orderEmail(data, `Pedido ${data.orderNumber} recebido — aguardando pagamento`, [
    `Recebemos seu pedido ${data.orderNumber}. Os itens ficam reservados até ${data.payUntil}.`,
    "Se ainda não concluiu o pagamento, acesse o pedido pelo link abaixo.",
  ]);
}

export function orderPaidEmail(data: OrderEmailData): MailMessage {
  return orderEmail(data, `Pagamento aprovado — pedido ${data.orderNumber}`, [
    `O pagamento do pedido ${data.orderNumber} foi aprovado. Agora vamos separar e enviar seus itens.`,
  ]);
}

export function orderStatusEmail(data: OrderEmailData & { statusLabel: string; detail: string | null }): MailMessage {
  return orderEmail(data, `Pedido ${data.orderNumber}: ${data.statusLabel}`, [
    `O pedido ${data.orderNumber} mudou para: ${data.statusLabel}.`,
    ...(data.detail ? [data.detail] : []),
  ]);
}
