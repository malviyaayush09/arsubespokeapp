/* Seed: measurement groups, garment types, and the shop letterhead.
 *
 * All of this is read off Arsu's own order sheet rather than invented. He does
 * not measure per garment: his form has eleven rows for the upper body which
 * serve Shirt, Kurta, Coat, W-Coat, Bandi, Bandhgala, Sherwani and
 * Indowestern, and eight for the lower body which serve Pant, Shorts, Dhoti
 * and Chudi Pant. Nineteen numbers for the whole business. The suits take both
 * halves, because a suit is coat and trousers.
 *
 * So the groups below are the real structure, and a garment's measuring form
 * is its groups' fields plus anything it owns outright.
 *
 * Idempotent - safe to re-run, and it is re-run after every migration.
 * Garment types match on slug, fields on (garment type, code). A re-run adds
 * what is missing and leaves anything Arsu has edited through the Garment
 * types screen alone.
 *
 * Every label here is editable in the app. These are his words as I read them
 * off his sheet; where I have one wrong he corrects it in Settings, and this
 * file is never touched again.
 */
import { pathToFileURL } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import {
  garmentTypeGroups,
  garmentTypes,
  measurementFields,
  settings,
  type FieldType,
  type GarmentCategory,
} from "./schema";

type FieldSeed = {
  label: string;
  code: string;
  unit?: string;
  type?: FieldType;
  choices?: string[];
  hint?: string;
  /** "Measurements" or "Style" - see the note on style() below. */
  group?: string;
};

/* Free text, not a measurement: no unit, and kept away from the number
   parser. His sheet carries exactly this along the bottom - "Pant - Slim fit
   Ankle length 2hp 1wp". */
const notes = (code: string): FieldSeed => ({
  label: "Fit notes",
  code,
  type: "text",
  unit: "",
  hint: "Slim fit, ankle length, pleats - anything that is not a number",
});

/* STYLE, which is not measurement.
 *
 * Arsu writes these beside the amounts on his sheet - how many pockets, what
 * cuff, single or back pocket. They are not facts about the client's body:
 * chest is 40 for every shirt he ever orders, but this shirt has one pocket
 * and the next might have two.
 *
 * So they carry groupName "Style", which keeps them OUT of the measuring form
 * (where they would be saved against the person and wrongly reused) and IN
 * the order's garment card, where they are chosen per job and printed on the
 * cutting copy. Repeat order copies them forward, which is how "same as last
 * time" works.
 *
 * Choice lists only where the options are self-evident - a count, or yes and
 * no. Everything that depends on his own vocabulary is a text box, because a
 * dropdown missing his word is worse than an empty box. Convert them to
 * choices in Settings once his real list is known.
 */
const style = (
  label: string,
  code: string,
  choices?: string[],
): FieldSeed => ({
  label,
  code,
  unit: "",
  type: choices ? "choice" : "text",
  choices,
  group: "Style",
});

type GroupSeed = {
  name: string;
  slug: string;
  fields: FieldSeed[];
};

/* Codes are prefixed because Length and Hip appear in BOTH halves of his
   sheet, and a suit inherits both halves. Unprefixed, a suit would carry two
   fields coded 'length' and nothing could tell them apart. Codes are internal
   and never shown; the labels are what he reads. */
const GROUPS: GroupSeed[] = [
  {
    name: "Upper body",
    slug: "group-upper",
    fields: [
      { label: "Length", code: "up_length" },
      { label: "Chest", code: "up_chest" },
      { label: "Stomach", code: "up_stomach" },
      { label: "Hip", code: "up_hip" },
      { label: "Shoulder", code: "up_shoulder" },
      { label: "Slv Length", code: "up_slv_length" },
      { label: "Half Slv Length", code: "up_half_slv_length" },
      { label: "Collar", code: "up_collar" },
      { label: "Arm Loosing", code: "up_arm_loosing" },
      { label: "Slv Open", code: "up_slv_open" },
      { label: "Cross Back", code: "up_cross_back" },
      notes("up_fit_notes"),
      style("Pockets", "up_pockets", ["None", "1", "2"]),
      style("Cuff", "up_cuff"),
      style("Collar", "up_collar_style"),
      style("Buttons", "up_buttons"),
      style("Other", "up_style_other"),
    ],
  },
  {
    name: "Lower body",
    slug: "group-lower",
    fields: [
      { label: "Length", code: "lo_length" },
      { label: "Waist", code: "lo_waist" },
      { label: "Hip", code: "lo_hip" },
      { label: "Thigh", code: "lo_thigh" },
      { label: "Fork", code: "lo_fork" },
      { label: "Bottom", code: "lo_bottom" },
      { label: "Knee", code: "lo_knee" },
      { label: "Calf", code: "lo_calf" },
      notes("lo_fit_notes"),
      style("Pleats", "lo_pleats", ["Flat", "1", "2"]),
      style("Hip pockets", "lo_hip_pockets", ["None", "1", "2"]),
      style("Back pockets", "lo_back_pockets", ["None", "1", "2"]),
      style("Watch pocket", "lo_watch_pocket", ["No", "Yes"]),
      style("Bottom", "lo_bottom_style"),
      style("Other", "lo_style_other"),
    ],
  },
];

