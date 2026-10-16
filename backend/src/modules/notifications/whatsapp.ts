/**
 * WhatsApp channel — STRUCTURE ONLY (E5). No message is ever sent in this phase.
 * The future implementation (WhatsApp Business Cloud API, E8) must:
 * - send only approved templates, to customers with an explicit WhatsApp opt-in recorded in
 *   `consents` (a dedicated transactional purpose, distinct from `marketing_whatsapp`);
 * - keep the access token server-side only (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).
 */
export interface WhatsAppMessage {
  /** E.164 phone, e.g. +5511987654321. */
  to: string;
  template: string;
  parameters: string[];
}

export type WhatsAppResult = { status: "sent"; providerMessageId: string } | { status: "skipped"; reason: string };

export interface WhatsAppSender {
  readonly enabled: boolean;
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
}

export const disabledWhatsAppSender: WhatsAppSender = {
  enabled: false,
  send: () => Promise.resolve({ status: "skipped", reason: "whatsapp_disabled" }),
};
