"use client";

import { useActionState } from "react";
import { unlock, type ActionState } from "@/app/actions/security";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export function UnlockScreen({ shopName }: { shopName: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(unlock, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <form action={formAction} className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <div className="font-serif text-3xl tracking-[0.22em] text-bone">
            {shopName}
          </div>
          <p className="mt-2 text-sm text-bone/60">Enter the shop PIN</p>
        </div>

        <FormError message={state.error} />

        <input
          className="field w-full text-center text-2xl tracking-[0.5em]"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          aria-label="Shop PIN"
        />

        <SubmitButton
          className="btn w-full bg-gold font-medium text-ink hover:brightness-110"
          pendingLabel="Checking…"
        >
          Unlock
        </SubmitButton>

        <p className="text-center text-xs text-bone/40">
          This device stays unlocked for 30 days.
        </p>
      </form>
    </div>
  );
}
