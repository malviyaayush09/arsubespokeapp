import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

/* Calendar dates are 'YYYY-MM-DD' strings, parsed as LOCAL days. A delivery
   date is a day in the shop, not an instant — new Date('2026-08-15') parses as
   UTC midnight and can render as the 14th to anyone west of Greenwich. */

export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

/** '2026-08-15' -> '15 Aug 2026'. */
export function formatDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, "d MMM yyyy") : "—";
}

/** '2026-08-15' -> '15/08/26', for tight table columns. */
export function formatDateShort(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, "dd/MM/yy") : "—";
}

export function formatDateTime(ms: Date | number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const d = ms instanceof Date ? ms : new Date(ms);
  return isValid(d) ? format(d, "d MMM yyyy, h:mm a") : "—";
}

/** Negative when the date has passed. Null when there is no date. */
export function daysUntil(iso: string | null | undefined): number | null {
  const d = toDate(iso);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

/** 'Overdue by 3 days' / 'Due today' / 'in 5 days'. */
export function describeDue(iso: string | null | undefined): string {
  const days = daysUntil(iso);
  if (days === null) return "No date set";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "Overdue by 1 day";
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  return `Due in ${days} days`;
}