type GarmentSeed = {
  name: string;
  slug: string;
  category: GarmentCategory;
  /** Group slugs, in the order they get measured. */
  groups: string[];
  /** Fields this garment alone has, on top of its groups'. */
  fields?: FieldSeed[];
  /** An older slug for the same garment: adopted rather than duplicated. */
  wasSlug?: string;
};

/* In the order of his billing list, so the order screen reads like his sheet. */
const GARMENTS: GarmentSeed[] = [
  { name: "Shirt", slug: "shirt", category: "western", groups: ["group-upper"] },
  /* Seeded originally as "Trouser". His word is Pant, and the existing row is
     adopted rather than duplicated so past orders keep their garment. */
  { name: "Pant", slug: "pant", category: "western", groups: ["group-lower"], wasSlug: "trouser" },
  { name: "Kurta", slug: "kurta", category: "mens_ethnic", groups: ["group-upper"] },
  { name: "Coat", slug: "coat", category: "western", groups: ["group-upper"], wasSlug: "suit-blazer" },
  /* A suit is coat and trousers, so these three carry all nineteen numbers. */
  { name: "Tuxedo Suit", slug: "tuxedo-suit", category: "western", groups: ["group-upper", "group-lower"] },
  { name: "3pcs Suit", slug: "suit-3pcs", category: "western", groups: ["group-upper", "group-lower"] },
  { name: "2pcs Suit", slug: "suit-2pcs", category: "western", groups: ["group-upper", "group-lower"] },
  { name: "W-Coat", slug: "w-coat", category: "western", groups: ["group-upper"], wasSlug: "waistcoat" },
  { name: "Bandi", slug: "bandi", category: "mens_ethnic", groups: ["group-upper"] },
  { name: "Bandhgala", slug: "bandhgala", category: "mens_ethnic", groups: ["group-upper"] },
  { name: "Sherwani", slug: "sherwani", category: "mens_ethnic", groups: ["group-upper"] },
  { name: "Indowestern", slug: "indowestern", category: "mens_ethnic", groups: ["group-upper"] },
  { name: "Shorts", slug: "shorts", category: "western", groups: ["group-lower"] },
  { name: "Dhoti", slug: "dhoti", category: "mens_ethnic", groups: ["group-lower"] },
  { name: "Chudi Pant", slug: "chudi-pant", category: "womens_ethnic", groups: ["group-lower"] },
  /* The safari suit: bush shirt and trousers, so both halves of the body.
     If he bills the shirt on its own, drop group-lower here. */
  { name: "Safari", slug: "safari", category: "western", groups: ["group-upper", "group-lower"] },

  /* ── sold with the garment, never measured ───────────────────────────────
   *
   * The things written beside the amount that are not stitching: a client
   * takes the suit and a tie, or the sherwani and a safa, and both belong on
   * one bill. No groups, so nothing ever asks to measure them.
   *
   * Every one is priced at 0 until he sets his own rate. A number invented
   * here is a number printed on a client's bill.
   *
   * Hide whatever the studio does not stock - Shop setup, What we stitch, one
   * toggle each. Hidden, never deleted, so a tie sold last year stays on last
   * year's order. */
  { name: "Tie", slug: "tie", category: "accessory", groups: [] },
  { name: "Bow", slug: "bow", category: "accessory", groups: [] },
  { name: "Pocket Square", slug: "pocket-square", category: "accessory", groups: [] },
  { name: "Cufflinks", slug: "cufflinks", category: "accessory", groups: [] },
  { name: "Brooch", slug: "brooch", category: "accessory", groups: [] },
  { name: "Lapel Pin", slug: "lapel-pin", category: "accessory", groups: [] },
  /* The sash at the waist of a tuxedo or a sherwani. */
  { name: "Kamarbandh", slug: "kamarbandh", category: "accessory", groups: [] },
  { name: "Safa", slug: "safa", category: "accessory", groups: [] },
  { name: "Stole", slug: "stole", category: "accessory", groups: [] },
  { name: "Shawl", slug: "shawl", category: "accessory", groups: [] },
  { name: "Dupatta", slug: "dupatta", category: "accessory", groups: [] },
  /* Contrast buttons and kurta studs, charged by the set. */
  { name: "Buttons", slug: "buttons", category: "accessory", groups: [] },
  /* The one across a bandhgala. */
  { name: "Chain", slug: "chain", category: "accessory", groups: [] },
  { name: "Belt", slug: "belt", category: "accessory", groups: [] },
  { name: "Suspenders", slug: "suspenders", category: "accessory", groups: [] },
];

