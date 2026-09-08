"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Client } from "@/db/schema";
import { createClient, updateClient, type ActionState } from "@/app/actions/clients";
import { Field, SubmitButton, TextArea } from "@/components/forms";
import { FormError } from "@/components/ui";

export function ClientForm({ client }: { client?: Client }) {
  const action = client ? updateClient : createClient;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="card space-y-4 p-5">
      {client ? <input type="hidden" name="id" value={client.id} /> : null}

      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          required
          autoFocus={!client}
          defaultValue={client?.name}
          placeholder="Full name"
        />
        <Field
          label="Phone"
          name="phone"
          required
          type="tel"
          inputMode="tel"
          defaultValue={client?.phone}
          placeholder="98xxxxxxxx"
        />
        <Field
          label="Alternate phone"
          name="altPhone"
          type="tel"
          inputMode="tel"
          defaultValue={client?.altPhone}
        />
        <Field label="Email" name="email" type="email" defaultValue={client?.email} />
      </div>

      <TextArea label="Address" name="address" defaultValue={client?.address} rows={3} />
      <TextArea
        label="Notes"
        name="notes"
        defaultValue={client?.notes}
        rows={3}
        hint="Preferences, fit notes, anything worth remembering next time."
      />

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">
          {client ? "Save changes" : "Add client"}
        </SubmitButton>
        <Link
          href={client ? `/clients/${client.id}` : "/clients"}
          className="btn-secondary"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
