"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type PickableClient = {
  id: number;
  name: string;
  phone: string;
  orderCount: number;
};

/**
 * Filters in the browser over the list already sent with the page. A shop has
 * hundreds of clients, not millions, and this makes the search instant with no
 * round trip — which matters when someone is standing at the counter.
 */
export function ClientPicker({
  clients,
  hrefBase,
}: {
  clients: PickableClient[];
  /* A string, not a (id) => string builder. Functions cannot cross the
     server/client boundary — passing one here threw at request time on every
     load of /orders/new, which is the header's own "New order" link. */
  hrefBase: string;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 30);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, "").includes(q),
      )
      .slice(0, 30);
  }, [clients, query]);

  return (
    <div>
      <input
        className="field mb-3"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or phone…"
        autoComplete="off"
        autoFocus
      />

      {matches.length === 0 ? (
        <div className="card p-6 text-center text-sm">
          <p className="text-muted">No client matches that.</p>
          <Link href="/clients/new" className="btn-primary mt-3">
            Add a new client
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {matches.map((client) => (
            <Link
              key={client.id}
              href={`${hrefBase}${client.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-bone"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{client.name}</div>
                <div className="text-sm text-muted tabular-nums">{client.phone}</div>
              </div>
              <div className="ml-auto text-xs text-muted">
                {client.orderCount === 0
                  ? "First order"
                  : `${client.orderCount} order${client.orderCount === 1 ? "" : "s"}`}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!query && clients.length > matches.length ? (
        <p className="mt-2 text-xs text-muted">
          Showing {matches.length} of {clients.length}. Type to narrow.
        </p>
      ) : null}
    </div>
  );
}
