# Setting up the shop laptop

Everything here is for **you**, not the tailor. He gets `ARSU-GUIDE.md` — one
page, no jargon.

## How it fits together

```
C:\ArsuAtelier\
  app\               the code — a git checkout. Updates replace this.
  data\arsu.db       THE SHOP. Never touched by an update.
  backups\           automatic daily + one before every update
  logs\              server.log, update.log
  start-arsu.cmd     what the startup task runs
```

The data lives **outside** the app folder on purpose. An update can reset,
rebuild or re-clone `app\` and the shop's records cannot be caught in it.

The app runs as a **Windows scheduled task** at startup, as SYSTEM, so it is up
before anyone logs in and restarts itself if it dies. The tailor's only contact
with it is a desktop icon that opens it in a bare browser window — no address
bar, no tabs. It reads as a program.

## Before you go to the shop

1. **The repo** is `malviyaayush09/arsubespokeapp` (private). Self-updates pull
   from it, so it must be pushed before you go. Without a repo you can still
   install with `-FromLocal`, but then every change means visiting again.
2. **A Node LTS MSI** on a USB stick — <https://nodejs.org>. Any of Node 20,
   22 or 24 works; `better-sqlite3` 12.5.0 has Windows prebuilds for all of
   them. If Node is upgraded later, run `npm rebuild better-sqlite3` — see the
   README.
3. **Git for Windows** on the same stick — needed for self-updates.
4. Decide whether you want the **tablet** at the measuring table. If yes, the
   laptop needs a stable local IP (DHCP reservation on the shop router, or a
   static IP), or its address will change and the tablet's bookmark will break.

## Install (once, ~10 minutes)

Install Node and Git first. Then, in an **Administrator PowerShell**:

```powershell
cd C:\ArsuAtelier-installer   # wherever you put these scripts
.\scripts\setup.ps1 -Repo git@github.com:malviyaayush09/arsubespokeapp.git -AllowTablet
```

The repo is private, so set up the deploy key first — see *Giving the laptop
read access* below. That is why the URL is SSH rather than HTTPS.

No repo? `.\scripts\setup.ps1 -FromLocal D:\arsu-atelier -AllowTablet`

It checks the machine, clones or copies, installs, builds, creates the
database, registers the startup task, opens the firewall for **private
networks only**, makes the desktop and Start-menu icons, starts it, and waits
until it answers before declaring success. It refuses to continue if anything
fails, and it never touches `data\`.

Then turn on nightly updates:

```powershell
.\app\scripts\update.ps1 -InstallSchedule -At 02:30
```

### Four things to do in the app afterwards

Do these while you are still sitting there:

1. **Settings → Shop PIN** — set one. Without it, anyone who opens the app on
   the shop wifi can read every client's phone number and address.
2. **Settings → Garment types** — set his real stitching rates. They ship at
   ₹0, so every new order line starts blank until you do.
3. **Settings → Data** — point the backup folder at a OneDrive or Google Drive
   folder so a copy leaves the building.
4. **Settings → Import** — bring the old spreadsheet across. Save it as CSV
   first (`File → Save As → CSV`).

Also: **write the PIN down somewhere you keep**, and check the tablet actually
reaches `http://<laptop-ip>:3000` before you leave.

## Shipping a change

```bash
# on your machine
git push
```

Then either wait for the nightly task, or force it now over Tailscale:

```powershell
C:\ArsuAtelier\app\scripts\update.ps1
```

What it does, in this order — and the order is the design:

1. Back up the database, and **refuse to go on if the backup fails**
2. Fetch; stop if there is nothing new
3. `npm ci`, then build — **if either fails the database has not been touched**
4. Only then migrate
5. Restart, then poll until the app answers
6. **Any failure at all** → put the old commit and the old build back, restart,
   and exit non-zero

Build before migrate, never the reverse. And keep migrations **additive** (see
`db/migrations.ts`): a rollback puts older code in front of the newer schema,
and older code has to be able to ignore what it does not know about.

Read `C:\ArsuAtelier\logs\update.log` afterwards.

### Changing the schema

Add a step to `MIGRATIONS` in `db/migrations.ts`. Make it **idempotent** — check
before you act — and additive. Never use `drizzle-kit push` against the shop's
database: to add a column it rebuilds the whole table, and rebuilding `orders`
or `order_items` fails on the foreign keys `order_item_measurements` holds into
them. `npm run db:setup` handles both cases: it creates the schema on an empty
database and applies only pending migrations on a live one.

