import Link from "next/link";
import { PAYMENT_METHOD_LABELS } from "@/db/schema";
import { dayBook } from "@/lib/reports";
import { formatPaise } from "@/lib/money";
import { formatDate, today } from "@/lib/format";
import { Money, PageHeader } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

function shift(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUnlocked();

  const params = await searchParams;
  const from = params.from || today();
  const to = params.to || from;

  const book = dayBook(from, to);
  const single = from === to;

  const presets = [
    { label: "Today", from: today(), to: today() },
    { label: "Yesterday", from: shift(-1), to: shift(-1) },
    { label: "Last 7 days", from: shift(-6), to: today() },
    { label: "Last 30 days", from: shift(-29), to: today() },
    { label: "This month", from: today().slice(0, 8) + "01", to: today() },
  ];

  return (
    <>
      <PageHeader
        title="Day book"
        subtitle={
          single
            ? formatDate(from)
            : `${formatDate(from)} — ${formatDate(to)}`
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        {presets.map((preset) => {
          const on = preset.from === from && preset.to === to;
          return (
            <Link
              key={preset.label}
              href={`/daybook?from=${preset.from}&to=${preset.to}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                on ? "bg-ink text-bone" : "border border-line bg-white hover:bg-bone"
              }`}
            >
              {preset.label}
            </Link>
          );
        })}

        <form className="ml-auto flex items-end gap-2" action="/daybook">
          <label>
            <span className="label">From</span>
            <input className="field" type="date" name="from" defaultValue={from} />
          </label>
          <label>
            <span className="label">To</span>
            <input className="field" type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn-secondary" type="submit">
            Show
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-medium tracking-wide text-muted uppercase">
            Collected
          </div>
          <div className="mt-1 font-serif text-3xl text-good">
            {formatPaise(book.total)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium tracking-wide text-muted uppercase">
            Payments
          </div>
          <div className="mt-1 font-serif text-3xl">{book.count}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium tracking-wide text-muted uppercase">
            By method
          </div>
          {book.byMethod.length === 0 ? (
            <div className="mt-1 text-sm text-muted">—</div>
          ) : (
            <dl className="mt-1 space-y-0.5 text-sm">
              {book.byMethod.map(([method, amount]) => (
                <div key={method} className="flex justify-between">
                  <dt className="text-muted">{PAYMENT_METHOD_LABELS[method]}</dt>
                  <dd className="tabular-nums">{formatPaise(amount)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {!single && book.byDay.length > 1 ? (
        <div className="card mt-4 p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Day by day
          </h2>
          <div className="space-y-1">
            {book.byDay.map(([day, amount]) => {
              const widest = Math.max(...book.byDay.map(([, a]) => a));
              const pct = widest > 0 ? Math.round((amount / widest) * 100) : 0;
              return (
                <div key={day} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted">{formatDate(day)}</span>
                  <span className="h-4 flex-1 rounded-sm bg-bone">
                    <span
                      className="block h-4 rounded-sm bg-gold/70"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatPaise(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bone">
              <th className="th">Date</th>
              <th className="th">Order</th>
              <th className="th">Client</th>
              <th className="th">Method</th>
              <th className="th">Note</th>
              <th className="th text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {book.rows.length === 0 ? (
              <tr>
                <td className="td text-muted" colSpan={6}>
                  No payments in this period.
                </td>
              </tr>
            ) : (
              book.rows.map((row) => (
                <tr key={row.id} className="hover:bg-bone">
                  <td className="td">{formatDate(row.paidOn)}</td>
                  <td className="td">
                    <Link href={`/orders/${row.orderId}`} className="hover:text-gold">
                      {row.orderNo}
                    </Link>
                  </td>
                  <td className="td">
                    <Link href={`/clients/${row.clientId}`} className="hover:text-gold">
                      {row.clientName}
                    </Link>
                  </td>
                  <td className="td">{PAYMENT_METHOD_LABELS[row.method]}</td>
                  <td className="td text-muted">{row.note ?? "—"}</td>
                  <td className="td text-right font-medium">
                    <Money paise={row.amountPaise} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {book.rows.length > 0 ? (
            <tfoot>
              <tr className="bg-bone font-medium">
                <td className="td" colSpan={5}>
                  Total
                </td>
                <td className="td text-right">
                  <Money paise={book.total} />
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="no-print mt-3 text-xs text-muted">
        Use your browser&rsquo;s print (Ctrl+P) for a paper copy of the day&rsquo;s
        takings, or export everything from Settings → Data.
      </p>
    </>
  );
}
