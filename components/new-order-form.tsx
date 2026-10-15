"use client";

import { useActionState, useMemo, useState } from "react";
import { createOrder, type ActionState } from "@/app/actions/orders";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export type Person = {
  id: number;
  name: string;
  phone: string;
  orderCount: number;
};

export type GarmentChoice = {
  id: number;
  name: string;
  category: string;
  categoryLabel: string;
  /** The measurement groups this garment needs. */
  groupIds: number[];
};

export type GroupChoice = {
  id: number;
  name: string;
  fields: {
    id: number;
    label: string;
    unit: string;
    hint: string | null;
    fieldType: string;
    choiceList: string[];
  }[];
};

/**
 * One order, one screen.
 *
 * Three things in the order they are asked at the counter: who, what, and the
 * measurements. The last section only appears when something ticked actually
 * needs measuring - a returning client whose numbers are on file never sees
 * it, and a new client is measured without leaving the page.
 */
export function NewOrderForm({
  people,
  preselectedClientId,
  garments,
  groups,
  measured,
  today,
  suggestedOrderNo,
}: {
  people: Person[];
  preselectedClientId: number | null;
  garments: GarmentChoice[];
  groups: GroupChoice[];
  /** clientId -> groupId -> date last measured. */
  measured: Record<number, Record<number, string>>;
  today: string;
  suggestedOrderNo: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createOrder,
    {},
  );

  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState<number | null>(preselectedClientId);
  const [picked, setPicked] = useState<number[]>([]);
  /* Two men called Ramesh is an ordinary Tuesday. A name that finds somebody
     must not mean this is that somebody, so there is always a way through to
     a new record. */
  const [addingNew, setAddingNew] = useState(false);

  const chosen = people.find((p) => p.id === clientId) ?? null;

  /* Matching on phone as well as name, because a tailor remembers a number
     he has dialled more reliably than a spelling.

     The digit test is guarded, and that guard is the whole point: stripping
     non-digits out of a typed NAME leaves "", and every phone number in the
     world contains "". Unguarded, this matched every client on screen for any
     name typed, the list never emptied, and so the offer to add somebody new
     never appeared - a new client could not be taken at all. */
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return [];
    const digits = q.replace(/\D/g, "");
    return people
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (digits !== "" && p.phone.replace(/\D/g, "").includes(digits)),
      )
      .slice(0, 8);
  }, [people, search]);

  const toggle = (id: number) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  /* The measurements this order actually needs: every group the ticked
     garments draw on, minus the ones already on file for this client. For a
     new client nothing is on file, so everything needed shows. */
  const needed = useMemo(() => {
    const ids = new Set<number>();
    for (const garment of garments) {
      if (!picked.includes(garment.id)) continue;
      for (const groupId of garment.groupIds) ids.add(groupId);
    }
    const onFile = clientId ? (measured[clientId] ?? {}) : {};
    return groups
      .filter((g) => ids.has(g.id))
      .map((g) => ({ ...g, takenOn: onFile[g.id] ?? null }));
  }, [garments, groups, picked, clientId, measured]);

  const toMeasure = needed.filter((g) => g.takenOn === null);

  const grouped = garments.reduce<Record<string, GarmentChoice[]>>(
    (acc, g) => {
      (acc[g.categoryLabel] ??= []).push(g);
      return acc;
    },
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId ?? 0} />

      <FormError message={state.error} />

      {/* ── 1. who ──────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="font-serif text-lg">1. Who is it for</h2>

        {chosen ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div>
              <div className="font-medium">{chosen.name}</div>
              <div className="text-sm text-muted">
                {chosen.phone}
                {chosen.orderCount > 0
                  ? ` · ${chosen.orderCount} order${chosen.orderCount === 1 ? "" : "s"} before`
                  : " · first order"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setClientId(null);
                setSearch("");
              }}
              className="btn-secondary btn-sm"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <label className="mt-3 block">
              <span className="label">Name or phone number</span>
              <input
                className="field"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setAddingNew(false);
                }}
                placeholder="Start typing…"
                autoComplete="off"
              />
            </label>

            {matches.length > 0 ? (
              <div className="mt-2 space-y-1">
                {matches.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setClientId(person.id)}
                    className="flex w-full items-baseline justify-between rounded-md border border-line bg-white px-3 py-2 text-left text-sm transition hover:border-gold hover:bg-gold-soft"
                  >
                    <span className="font-medium">{person.name}</span>
                    <span className="text-muted">{person.phone}</span>
                  </button>
                ))}

                {!addingNew ? (
                  <button
                    type="button"
                    onClick={() => setAddingNew(true)}
                    className="px-1 py-1 text-sm text-muted underline underline-offset-2 transition hover:text-ink"
                  >
                    None of these — add a new client
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* No detour. A client who has never been here before is the
                commonest thing that happens, and it should not mean leaving
                this screen and finding the way back. */}
            {search.trim() !== "" && (matches.length === 0 || addingNew) ? (
              <div className="mt-3 rounded-md border border-gold/30 bg-gold-soft p-3">
                <p className="text-sm">
                  Nobody by that name or number. Add them:
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Name</span>
                    <input
                      className="field"
                      name="newClientName"
                      defaultValue={search.trim()}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Phone</span>
                    <input
                      className="field tabular-nums"
                      name="newClientPhone"
                      inputMode="tel"
                      autoComplete="off"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Saved with the order. Address and the rest can wait.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── 2. what ─────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">2. What they want</h2>
          <p className="text-sm text-muted">
            {picked.length === 0
              ? "Pick at least one."
              : `${picked.length} selected`}
          </p>
        </div>

        <div className="space-y-4">
          {Object.entries(grouped).map(([label, list]) => (
            <div key={label}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {label}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((garment) => {
                  const on = picked.includes(garment.id);
                  const onFile = clientId ? (measured[clientId] ?? {}) : {};
                  const ready =
                    garment.groupIds.length > 0 &&
                    garment.groupIds.every((id) => onFile[id]);
                  return (
                    <label
                      key={garment.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition ${
                        on
                          ? "border-gold bg-gold-soft"
                          : "border-line bg-white hover:border-gold/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="garmentTypeIds"
                        value={garment.id}
                        checked={on}
                        onChange={() => toggle(garment.id)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {garment.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {ready ? "Measurements on file" : "Needs measuring"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. measurements, only if something is missing ────────────────── */}
      {toMeasure.length > 0 ? (
        <div className="card p-5">
          <h2 className="font-serif text-lg">3. Measurements</h2>
          <p className="mt-1 text-sm text-muted">
            {chosen
              ? `${chosen.name} has not been measured for this yet.`
              : "A new client, so these are needed once."}{" "}
            Taken now, they serve every garment of this kind from here on.
          </p>

          {toMeasure.map((group) => (
            <div key={group.id} className="mt-4">
              <input type="hidden" name="measuredGroupIds" value={group.id} />
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {group.name}
              </h3>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {group.fields.map((field) => (
                  <label key={field.id} className="block">
                    <span className="mb-1 block text-xs text-ink-2">
                      {field.label}
                      {field.unit ? (
                        <span className="text-muted"> ({field.unit})</span>
                      ) : null}
                    </span>
                    {field.choiceList.length > 0 ? (
                      <select className="field" name={`m_${field.id}`} defaultValue="">
                        <option value="">—</option>
                        {field.choiceList.map((choice) => (
                          <option key={choice} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={`field ${field.fieldType === "number" ? "tabular-nums" : ""}`}
                        name={`m_${field.id}`}
                        type="text"
                        inputMode={field.fieldType === "number" ? "decimal" : "text"}
                        autoComplete="off"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <p className="mt-3 text-xs text-muted">
            Write numbers however you normally do — 34, 34.5, 34½ and 34 1/2 all
            work. Anything left blank can be filled in on the order afterwards.
          </p>
        </div>
      ) : null}

      {/* ── 4. the paperwork ────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="mb-3 font-serif text-lg">
          {toMeasure.length > 0 ? "4" : "3"}. Dates and number
        </h2>

        <label className="mb-4 block sm:max-w-[14rem]">
          <span className="label">Order number</span>
          <input
            className="field font-mono"
            type="text"
            name="orderNo"
            defaultValue={suggestedOrderNo}
            maxLength={40}
          />
          <span className="mt-1 block text-xs text-muted">
            Filled in for you. Type over it to use your own.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Order date</span>
            <input className="field" type="date" name="orderDate" defaultValue={today} />
          </label>
          <label className="block">
            <span className="label">Trial date</span>
            <input className="field" type="date" name="trialDate" />
          </label>
          <label className="block">
            <span className="label">Delivery date</span>
            <input className="field" type="date" name="promisedDate" />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="label">Internal notes</span>
          <textarea
            className="field"
            name="internalNotes"
            rows={2}
            placeholder="Shop-only. Never printed on the client's copy."
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Creating…">Create order</SubmitButton>
        <span className="text-sm text-muted">
          Prices, fabric and the advance come next, on the order itself.
        </span>
      </div>
    </form>
  );
}