## Getting in remotely

Install **Tailscale** on his laptop and on yours, both signed into your
account. It needs no router or firewall changes. Then:

```powershell
# from your machine
Enter-PSSession -ComputerName <tailscale-name>
```

Or enable Remote Desktop on his laptop and connect over Tailscale. AnyDesk
works too and is easier for a non-technical person to accept on demand, but it
needs him to be sitting there.

Tailscale is the difference between fixing a bad migration from your desk and
driving to RMV 2nd Stage.

## When something is wrong

**Is it running?**

```powershell
Get-ScheduledTask -TaskName ArsuAtelier | Get-ScheduledTaskInfo
Get-Content C:\ArsuAtelier\logs\server.log -Tail 40
Invoke-WebRequest http://localhost:3000 -UseBasicParsing -MaximumRedirection 0
```

A **307** is healthy — that is the PIN lock redirecting to the unlock screen.

**Restart it**

```powershell
Stop-ScheduledTask -TaskName ArsuAtelier
Start-ScheduledTask -TaskName ArsuAtelier
```

**Roll back by hand**

```powershell
cd C:\ArsuAtelier\app
git log --oneline -5
git reset --hard <good-commit>
npm ci; npm run build
Stop-ScheduledTask -TaskName ArsuAtelier; Start-ScheduledTask -TaskName ArsuAtelier
```

**Restore the database** — the last resort, and it loses everything since that
backup. Stop the app first; deleting `-wal`/`-shm` while it is running will
corrupt the file.

```powershell
Stop-ScheduledTask -TaskName ArsuAtelier
Start-Sleep -Seconds 3
cd C:\ArsuAtelier\data
Copy-Item arsu.db arsu.db.broken            # keep the bad one, just in case
Remove-Item arsu.db, arsu.db-wal, arsu.db-shm -ErrorAction SilentlyContinue
Copy-Item ..\backups\<chosen-backup>.db arsu.db
Start-ScheduledTask -TaskName ArsuAtelier
```

Check a backup before trusting it:

```powershell
cd C:\ArsuAtelier\app
$env:ARSU_DB_PATH="C:\ArsuAtelier\backups\<chosen>.db"; npm run db:setup
```

**He forgot the PIN.** Delete the `pin_hash` row from `settings` in
`data\arsu.db` (any SQLite tool, or `npm run db:studio`).

**Forced offline for an evening.** Nothing to do — the app is local and keeps
working without internet. Only self-updates need the network.

## Giving the laptop read access (private repo)

The repo is **private**, so the laptop needs to authenticate without anyone
typing a password at 2am. Use a **read-only deploy key**: it is scoped to this
one repo and cannot push, so the shop laptop being stolen does not put your
code at risk.

Do this on **his laptop**, before running `setup.ps1`.

**1. Make a key** (no passphrase — an unattended task cannot type one):

```powershell
ssh-keygen -t ed25519 -C "arsu-shop-laptop" -f "$env:USERPROFILE\.ssh\arsu_deploy" -N '""'
Get-Content "$env:USERPROFILE\.ssh\arsu_deploy.pub"
```

**2. Add the public half to GitHub**: repo → Settings → Deploy keys → Add
deploy key. Paste it. **Leave "Allow write access" unchecked.**

**3. Tell SSH to use it** — create `%USERPROFILE%\.ssh\config`:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/arsu_deploy
  IdentitiesOnly yes
```

**4. Trust the host once**, so the first unattended pull does not hang on a
yes/no prompt:

```powershell
ssh-keyscan github.com | Out-File -Append -Encoding ASCII "$env:USERPROFILE\.ssh\known_hosts"
ssh -T git@github.com     # expect: "Hi ...! You've successfully authenticated"
```

**5. Install using the SSH URL:**

```powershell
.\setup.ps1 -Repo git@github.com:malviyaayush09/arsubespokeapp.git -AllowTablet
```

**Which account owns the key matters.** The app's startup task runs as SYSTEM
(it needs nothing from the network), but `update.ps1 -InstallSchedule`
deliberately registers the *update* task as **the user who runs it**, because
that is whose `~/.ssh` holds the deploy key — SYSTEM has a different profile
and would fail every night with a permission error. So run
`-InstallSchedule` from the same Windows account that you put the key in.

## Take a backup with you

Before you leave, copy `C:\ArsuAtelier\backups\*.db` onto your own machine.
A backup that only exists in the shop is not a backup.
