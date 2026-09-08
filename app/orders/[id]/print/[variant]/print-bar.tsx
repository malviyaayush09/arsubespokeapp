"use client";

import Link from "next/link";

export function PrintBar({
  orderId,
  orderNo,
  title,
  sheetCount,
}: {
  orderId: number;
  orderNo: string;
  title: string;
  sheetCount: number;
}) {
  return (
    <div className="no-print mx-auto flex max-w-[210mm] flex-wrap items-center gap-3">
      <Link href={`/orders/${orderId}`} className="btn-secondary btn-sm">
        ← Back to order
      </Link>

      <div className="text-sm">
        <span className="font-medium">{orderNo}</span>
        <span className="text-muted"> · {title}</span>
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="btn-primary btn-sm ml-auto"
      >
        Print {sheetCount === 1 ? "this copy" : `${sheetCount} pages`}
      </button>
    </div>
  );
}
