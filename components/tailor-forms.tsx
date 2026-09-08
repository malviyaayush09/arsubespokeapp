"use client";

import { useActionState } from "react";
import type { Tailor } from "@/db/schema";
import {
  createTailor,
  deleteTailor,
  updateTailor,
  type ActionState,
} from "@/app/actions/tailors";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export function NewTailorForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createTailor,
    {},
  );

  return (
    <div className="card p-5">
      <h2 className="mb-3 font-serif text-lg">Add a tailor</h2>
      <FormError message={state.error} />
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1">
          <span className="label">Name</span>
          <input className="field" name="name" placeholder="Ramesh" />
        </label>
        <label className="w-44">
          <span className="label">Phone (optional)</span>
          <input className="field" name="phone" type="tel" inputMode="tel" />
        </label>
        <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      </form>
    </div>
  );
}

export function TailorRow({
  tailor,
  garments,
}: {
  tailor: Tailor;
  garments: number;
}) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(
    updateTailor,
    {},
  );
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteTailor,
    {},
  );

  return (
    <div className="p-3">
      <FormError message={saveState.error} />
      <FormError message={deleteState.error} />

      <div className="flex flex-wrap items-end gap-2">
        <form action={saveAction} className="flex flex-1 flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={tailor.id} />
          <label className="min-w-36 flex-1">
            <span className="label">Name</span>
            <input className="field" name="name" defaultValue={tailor.name} />
          </label>
          <label className="w-40">
            <span className="label">Phone</span>
            <input
              className="field"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={tailor.phone ?? ""}
            />
          </label>
          <label className="flex items-center gap-2 pb-2.5">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={tailor.isActive}
              className="size-4 accent-[#a8842a]"
            />
            <span className="text-sm">Taking work</span>
          </label>
          <div className="pb-2.5 text-sm text-muted">
            {garments} on the bench
          </div>
          <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
            Save
          </SubmitButton>
        </form>

        <form action={deleteAction} className="pb-1">
          <input type="hidden" name="id" value={tailor.id} />
          <SubmitButton
            className="btn-danger btn-sm"
            pendingLabel="…"
            confirm={`Remove ${tailor.name}? If they have garments on record they will be marked inactive instead, so past orders keep their name.`}
          >
            Remove
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
