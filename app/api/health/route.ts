import { sql } from "drizzle-orm";
import { db } from "@/db";
import { lastBackupAt } from "@/lib/backup";

/* Is the shop's app alive, and is its data still being backed up?
 *
 * DELIBERATELY NOT BEHIND THE PIN. A monitor that needs a password is a
 * monitor nobody runs, and the whole reason this exists is that the app once
 * sat dead for days with no one the wiser.
 *
 * Which means it must be safe to read by anyone who can reach the port - the
 * shop wifi, and your own machine over Tailscale. So it returns NO client
 * data: no names, no phone numbers, no amounts, not even an order count.
 * Only whether the thing is working.
 *
 *   curl http://localhost:3000/api/health
 *
 * 200 with ok:true  -> running, database readable, backups recent
 * 200 with ok:false -> running, but something needs attention (read `warnings`)
 * no answer at all  -> the app is down
 */

export const dynamic = "force-dynamic";

/** Older than this and a backup has quietly stopped happening. */
const BACKUP_STALE_HOURS = 30;

export async function GET() {
  const warnings: string[] = [];

  /* A trivial read proves more than a ping: the process can be up while the
     database file is locked, missing or on a disconnected drive. */
  let dbOk = false;
  try {
    db.get(sql`select 1`);
    dbOk = true;
  } catch {
    warnings.push("the database could not be read");
  }

  let lastBackup: Date | null = null;
  let backupAgeHours: number | null = null;
  try {
    lastBackup = lastBackupAt();
    if (lastBackup) {
      backupAgeHours =
        Math.round(((Date.now() - lastBackup.getTime()) / 3_600_000) * 10) / 10;
      if (backupAgeHours > BACKUP_STALE_HOURS) {
        warnings.push(`last backup was ${Math.round(backupAgeHours)} hours ago`);
      }
    } else {
      warnings.push("no backup has ever been taken");
    }
  } catch {
    warnings.push("the backup setting could not be read");
  }

  const uptimeSeconds = Math.round(process.uptime());

  return Response.json(
    {
      ok: dbOk && warnings.length === 0,
      dbOk,
      uptimeSeconds,
      /* A restart loop shows up here as an uptime that keeps resetting. */
      startedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
      lastBackupAt: lastBackup ? lastBackup.toISOString() : null,
      backupAgeHours,
      warnings,
      checkedAt: new Date().toISOString(),
    },
    {
      status: 200,
      /* Never let a proxy or the browser hand back a cached "it's fine". */
      headers: { "cache-control": "no-store" },
    },
  );
}
