"use client";

import { useActionState } from "react";
import {
  backupNow,
  updateBackupSettings,
  updateSettings,
  type ActionState,
} from "@/app/actions/settings";
import { SETTING_KEYS, SETTING_LABELS } from "@/lib/settings-fields";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export function ShopSettingsForm({ values }: { values: Record<string, string> }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateSettings,
    {},
  );

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <FormError message={state.error} />
      {state.message ? (
        <p className="rounded-md border border-good/25 bg-good-soft px-3 py-2 text-sm text-good">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {SETTING_KEYS.map((key) => {
          const multiline = key === "shop_address" || key === "bill_footer";
          return (
            <label key={key} className={multiline ? "sm:col-span-2" : ""}>
              <span className="label">{SETTING_LABELS[key]}</span>
              {multiline ? (
                <textarea
                  className="field"
                  name={key}
                  rows={key === "shop_address" ? 3 : 2}
                  defaultValue={values[key] ?? ""}
                />
              ) : (
                <input className="field" name={key} defaultValue={values[key] ?? ""} />
              )}
            </label>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        These print in the letterhead on all three copies.
      </p>

      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}

export function BackupPanel({
  dir,
  auto,
  keep,
  lastBackup,
  daysSince,
  recent,
}: {
  dir: string;
  auto: boolean;
  keep: number;
  lastBackup: string | null;
  daysSince: number | null;
  recent: { name: string; bytes: number; modified: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(backupNow, {});
  const [settingsState, settingsFormAction] = useActionState<ActionState, FormData>(
    updateBackupSettings,
    {},
  );

  const stale = daysSince === null || daysSince >= 2;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-serif text-lg">Backup</h2>
        <p className="mt-1 text-sm text-muted">
          The entire shop — every client, measurement, order and payment — lives
          in one file. If this machine dies without a copy of it, so does the
          record. Point this at a synced folder (OneDrive, Google Drive) and it
          is off the machine too.
        </p>

        <p
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            stale
              ? "border border-danger/25 bg-danger-soft text-danger"
              : "border border-good/25 bg-good-soft text-good"
          }`}
        >
          {lastBackup
            ? `Last backup ${lastBackup}${daysSince !== null ? ` — ${daysSince} day${daysSince === 1 ? "" : "s"} ago` : ""}.`
            : "No backup has been taken yet."}
        </p>

        <FormError message={state.error} />
        {state.message ? (
          <p className="mt-2 rounded-md border border-good/25 bg-good-soft px-3 py-2 text-sm break-all text-good">
            {state.message}
          </p>
        ) : null}

        <form action={formAction} className="mt-3">
          <input type="hidden" name="destination" value={dir} />
          <SubmitButton className="btn-primary" pendingLabel="Backing up…">
            Back up now
          </SubmitButton>
        </form>
      </div>

      <form action={settingsFormAction} className="card space-y-3 p-5">
        <h2 className="font-serif text-lg">Automatic backup</h2>

        <FormError message={settingsState.error} />
        {settingsState.message ? (
          <p className="rounded-md border border-good/25 bg-good-soft px-3 py-2 text-sm text-good">
            {settingsState.message}
          </p>
        ) : null}

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="auto"
            defaultChecked={auto}
            className="mt-1 size-4 accent-[#a8842a]"
          />
          <span className="text-sm">
            Back up automatically once a day
            <span className="block text-xs text-muted">
              Runs shortly after the app starts and every six hours after that,
              so a day never passes unbacked while the shop machine is on.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Backup folder</span>
            <input className="field" name="destination" defaultValue={dir} />
          </label>
          <label className="block">
            <span className="label">Copies to keep</span>
            <input
              className="field tabular-nums"
              name="keep"
              type="number"
              min={1}
              defaultValue={keep}
            />
            <span className="mt-1 block text-xs text-muted">
              Older ones are deleted so the disk does not fill up.
            </span>
          </label>
        </div>

        <SubmitButton className="btn-secondary" pendingLabel="Saving…">
          Save backup settings
        </SubmitButton>
      </form>

      {recent.length > 0 ? (
        <div className="card p-5">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Recent backups
          </h3>
          <ul className="space-y-1 text-sm">
            {recent.map((file) => (
              <li key={file.name} className="flex justify-between gap-3">
                <span className="truncate font-mono text-xs">{file.name}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {(file.bytes / 1024 / 1024).toFixed(2)} MB
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