/* Invented during the first build and not on his sheet. HIDDEN, never
   deleted: orders already placed keep their own copy of everything, and one
   toggle in Settings -> Garment types brings any of them back. His sheet is a
   men's form, so if the studio also takes bridal work these are the rows to
   re-enable rather than recreate. */
const RETIRE_SLUGS = ["blouse", "lehenga", "anarkali-kameez"];

/* Prints in the letterhead on all three copies. Editable in Settings. */
const SHOP_SETTINGS: Record<string, string> = {
  shop_name: "ARSU",
  shop_tagline: "Bespoke studio",
  shop_address:
    '"Suprabatha", No. 13, 1st Cross, 1st Main,\nNagashetty Halli, RMV 2nd Stage,\nBangalore 560094',
  shop_phone: "+91 80508 00582",
  shop_store_phone: "080 4205 3779",
  shop_email: "arsubespokestudio@gmail.com",
  shop_instagram: "@arsubespokestudio",
  bill_footer: "Thank you. Please bring this receipt when collecting.",
  /* The terms along the bottom of his own sheet, in his wording. */
  shop_terms:
    "Kindly collect your outfits before 8.30pm.\n" +
    "Kindly collect your outfits within 30 days from the delivery date.\n" +
    "Store time - Mon-Sat: 10am to 8.30pm  |  Sunday: 10am to 4pm",
};

/** Insert whichever of these fields the owner does not have yet. */
function seedFields(ownerId: number, fields: FieldSeed[]): number {
  let added = 0;
  for (const [index, field] of fields.entries()) {
    const existing = db
      .select({ id: measurementFields.id })
      .from(measurementFields)
      .where(
        and(
          eq(measurementFields.garmentTypeId, ownerId),
          eq(measurementFields.code, field.code),
        ),
      )
      .get();
    if (existing) continue;

    db.insert(measurementFields)
      .values({
        garmentTypeId: ownerId,
        label: field.label,
        code: field.code,
        hint: field.hint ?? null,
        unit: field.unit ?? "in",
        fieldType: field.type ?? "number",
        choices: field.choices ? JSON.stringify(field.choices) : null,
        groupName: field.group ?? "Measurements",
        sortOrder: index * 10,
      })
      .run();
    added += 1;
  }
  return added;
}

