/* WhatsApp click-to-message.
 *
 * This is a LINK, not an integration. No API, no account, no per-message cost,
 * nothing sending on its own: the link opens WhatsApp with the message already
 * typed, and a person presses send. That distinction matters — an app that
 * messages clients by itself is a different thing, and not what was asked for.
 */

/**
 * Indian mobile numbers get stored the way they are written — '9845012345',
 * '+91 98450 12345', '098450 12345'. wa.me needs digits only, with country
 * code and no plus.
 */
export function toWaNumber(phone: string, defaultCountry = "91"): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Already carries a country code.
  if (digits.length > 10 && digits.startsWith(defaultCountry)) return digits;
  // Local trunk prefix: 0 98450 12345
  if (digits.length === 11 && digits.startsWith("0")) {
    return defaultCountry + digits.slice(1);
  }
  if (digits.length === 10) return defaultCountry + digits;
  // Anything else is passed through — better a link that may work than none.
  return digits;
}

export function waLink(phone: string, message: string): string | null {
  const number = toWaNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export type MessageContext = {
  clientName: string;
  orderNo: string;
  shopName: string;
  /** Already formatted, e.g. '₹16,000'. */
  balance?: string;
  /** Already formatted, e.g. '19 Sep 2026'. */
  promisedDate?: string;
};

/* Kept short and plain. These get read on a phone, and a tailor's message that
   reads like marketing copy gets ignored. First names only would be wrong in
   India, so the full name as recorded is used. */
export const MESSAGE_TEMPLATES = {
  ready: (c: MessageContext) =>
    `Namaste ${c.clientName}, your order ${c.orderNo} is ready for collection at ${c.shopName}.` +
    (c.balance ? ` Balance due ${c.balance}.` : "") +
    ` Thank you.`,

  trial: (c: MessageContext) =>
    `Namaste ${c.clientName}, your order ${c.orderNo} is ready for a trial fitting at ${c.shopName}. ` +
    `Please let us know a convenient time. Thank you.`,

  delayed: (c: MessageContext) =>
    `Namaste ${c.clientName}, regarding your order ${c.orderNo}` +
    (c.promisedDate ? ` promised for ${c.promisedDate}` : "") +
    `. We will confirm the revised date shortly. Apologies for the delay.`,

  balance: (c: MessageContext) =>
    `Namaste ${c.clientName}, a balance of ${c.balance ?? ""} is outstanding on your order ${c.orderNo} at ${c.shopName}. ` +
    `Thank you.`,

  confirmed: (c: MessageContext) =>
    `Namaste ${c.clientName}, your order ${c.orderNo} is confirmed at ${c.shopName}` +
    (c.promisedDate ? ` for delivery on ${c.promisedDate}` : "") +
    `. Thank you.`,
} as const;

export type TemplateKey = keyof typeof MESSAGE_TEMPLATES;

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  confirmed: "Order confirmed",
  trial: "Call for trial",
  ready: "Ready for collection",
  balance: "Balance reminder",
  delayed: "Delay apology",
};
