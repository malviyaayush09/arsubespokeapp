import {
  MESSAGE_TEMPLATES,
  TEMPLATE_LABELS,
  waLink,
  type MessageContext,
  type TemplateKey,
} from "@/lib/whatsapp";

/* A plain link — no client component, no script. It opens WhatsApp with the
   message already typed; a person still presses send. Nothing here messages
   anybody on its own. */

export function WaButton({
  phone,
  template,
  context,
  label,
  className = "btn-secondary btn-sm",
}: {
  phone: string;
  template: TemplateKey;
  context: MessageContext;
  label?: string;
  className?: string;
}) {
  const href = waLink(phone, MESSAGE_TEMPLATES[template](context));

  if (!href) {
    return (
      <span className="text-xs text-muted" title="No usable phone number">
        No number
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="Opens WhatsApp with the message ready — you press send"
    >
      {label ?? TEMPLATE_LABELS[template]}
    </a>
  );
}