export async function seed() {
  let addedTypes = 0;
  let addedFields = 0;
  let addedLinks = 0;
  let retired = 0;

  /* 1. The groups. They never appear on an order, and a negative sort order
        keeps them at the top of the Garment types screen where they belong. */
  const groupIdBySlug = new Map<string, number>();
  for (const [index, group] of GROUPS.entries()) {
    let row = db
      .select()
      .from(garmentTypes)
      .where(eq(garmentTypes.slug, group.slug))
      .get();

    if (!row) {
      row = db
        .insert(garmentTypes)
        .values({
          name: group.name,
          slug: group.slug,
          category: "other",
          isTemplate: true,
          sortOrder: -100 + index,
        })
        .returning()
        .get();
      addedTypes += 1;
    } else if (!row.isTemplate) {
      db.update(garmentTypes)
        .set({ isTemplate: true })
        .where(eq(garmentTypes.id, row.id))
        .run();
    }

    groupIdBySlug.set(group.slug, row.id);
    addedFields += seedFields(row.id, group.fields);
  }

  /* 2. The garments, and which groups each one draws from. */
  for (const [index, garment] of GARMENTS.entries()) {
    let row = db
      .select()
      .from(garmentTypes)
      .where(eq(garmentTypes.slug, garment.slug))
      .get();

    if (!row && garment.wasSlug) {
      /* Adopt the older row rather than create a second one for the same
         garment. Orders keep their own garment_label, so renaming here cannot
         alter a bill already printed. */
      const old = db
        .select()
        .from(garmentTypes)
        .where(eq(garmentTypes.slug, garment.wasSlug))
        .get();
      if (old) {
        db.update(garmentTypes)
          .set({ slug: garment.slug, name: garment.name })
          .where(eq(garmentTypes.id, old.id))
          .run();
        row = { ...old, slug: garment.slug, name: garment.name };
      }
    }

    if (!row) {
      row = db
        .insert(garmentTypes)
        .values({
          name: garment.name,
          slug: garment.slug,
          category: garment.category,
          sortOrder: index * 10,
        })
        .returning()
        .get();
      addedTypes += 1;
    }

    for (const [groupIndex, groupSlug] of garment.groups.entries()) {
      const groupId = groupIdBySlug.get(groupSlug);
      if (groupId === undefined) continue;

      const linked = db
        .select({ id: garmentTypeGroups.id })
        .from(garmentTypeGroups)
        .where(
          and(
            eq(garmentTypeGroups.garmentTypeId, row.id),
            eq(garmentTypeGroups.groupId, groupId),
          ),
        )
        .get();
      if (linked) continue;

      db.insert(garmentTypeGroups)
        .values({
          garmentTypeId: row.id,
          groupId,
          sortOrder: groupIndex * 10,
        })
        .run();
      addedLinks += 1;
    }

    if (garment.fields) addedFields += seedFields(row.id, garment.fields);
  }

  /* 3. Remove the invented per-garment fields a group now covers.
   *
   * A Shirt was seeded with twelve invented fields. Now that it inherits
   * Arsu's real eleven from the Upper body group, leaving both would show him
   * TWENTY-FOUR boxes to fill - worse than before groups existed, and the
   * exact opposite of the point.
   *
   * Only fields holding NO client measurement are removed, so nothing anyone
   * actually wrote down can be lost. A field with data stays, and appears as
   * an extra on that garment until he deletes it himself.
   *
   * Orders already placed are untouched: order_item_measurements keeps its own
   * copy of every label, unit and value, and its field_id is nullable with ON
   * DELETE SET NULL precisely so removing a field can never blank a
   * measurement something was cut to. Rule 1 in schema.ts earning its keep.
   *
   * This runs here rather than as a migration because it has to happen AFTER
   * the groups above are linked - a migration runs before any of this exists
   * and would match nothing. */
  const removedFields = db.run(sql`
    DELETE FROM measurement_fields
     WHERE garment_type_id IN (SELECT garment_type_id FROM garment_type_groups)
       AND code NOT LIKE 'up!_%' ESCAPE '!'
       AND code NOT LIKE 'lo!_%' ESCAPE '!'
       AND NOT EXISTS (
         SELECT 1 FROM measurement_values v WHERE v.field_id = measurement_fields.id
       )
  `).changes;

  /* 4. Hide what was invented rather than observed. Hidden, not deleted. */
  const stale = db
    .select({ id: garmentTypes.id })
    .from(garmentTypes)
    .where(
      and(
        inArray(garmentTypes.slug, RETIRE_SLUGS),
        eq(garmentTypes.isActive, true),
      ),
    )
    .all();
  for (const row of stale) {
    db.update(garmentTypes)
      .set({ isActive: false })
      .where(eq(garmentTypes.id, row.id))
      .run();
    retired += 1;
  }

  let addedSettings = 0;
  for (const [key, value] of Object.entries(SHOP_SETTINGS)) {
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) continue;
    db.insert(settings).values({ key, value }).run();
    addedSettings += 1;
  }

  /* Correcting one value I seeded wrongly, and ONLY where it is still exactly
     what I seeded.

     Settings are added and never overwritten, which is right: they are his to
     set, and a reseed must not undo an evening spent getting the address
     onto the letterhead. But that also means a bad default I shipped stays
     bad forever on a laptop that was set up before I fixed it - his tagline
     printed "Ethnic & Western Bespoke Studio" across all three copies while
     this machine showed the shorter one, because only this one had been
     seeded since.

     Matching on the exact old string is what makes this safe: a tagline he
     has typed himself does not match, so it is not touched. */
  let correctedSettings = 0;
  const STALE_DEFAULTS: Record<string, string> = {
    shop_tagline: "Ethnic & Western Bespoke Studio",
  };
  for (const [key, stale] of Object.entries(STALE_DEFAULTS)) {
    const wanted = SHOP_SETTINGS[key];
    if (wanted === undefined || wanted === stale) continue;
    const changed = db
      .update(settings)
      .set({ value: wanted })
      .where(and(eq(settings.key, key), eq(settings.value, stale)))
      .run().changes;
    correctedSettings += changed;
  }

  const totalTypes = db.select().from(garmentTypes).all().length;
  const totalFields = db.select().from(measurementFields).all().length;

  console.log(
    `Seed complete.\n` +
      `  garment types : ${totalTypes} total (${addedTypes} added this run)\n` +
      `  fields        : ${totalFields} total (${addedFields} added this run)\n` +
      `  group links   : ${addedLinks} added this run\n` +
      `  fields dropped: ${removedFields} invented one(s) a group now covers\n` +
      `  retired       : ${retired} hidden this run\n` +
      `  settings      : ${addedSettings} added, ${correctedSettings} stale default(s) corrected`,
  );
}

/* Run when invoked directly (`npm run db:seed`), stay quiet when imported.
   scripts/db-setup.ts imports seed() rather than spawning it: on Windows,
   spawning npx.cmd fails outright with EINVAL, because Node refuses to execute
   .cmd files without a shell. Importing sidesteps the whole problem. */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
