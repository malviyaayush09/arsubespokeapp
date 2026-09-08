/* Automatic daily backup.
 *
 * Next runs register() once when the server starts. The shop machine gets
 * switched off at night, so this does two things: backs up shortly after
 * startup if one is due, then checks again every six hours for a machine that
 * stays on. Either way a day never passes unbacked while the app is running.
 *
 * A backup nobody remembers to take is the failure this prevents — the manual
 * button in Settings stays, but nothing depends on someone pressing it.
 */
export async function register() {
  /* register() also runs on the edge runtime, where node:fs and SQLite do not
     exist. Only the Node server should be doing this. */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { maybeAutoBackup } = await import("@/lib/backup");

  const attempt = async (reason: string) => {
    try {
      const result = await maybeAutoBackup();
      if (result) {
        console.log(
          `[backup] ${reason}: wrote ${result.file} (${(result.bytes / 1024 / 1024).toFixed(2)} MB)`,
        );
      }
    } catch (error) {
      /* Never take the server down over a backup. A failed backup is loud in
         the log and visible on the dashboard as a staleness warning. */
      console.error("[backup] failed:", error);
    }
  };

  /* Not immediately — let the server finish coming up and serve the first
     page before touching the database. */
  setTimeout(() => void attempt("startup"), 30_000).unref?.();

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => void attempt("scheduled"), SIX_HOURS).unref?.();
}
