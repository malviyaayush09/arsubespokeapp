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
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ArsuAtelier\app\scripts\update.ps1 -Force
```

**Invoke it that way, not as `.\update.ps1`.** A stock Windows refuses to run
any `.ps1` at all — *"running scripts is disabled on this system"* — and the
refusal says nothing about what to do instead. `-ExecutionPolicy Bypass` on the
command line applies to that one invocation, so nothing on the laptop is
loosened and nothing has to be remembered next time. The scheduled tasks
already launch themselves this way; it is only a run by hand that trips over
it.

To fix it once for the account instead of typing it every time — no admin
rights needed, and scripts from a `git clone` are not internet-marked, so
`RemoteSigned` is enough:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
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

**`Cannot find module ...\next\dist\bin\next`** in `server.log`, and the
browser says *localhost refused to connect*. `node_modules` is incomplete.

**Always stop the app before running `npm ci`.** `npm ci` deletes
`node_modules` before reinstalling, and Windows refuses to delete a file that
a running process has loaded — a live Next.js server holds
`node_modules\@next\swc-win32-x64-msvc\*.node` open. npm deletes everything it
can, hits that file, fails with `EPERM` after about eight seconds, and leaves
the dependencies gutted. This cost nine days of downtime, and it looks enough
like a network error to be mistaken for one.

```powershell
Stop-ScheduledTask -TaskName ArsuAtelier
Start-Sleep 3
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
cd C:\ArsuAtelier\app
npm ci
Test-Path .\node_modules\next\dist\bin\next     # must be True before going on
npm run build
Start-ScheduledTask -TaskName ArsuAtelier
```

The first three lines are the ones that matter — without them `npm ci` fails
on a locked file and makes things worse. Nothing in `data\` is affected
either way; this is only the dependency folder.

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

## The two buttons

Rather than typing, double-click these from `C:\ArsuAtelier\app\scripts`
(make desktop shortcuts to them):

| | |
|---|---|
| `update-now.cmd` | Take the latest version. Says when it is done. |
| `repair-now.cmd` | The shop is down and nobody knows why. |

They exist because the three things that have ever stopped an update working
were all typing: the execution policy, the wrong directory, and `-Force` when
it was not wanted. None of those are decisions - they are the same every time.

Both set `-ExecutionPolicy Bypass` for that one call, pass the root
explicitly, and keep the window open so the result can be read.

### Should it update by itself?

`update.ps1 -InstallSchedule -At 14:00` registers a daily task, and that is the
supported way - not a hand-written .bat, which would duplicate the fetch the
script already does.

**Do not trigger it at startup.** The laptop is off overnight, so a daily
trigger with `-StartWhenAvailable` fires at the next boot, which is the moment
he opens the shop. The app would be down for five minutes exactly when the
first client walks in. Pick an hour he is certainly open but not busy.

And consider not scheduling it at all. A new version exists only when somebody
changes the code, which happens a handful of times a month and always while
both people are in contact. An unattended update buys very little and can
leave the shop down until the watchdog or a person notices.

## When the shop is down

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ArsuAtelier\app\scripts\update.ps1 -Repair
```

One command, and it is safe to run when nothing is wrong. It restores
whatever a half-finished update left behind, rebuilds if there is nothing to
restore, checks the database, starts the app, and refuses to claim success
until the app answers.

**Why it exists.** An update stops the app, moves the working build and the
working dependencies aside, and puts them back from its own error handler.
That covers a command that fails. It does not cover the process ceasing to
exist — a closed window, a Ctrl-C, a lid, a power cut — and then nothing is
moved back. The shop is left with no build, the startup task restarts the app
every time, and it dies every time with *"Could not find a production build in
the .next directory"*, which tells whoever reads it nothing about an update.

That happened, mid `npm ci`, and the shop stayed down.

So `update.ps1` writes `C:\ArsuAtelier\previous\INTERRUPTED.txt` before it
moves anything, and removes it only once the app has answered. A file survives
anything that kills a process, so its presence means exactly one thing: the
last run did not finish. Every later run repairs **before** it does anything
else — which is the part that matters, because an update that walked past a
half-finished one would move an already-missing build aside and overwrite the
one snapshot that could have brought the shop back.

Ctrl-C is caught in the moment as well, since PowerShell runs a `finally`
block on it. That is the courtesy; the marker file is the guarantee.

The watchdog uses it too: if a restart does not bring the app back, it repairs
before giving up and asking for a person.

## Clearing the practice records

The day the shop starts using it for real, whatever was entered while trying
it out has to go — without taking the setup with it.

```powershell
cd C:\ArsuAtelier\app
npm run db:clear              # shows what would go. Changes nothing.
npm run db:clear -- --yes     # does it
```

Deleted: clients, orders, order items, the measurement snapshots on them,
status history, payments, charges, and the measurements held against a client.

Kept: the garments he stitches, the measurement groups and fields, his rates,
the shop's name, address, phone, terms and bill footer, the PIN, tailors, and
the migration history.

It takes a backup first, into `C:\ArsuAtelier\backups\before-clear-*.db`, and
refuses to go on if that backup fails its integrity check. The delete is one
transaction, so it either all happens or none of it does. Order numbers start
from 1 again.

Run it with the app still running if you like — nothing is open in a way that
would conflict. Reload the browser afterwards.

## The iPad at the measuring table

The app already listens on every interface (`next start -H 0.0.0.0`), so the
iPad needs no software at all — only the laptop's address and a hole in the
firewall. Both devices must be on the **same wifi**.

**1. Set the PIN first.** Shop setup -> Security. Until this is done, anybody
on that wifi can open the app and read every client's phone number. Do not
skip it and come back later.

**2. Make the shop wifi Private.** Windows calls an unknown network Public and
blocks inbound traffic on it whatever rules exist. Check, and change it if
needed (Administrator):

```powershell
Get-NetConnectionProfile
Set-NetConnectionProfile -Name "<the wifi name it printed>" -NetworkCategory Private
```

**3. Open the port** (Administrator). `setup.ps1 -AllowTablet` does this; if
the laptop was set up without that switch:

```powershell
New-NetFirewallRule -DisplayName "Arsu Atelier (3000)" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

Private only, deliberately. On a cafe or airport wifi the port stays shut.

**4. Find the laptop's address.** Not `localhost` — that means the iPad itself.
This picks the real wifi adapter and ignores the Hyper-V and VPN ones, which
is the usual reason a hand-copied address does not work:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Wireless|Ethernet' -and
                 $_.InterfaceAlias -notmatch 'vEthernet' -and
                 $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { "http://$($_.IPAddress):3000   [$($_.InterfaceAlias)]" }
```

**5. On the iPad**, open Safari, type that address, enter the PIN once. Then
**Share -> Add to Home Screen**. It gets the ARSU monogram as its icon and
opens with no address bar, like an app. The unlock lasts 30 days per device.

**6. Stop the address changing.** The router hands out a new one every few
weeks and the bookmark then dies. Either reserve it in the router (DHCP
reservation against the laptop's wifi MAC — the reliable fix), or set a static
address on the laptop. Until one of those is done, expect to redo step 4
occasionally.

If the iPad cannot reach it: check both are on the same wifi (not one on a
guest network), then that the app is actually up — `http://localhost:3000` on
the laptop itself — then the two commands above, in that order. Client
isolation, which some routers switch on by default, blocks device-to-device
traffic entirely and can only be turned off in the router.
