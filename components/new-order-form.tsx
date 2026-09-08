"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createOrder, type ActionState } from "@/app/actions/orders";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export type GarmentChoice = {
  id: number;
  name: string;
  category: string;
  categoryLabel: string;
  /** 'YYYY-MM-DD' of the client's latest set, or null if never measured. */
  measuredOn: string | null;
};

export function NewOrderForm({
  clientId,
  clientName,
  garments,
  today,
}: {
  clientId: number;
  clientName: string;
  garments: GarmentChoice[];
  today: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createOrder, {});
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (id: number) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const grouped = garments.reduce<Record<string, GarmentChoice[]>>((acc, g) => {
    (acc[g.categoryLabel] ??= []).push(g);
    return acc;
  }, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />

      <FormError message={state.error} />

      <div className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Order date</span>
            <input className="field" type="date" name="orderDate" defaultValue={today} />
          </label>
          <label className="block">
            <span className="label">Promised delivery</span>
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

      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">Garments</h2>
          <p className="text-sm text-muted">
            {picked.length === 0
              ? "Pick at least one."
              : `${picked.length} selected. Saved measurements come across automatically.`}
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
                  return (
                    <label
                      key={garment.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                        on ? "border-gold bg-gold-soft/50" : "border-line bg-white hover:bg-bone"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="garmentTypeIds"
                        value={garment.id}
                        checked={on}
                        onChange={() => toggle(garment.id)}
                        className="mt-1 size-4 accent-[#a8842a]"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{garment.name}</span>
                        <span
                          className={`block text-xs ${
                            garment.measuredOn ? "text-good" : "text-muted"
                          }`}
                        >
                          {garment.measuredOn
                            ? `Measured ${garment.measuredOn}`
                            : "No measurements yet"}
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

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Creating…">Create order</SubmitButton>
        <Link href={`/clients/${clientId}`} className="btn-secondary">
          Cancel
        </Link>
      </div>

      <p className="text-xs text-muted">
        Creating the order copies {clientName}&rsquo;s saved measurements onto the
        cutting card. Anything missing can be filled in on the next screen, and
        prices are set there too.
      </p>
    </form>
  );
}
