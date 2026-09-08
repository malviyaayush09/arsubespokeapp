# Arsu Atelier

Clients, measurements, orders and billing for **Arsu Ethnic & Western Bespoke
Studio**, RMV 2nd Stage, Bangalore. Replaces the Excel sheet and the three
photocopies with one screen and one **Print all 3** button.

Next.js + SQLite. Runs on the shop machine, no accounts, no monthly cost, no
internet needed once installed.

## Run it

```bash
npm install
npm run db:setup
npm run build
npm start
```

Then open <http://localhost:3000>. The server binds `0.0.0.0`, so a tablet or
phone on the shop Wi-Fi can reach it at `http://<shop-machine-ip>:3000` — which
is the point, because measurements get taken at the table, not at the counter.

`npm run dev` for development.

### Node version — read this before upgrading

`better-sqlite3` is pinned to **12.5.0** because that is the newest release
publishing a prebuilt binary for **Node 20 on Windows**. Newer versions (13.x)
require Node 22, and 12.11.1 has no Node 20 Windows prebuild, so npm falls back
to compiling from source and fails without Visual Studio Build Tools installed.

If Node is ever upgraded to 22+, `better-sqlite3` can go to 13.x. Until then,
leave the pin alone.

## What's where

```
db/schema.ts      the whole data model, and the reasoning behind it
db/seed.ts        10 garment types, 121 measurement fields, the letterhead
db/index.ts       SQLite connection (foreign keys ON, WAL)
lib/orders.ts     every rupee of the billing maths
lib/measure.ts    the 15½ / 15 1/2 / 15.5 parser
lib/money.ts      integer-paise money handling
app/              routes; app/actions/ holds every write
components/       UI, including print-sheets.tsx (the three copies)
data/arsu.db      THE SHOP. Not in git. Back it up.
```

## Two rules the code depends on

**1. An order's measurements are a snapshot, not a reference.** When an order is
created, the client's saved measurements are *copied* onto it — value, label and
unit. Re-measure the client next year and every past order still shows what was
actually cut. If measurements were a foreign key, updating a client would
silently rewrite the history of every garment ever made for them.

The same rule is why renaming or deleting a measurement field is safe, and why
retiring a garment type that has been ordered hides it instead of deleting it.

**2. Money is integer paise, and totals are never stored.** Every figure on
every bill is recomputed from the lines it is made of, so a total can never
disagree with its parts. There is no float anywhere near a rupee.

```
line   = (stitching + fabric) × quantity
total  = Σ lines + Σ extra charges − discount
balance = total − Σ payments
```

## The three copies

From one order, `/orders/[id]/print/all` renders three A4 pages in one go:

| Copy | Has | Deliberately does **not** have |
|---|---|---|
| **Tailor** | Every measurement, set large enough to read across a cutting table | Any price at all |
| **Client** | The bill, itemised | Measurements, internal notes |
| **Shop** | Everything, including internal notes and payment history | — |

The tailor copy carries no pricing on purpose: the person cutting has no reason
to see it, and a rate sheet left on a bench is how one client learns another
client's price.

Print to PDF with the browser's own "Save as PDF" — that is why there is no PDF
dependency.

## Garment types are data, not code

Settings → Garment types. Everything about a garment and its measurements is
editable in the app, with no developer involved:

- **Garment types** — add, rename, recategorise, hide from new orders, delete,
  or **duplicate with all its fields** (a Bandhgala is a Sherwani with a
  different length — copy and edit rather than retyping thirteen fields).
- **Fields** — add, rename, delete, change the unit, change the hint, switch
  between **measurement / free text / choice**, and edit a choice field's
  options at any time.
- **Order** — ↑ ↓ on each field. The order on screen is the order they are
  measured in and the order they print on the cutting card, so it should match
  Arsu's own sequence.

Changes appear in the measuring form and the order picker immediately. Ten types
are seeded across all three of the studio's lines — the terminology in
`db/seed.ts` is only a starting point, meant to be corrected in Arsu's own
words through this screen.

The one thing that cannot change is a field's internal `code`, because that is
what links a client's saved measurements to the field. Everything a person sees
can change; deleting a field or retiring a garment type never alters an order
already placed, because each order keeps its own copy.

## Day to day

- **Repeat order** — one button on any past order. Copies the garments and
  *that order's* measurements, not the client's current profile: if the last
  shirt was adjusted at the trial, those adjustments are the reason it fitted.
  Extras, discount and payments are not copied.
- **Default rates** per garment type (Settings → Garment types). They fill in
  on new order lines and can still be changed there. Changing a rate never
  touches an order already written.
- **Ready, not collected** — finished garments still on the shelf, oldest
  first, with the value and the money still owed. Also a dashboard tile.
- **WhatsApp** — buttons on an order and on the uncollected list. They open
  WhatsApp with the message already typed; a person presses send. No API, no
  account, no cost, nothing sends by itself.
