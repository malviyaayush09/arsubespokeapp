"use client";

import { useActionState } from "react";
import {
  deleteMeasurementSet,
  type ActionState,
} from "@/app/actions/measurements";
import { SubmitButton } from "@/components/forms";

export function DeleteSetButton({
  clientId,
  setId,
}: {
  clientId: number;
  setId: number;
}) {
  const [, formAction] = useActionState<ActionState, FormData>(
    deleteMeasurementSet,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="setId" value={setId} />
      <SubmitButton
        className="btn-danger btn-sm"
        pendingLabel="Deleting…"
        confirm="Delete this measurement record? Orders already cut to these numbers keep their own copy and are not affected."
      >
        Delete
      </SubmitButton>
    </form>
  );
}
