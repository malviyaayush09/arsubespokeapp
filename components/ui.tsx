import Link from "next/link";
import { STATUS_LABELS, type OrderStatus } from "@/db/schema";
import { formatPaise } from "@/lib/money";
import { daysUntil } from "@/lib/format";

const STATUS_STYLES: Record<OrderStatus, string> = {
  placed: "bg-line/60 text-ink-2",
  cutting: "bg-gold-soft text-gold",
  stitching: "bg-gold-soft text-gold",
  trial: "bg-blue-50 text-blue-800",
  ready: "bg-good-soft text-good",
  delivered: "bg-good/15 text-good",
  cancelled: "bg-danger-soft text-danger",
};

export function StatusChip({ status }: { status: OrderStatus }) {
  return (
    <span className={`chip ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
  );
}

/** Red once a promised date has passed and the garment is not out the door. */
export function DueChip({
  promisedDate,
  status,
}: {
  promisedDate: string | null;
  status: OrderStatus;
}) {
  if (!promisedDate) return <span className="text-muted">—</span>;

  const settled = status === "delivered" || status === "cancelled";
  const days = daysUntil(promisedDate);
  const overdue = !settled && days !== null && days < 0;
  const soon = !settled && days !== null && days >= 0 && days <= 2;

  return (
    <span
      className={
        overdue
          ? "font-medium text-danger"
          : soon
            ? "font-medium text-gold"
            : "text-ink-2"
      }
    >
      {new Date(promisedDate + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      })}
      {overdue && days !== null ? ` · ${Math.abs(days)}d late` : ""}
    </span>
  );
}

export function Money({
  paise,
  className = "",
  muted = false,
}: {
  paise: number;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`tabular-nums ${muted && paise === 0 ? "text-muted" : ""} ${className}`}
    >
      {formatPaise(paise)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {action ? <div className="flex gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  href,
  cta,
}: {
  title: string;
  hint?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="card p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p> : null}
      {href && cta ? (
        <Link href={href} className="btn-primary mt-4">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "plain",
  href,
}: {
  label: string;
  value: string;
  tone?: "plain" | "warn" | "good";
  href?: string;
}) {
  const tones = {
    plain: "text-ink",
    warn: "text-danger",
    good: "text-good",
  } as const;

  const body = (
    <>
      <div className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </div>
      <div className={`mt-1 font-serif text-2xl ${tones[tone]}`}>{value}</div>
    </>
  );

  return href ? (
    <Link href={href} className="card block p-4 transition hover:border-gold">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