- **Day book** — what came in today / this week / any range, split by cash, UPI
  and the rest. This is the evening reconciliation.
- **Reports** — month by month: orders taken, billed, collected, outstanding,
  garments made, top clients, and what is on each tailor's bench.
- **Tailors** — assign each garment to a karigar on the order screen; see
  everyone's load in Reports.

## Backup

Settings → Data. **Automatic daily backup is on by default** — it runs shortly
after the app starts and every six hours after that, keeps the newest 30 copies
and deletes older ones. There is a **Back up now** button too, and the dashboard
warns if the last backup is two days old.

Point the folder at OneDrive or Google Drive so the copy is off the machine.

It uses SQLite's **online backup API**, not a file copy, and that difference is
real: with WAL enabled, `arsu.db` on its own is not the current state — recent
writes live in `arsu.db-wal`. During this project a plain `cp` of the database
produced a backup with **zero orders in it**. Never back this up with a file
copy.

The whole shop is one file. Without a copy of it somewhere else, a dead laptop
is a dead record.

## Import and export

**Settings → Import from Excel.** Save the spreadsheet as CSV, choose it, and
the app reads the headings and guesses which column is the name, the phone and
so on — "Customer Name", "Mobile No" and "Remarks" are all recognised. It shows
the mapping and the first few rows before writing anything. Optionally it also
reads measurement columns (Chest, Waist, Sleeve Length…) into a dated
measurement set. A row with no name or no phone is skipped and reported.
Orders, bills and payment history are **not** imported — their shape varies too
much between spreadsheets to guess at, and a wrong balance is worse than none.

**Settings → Export.** CSV of clients, orders, garments, payments or
measurements, with a UTF-8 BOM and CRLF so Excel opens them cleanly, and
amounts in rupees rather than paise. These are for reading and for an
accountant — they are **not** a backup, because they cannot be loaded back in.
The `.db` file from Backup is the one that restores.

## Shop PIN

Settings → Shop PIN. One shared PIN for the whole shop — a lock on an
unattended tablet, not user accounts. Nothing records who did what.

It gates every page, the printed copies and the CSV exports. It does **not**
encrypt the database file, and it does not limit guesses. If it is ever
forgotten, delete the `pin_hash` row from the `settings` table.

## Resetting the demo data

The database currently contains one demo client, one order and a "Nehru Jacket"
garment type created while testing. To start clean, stop the server, delete
`data/arsu.db`, then `npm run db:setup`.

## Traps worth knowing before you change anything

Each of these cost real time here and none of them announces itself.

**`npm run db:push` is not safe on a populated database.** drizzle-kit adds a
column by rebuilding the whole table, and rebuilding `orders` or `order_items`
fails on the foreign keys that `order_item_measurements` holds into them
(`FOREIGN KEY constraint failed`). Add columns by hand instead — SQLite's
`ALTER TABLE … ADD COLUMN` touches nothing else:

```sql
ALTER TABLE garment_types ADD COLUMN default_stitching_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items  ADD COLUMN tailor_id INTEGER REFERENCES tailors(id) ON DELETE SET NULL;
```

Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` afterwards, and take
a real backup first.

**Never interpolate a column into a correlated subquery.** When the outer query
has no join, Drizzle renders `${clients.id}` as bare `"id"`, and inside
`SELECT … FROM orders o WHERE o.client_id = "id"` SQLite resolves `"id"` to
**`o.id`**. No error — just silently wrong numbers, in this case every client
showing the same order count and the same amount owing. Write the correlation
literally as `clients.id`. Every subquery in `lib/orders.ts` and
`app/clients/page.tsx` now does.

**A `"use server"` file may only export async functions.** Exporting a plain
array from one compiles fine and throws at runtime the first time the module
loads. That is why `lib/import-fields.ts` exists separately from
`app/actions/import.ts`.

**The PIN check has to live in each page, not the layout.** A layout that
redirects does not stop its children rendering: the page still ran and its
output went out in the RSC payload, so a locked `/clients` returned the unlock
screen with every client's name and phone in the page source behind it. Every
page therefore calls `await requireUnlocked()` as its first line. **A new page
must do the same** — copy the first line of any existing one.

## Known limitations

- **One status per order**, not per garment. A shirt cannot sit at Ready while
  the trousers are still in Stitching.
- **On the order's cutting card, choice fields render as free-text boxes**
  rather than dropdowns. Values save and print correctly; it is a UI
  inconsistency with the measuring form, not a data problem.
- **No computed measurement fields** (e.g. "hem = waist − 4").
- **Single user, no login.** Anyone who can reach the machine can use it.

## Deliberately not built

Flagged rather than guessed at: per-user accounts and roles, automatic
WhatsApp/SMS sending (the buttons here only open WhatsApp — a person still
presses send), payment gateway, server-side PDF files, per-garment status,
photo attachments per order, trial/alteration capture, fabric stock, direct
`.xlsx` reading (that needs a parser dependency — CSV covers it today), order
history import, and internet hosting.
