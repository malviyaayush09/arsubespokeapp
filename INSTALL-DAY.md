# Install day — the shop laptop, step by step

Follow this in order on **his** laptop. Nothing here needs a USB stick; it all
downloads. Budget 45 minutes, most of it waiting on `npm ci`.

Every step ends with a check. **If a check fails, stop and fix it there.** A
failure carried forward costs far more than a failure caught in place.

---

## 1. Node.js

1. Open Edge, go to <https://nodejs.org>.
2. Download the **LTS** Windows Installer (`.msi`), 64-bit.
3. Run it. Accept the defaults. Do **not** tick "automatically install the
   necessary tools" — it is not needed and takes twenty minutes.
4. **Close PowerShell if it was open, and open a new one.** The installer edits
   PATH, and an already-open window will not see it.

**Check**

```powershell
node --version
npm --version
```

Expect `v20` or newer — `v24` ideal. If `node` is not recognised, the window
was open before the install; open a fresh one.

---

## 2. Git

1. <https://git-scm.com/download/win> → 64-bit standalone installer.
2. Run it. Defaults all the way through.

**Check**

```powershell
git --version
```

---

## 3. An SSH key for the laptop

This is what lets the laptop fetch updates later on its own, with nobody there
to type a password. Run this as **his normal Windows user**, not as
Administrator — the key must live in the profile that the nightly update task
will run as.

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -C "arsu-shop-laptop" -f "$env:USERPROFILE\.ssh\arsu_deploy" -N '""'
```

No passphrase, deliberately: an unattended task cannot type one.

Now print the **public** half:

```powershell
Get-Content "$env:USERPROFILE\.ssh\arsu_deploy.pub"
```

**Check** — one line starting `ssh-ed25519` and ending `arsu-shop-laptop`.
Copy the whole line.

---

## 4. Add it to GitHub as a deploy key

1. <https://github.com/malviyaayush09/arsubespokeapp> → **Settings** →
   **Deploy keys** (left sidebar) → **Add deploy key**.
2. Title: `Arsu shop laptop`.
3. Key: paste the line from step 3.
4. **Leave "Allow write access" UNCHECKED.** Read-only means a stolen laptop
   cannot push anything to the repo.
5. Add key.

---

## 5. Tell SSH to use that key

Create `%USERPROFILE%\.ssh\config` with exactly this:

```powershell
@"
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/arsu_deploy
  IdentitiesOnly yes
"@ | Set-Content -Path "$env:USERPROFILE\.ssh\config" -Encoding ASCII
```

Then trust github.com once, so the first unattended pull does not hang forever
on a yes/no prompt nobody is there to answer:

```powershell
ssh-keyscan github.com | Out-File -Append -Encoding ASCII "$env:USERPROFILE\.ssh\known_hosts"
```

**Check**

```powershell
ssh -T git@github.com
```

Expect: `Hi malviyaayush09/arsubespokeapp! You've successfully authenticated,
but GitHub does not provide shell access.`

That sentence about shell access is correct and expected — a deploy key is not
meant to give shell access.

If instead you get `Permission denied (publickey)`, the key did not reach
GitHub, or `config` was saved as `config.txt`. Fix it here, not later.

---

## 6. Get the installer

```powershell
git clone git@github.com:malviyaayush09/arsubespokeapp.git C:\ArsuAtelier-installer
```

This is also the real proof that steps 3 to 5 worked — if this clone succeeds,
the nightly update will too.

**Check**

```powershell
Test-Path C:\ArsuAtelier-installer\scripts\setup.ps1
```

Expect `True`.

---

## 7. Install

Open PowerShell **as Administrator** — Start → type `powershell` → right-click
→ **Run as administrator**. It needs this to register the startup task and the
firewall rule.

```powershell
cd C:\ArsuAtelier-installer
.\scripts\setup.ps1 -Repo git@github.com:malviyaayush09/arsubespokeapp.git -AllowTablet
```

If PowerShell refuses to run the script at all:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

and run it again. `-Scope Process` means the relaxation dies with this window.

What it does, in order: checks the machine, creates `C:\ArsuAtelier\` with
`app` `data` `backups` `logs`, clones the app, `npm ci`, builds, creates the
database, writes the launcher, registers the `ArsuAtelier` startup task as
SYSTEM, opens the firewall on **Private networks only**, makes the desktop and
Start-menu icons, starts it, and waits until it answers.

It stops at the first failure and never touches `data\`.

**Check** — the last lines say `the app is answering on http://localhost:3000`
followed by a summary box with the tablet address. Write that address down.

---

## 8. Turn on automatic updates

Back in a **normal** PowerShell — the same Windows account that holds the key
from step 3.

Pick a time the laptop is actually switched on. The shop laptop is off at 2am,
and a missed task runs on the next boot, which means the update would land
while he is opening the shop. Lunchtime is better:

```powershell
C:\ArsuAtelier\app\scripts\update.ps1 -InstallSchedule -At 14:00
```

**Check**

```powershell
Get-ScheduledTask -TaskName ArsuAtelierUpdate | Select-Object TaskName, State
```

---

## 9. Reboot — do not skip this

This is the step that proves the arrangement works unattended, which is the
whole point of it. Restart the laptop. When it comes back, **before doing
anything else**, click the **ARSU** icon on the desktop.

If it opens, the startup task works and he will never need a terminal.

If it does not:

```powershell
Get-Content C:\ArsuAtelier\logs\server.log -Tail 40
```

---

## 10. Set it up inside the app

Do these while you are still sitting there. Roughly 15 minutes.

1. **Settings → Shop PIN.** Set one. **Write it on the printed guide.** Without
   it, anyone on the shop wifi can read every client's name, phone and address.
2. **Settings → Garment types.** Set his real stitching rates. Three are set;
   the rest are at ₹0, and a ₹0 rate means every new order line starts blank.
3. **Settings → Data.** Point the backup folder at a OneDrive or Google Drive
   folder, so a copy leaves the building. Press **Back up now** and confirm a
   file appears there.
4. **Settings → Import.** His spreadsheet, saved as CSV first
   (`File → Save As → CSV`). Check the column mapping it guesses before
   confirming — it writes nothing until you do.

---

## 11. The tablet

On the tablet, open the address from step 7 (`http://<laptop-ip>:3000`),
unlock with the PIN, then **Add to Home Screen**.

Set a **DHCP reservation** for the laptop on the shop router, or its IP will
change on some future reboot and the tablet's bookmark will quietly stop
working.

---

## 12. Remote access, before you leave

Install **Tailscale** on his laptop and on yours, both signed into your
account. No router or firewall changes needed. This is the difference between
fixing a bad update from your desk and driving to RMV 2nd Stage.

Confirm from your own machine, on a different network, that you can reach his
laptop over Tailscale **before you leave the shop**.

---

## 13. Hand over

1. Print `ARSU-GUIDE.md` on one A4 sheet. Write your phone number on it.
2. Do **one real client end to end** with him watching: new client → take
   measurements → new order → **Print all 3** → mark Cutting → record the
   advance.
3. Then have him do the next one himself while you keep your hands off the
   keyboard. That loop is 90% of what he will ever do.
4. Show him three more things: the front page, the **Day book**, and the
   WhatsApp buttons — stressing that **he** presses send.
5. Tell him: nothing he presses can lose a measurement or an old bill. A red
   backup warning on the front page means call you.

---

## 14. Take a backup home

```powershell
explorer C:\ArsuAtelier\backups
```

Copy the newest `.db` onto your own machine. A backup that only exists in the
shop is not a backup.
