"use client";

import { useActionState } from "react";
import { removePin, setPin, type ActionState } from "@/app/actions/security";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-good/25 bg-good-soft px-3 py-2 text-sm text-good">
      {message}
    </p>
  );
}

export function PinForm({ enabled }: { enabled: boolean }) {
  const [setState, setAction] = useActionState<ActionState, FormData>(setPin, {});
  const [removeState, removeAction] = useActionState<ActionState, FormData>(
    removePin,
    {},
  );

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-serif text-lg">
          {enabled ? "Change the shop PIN" : "Set a shop PIN"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {enabled
            ? "Changing the PIN signs out every other device. This one stays unlocked."
            : "Without a PIN, anyone who opens the app on the shop Wi-Fi can read every client's phone number and address."}
        </p>

        <FormError message={setState.error} />
        <Notice message={setState.message} />

        <form action={setAction} className="mt-3 space-y-3">
          {enabled ? (
            <label className="block max-w-xs">
              <span className="label">Current PIN</span>
              <input
                className="field tracking-widest"
                name="current"
                type="password"
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
            <label className="block">
              <span className="label">New PIN</span>
              <input
                className="field tracking-widest"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
              />
            </label>
            <label className="block">
              <span className="label">Repeat it</span>
              <input
                className="field tracking-widest"
                name="confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
              />
            </label>
          </div>

          <p className="text-xs text-muted">4 to 8 digits.</p>

          <SubmitButton pendingLabel="Saving…">
            {enabled ? "Change PIN" : "Turn on the PIN"}
          </SubmitButton>
        </form>
      </div>

      {enabled ? (
        <div className="card p-5">
          <h2 className="font-serif text-lg">Remove the PIN</h2>
          <p className="mt-1 text-sm text-muted">
            The app becomes open to anyone who can reach this machine on the
            network.
          </p>

          <FormError message={removeState.error} />
          <Notice message={removeState.message} />

          <form action={removeAction} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="w-44">
              <span className="label">Current PIN</span>
              <input
                className="field tracking-widest"
                name="current"
                type="password"
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <SubmitButton
              className="btn-danger"
              pendingLabel="Removing…"
              confirm="Remove the PIN? The app will be open to anyone on the shop network."
            >
              Remove PIN
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
