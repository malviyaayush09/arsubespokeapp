/* Seed: garment types, their measurement fields, and the shop letterhead.
 *
 * Idempotent — safe to re-run. Garment types match on slug, fields on
 * (garment type, code). Re-running adds anything new and leaves edits Arsu
 * has made through the Garment Types screen alone.
 *
 * The terminology here is a starting point. Every label, field and garment
 * type below is editable in the app without touching this file; this is just
 * what the shop starts with on day one.
 */
import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import {
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
  group?: string;
};

type GarmentSeed = {
  name: string;
  slug: string;
  category: GarmentCategory;
  fields: FieldSeed[];
};

/** Style choices are not measurements: no unit, and free of the number parser. */
const choice = (label: string, code: string, choices: string[]): FieldSeed => ({
  label,
  code,
  choices,
  type: "choice",
  unit: "",
  group: "Style",
});

const GARMENTS: GarmentSeed[] = [
  {
    name: "Shirt",
    slug: "shirt",
    category: "western",
    fields: [
      { label: "Length", code: "length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Chest", code: "chest" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Bicep", code: "bicep" },
      { label: "Cuff", code: "cuff" },
      { label: "Collar", code: "collar" },
      choice("Sleeve", "sleeve_style", ["Full", "Half"]),
      choice("Cuff style", "cuff_style", ["Button", "French", "Double"]),
      choice("Pocket", "pocket", ["None", "Single", "Double"]),
    ],
  },
  {
    name: "Trouser",
    slug: "trouser",
    category: "western",
    fields: [
      { label: "Length", code: "length", hint: "Outseam, waist to hem" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Thigh", code: "thigh" },
      { label: "Knee", code: "knee" },
      { label: "Bottom", code: "bottom" },
      { label: "Inseam", code: "inseam" },
      { label: "Rise", code: "rise", hint: "Crotch depth" },
      { label: "Fly", code: "fly" },
      choice("Pleats", "pleats", ["Flat front", "Single", "Double"]),
      choice("Cuff / turn-up", "turn_up", ["No", "Yes"]),
    ],
  },
  {
    name: "Suit / Blazer",
    slug: "suit-blazer",
    category: "western",
    fields: [
      { label: "Coat Length", code: "coat_length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Chest", code: "chest" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Bicep", code: "bicep" },
      { label: "Cuff", code: "cuff" },
      { label: "Back Width", code: "back_width" },
      { label: "Front Width", code: "front_width" },
      { label: "Neck", code: "neck" },
      choice("Vent", "vent", ["None", "Single", "Double"]),
      choice("Buttons", "buttons", ["1", "2", "3"]),
      choice("Lapel", "lapel", ["Notch", "Peak", "Shawl"]),
    ],
  },
  {
    name: "Waistcoat",
    slug: "waistcoat",
    category: "western",
    fields: [
      { label: "Length", code: "length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Chest", code: "chest" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Front Width", code: "front_width" },
      { label: "Back Width", code: "back_width" },
      { label: "Neck Depth", code: "neck_depth" },
      choice("Buttons", "buttons", ["4", "5", "6"]),
      choice("Back", "back_style", ["Same cloth", "Lining", "Adjuster"]),
    ],
  },
  {
    name: "Kurta",
    slug: "kurta",
    category: "mens_ethnic",
    fields: [
      { label: "Length", code: "length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Chest", code: "chest" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Bicep", code: "bicep" },
      { label: "Cuff", code: "cuff" },
      { label: "Neck", code: "neck" },
      { label: "Slit Length", code: "slit_length" },
      choice("Collar", "collar_style", ["Band", "Mandarin", "Round", "V-neck"]),
    ],
  },
  {
    name: "Bandhgala",
    slug: "bandhgala",
    category: "mens_ethnic",
    fields: [
      { label: "Length", code: "length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Chest", code: "chest" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Bicep", code: "bicep" },
      { label: "Cuff", code: "cuff" },
      { label: "Collar Height", code: "collar_height" },
      { label: "Back Width", code: "back_width" },
      { label: "Front Width", code: "front_width" },
      choice("Vent", "vent", ["None", "Single", "Double"]),
      choice("Buttons", "buttons", ["4", "5", "6"]),
    ],
  },
  {
    name: "Sherwani",
    slug: "sherwani",
    category: "mens_ethnic",
    fields: [
      { label: "Length", code: "length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Chest", code: "chest" },
      { label: "Waist", code: "waist" },
      { label: "Seat", code: "seat" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Bicep", code: "bicep" },
      { label: "Cuff", code: "cuff" },
      { label: "Collar Height", code: "collar_height" },
      { label: "Back Width", code: "back_width" },
      { label: "Front Width", code: "front_width" },
      { label: "Slit Length", code: "slit_length" },
      { label: "Flare", code: "flare", hint: "Sweep at the hem" },
    ],
  },
  {
    name: "Blouse",
    slug: "blouse",
    category: "womens_ethnic",
    fields: [
      { label: "Blouse Length", code: "blouse_length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Upper Chest", code: "upper_chest" },
      { label: "Bust", code: "bust" },
      { label: "Waist", code: "waist" },
      { label: "Armhole", code: "armhole" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Around Arm", code: "around_arm" },
      { label: "Front Neck Depth", code: "front_neck_depth" },
      { label: "Back Neck Depth", code: "back_neck_depth" },
      { label: "Cross Front", code: "cross_front" },
      { label: "Cross Back", code: "cross_back" },
      { label: "Apex to Apex", code: "apex_to_apex" },
      { label: "Shoulder to Apex", code: "shoulder_to_apex" },
      choice("Closing", "closing", ["Back hook", "Front hook", "Zip", "Dori"]),
      choice("Padding", "padding", ["No", "Yes"]),
    ],
  },
  {
    name: "Lehenga",
    slug: "lehenga",
    category: "womens_ethnic",
    fields: [
      { label: "Length", code: "length", hint: "Waist to floor" },
      { label: "Waist", code: "waist" },
      { label: "Hip", code: "hip" },
      { label: "Ghera", code: "ghera", hint: "Flare / sweep at the hem" },
      { label: "Waistband Height", code: "waistband_height" },
      { label: "Kali count", code: "kali_count", unit: "", type: "number" },
      choice("Closing", "closing", ["Side zip", "Back zip", "Dori", "Elastic"]),
      choice("Can-can", "can_can", ["No", "Yes"]),
    ],
  },
  {
    name: "Anarkali / Kameez",
    slug: "anarkali-kameez",
    category: "womens_ethnic",
    fields: [
      { label: "Length", code: "length" },
      { label: "Shoulder", code: "shoulder" },
      { label: "Bust", code: "bust" },
      { label: "Waist", code: "waist" },
      { label: "Hip", code: "hip" },
      { label: "Yoke Length", code: "yoke_length" },
      { label: "Sleeve Length", code: "sleeve_length" },
      { label: "Around Arm", code: "around_arm" },
      { label: "Armhole", code: "armhole" },
      { label: "Front Neck Depth", code: "front_neck_depth" },
      { label: "Back Neck Depth", code: "back_neck_depth" },
      { label: "Ghera", code: "ghera", hint: "Flare / sweep at the hem" },
      choice("Closing", "closing", ["Side zip", "Back zip", "Front open"]),
    ],
  },
];

/* Prints in the letterhead on all three copies. Editable in Settings. */
const SHOP_SETTINGS: Record<string, string> = {
  shop_name: "ARSU",
  shop_tagline: "Ethnic & Western Bespoke Studio",
  shop_address:
    '"Suprabatha", No. 13, 1st Cross, 1st Main,\nNagashetty Halli, RMV 2nd Stage,\nBangalore 560094',
  shop_phone: "+91 80508 00582",
  shop_instagram: "@arsubespokestudio",
  bill_footer: "Thank you. Please bring this receipt when collecting.",
};

export async function seed() {
  let addedTypes = 0;
  let addedFields = 0;

  for (const [index, garment] of GARMENTS.entries()) {
    let row = db
      .select()
      .from(garmentTypes)
      .where(eq(garmentTypes.slug, garment.slug))
      .get();

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

    for (const [fieldIndex, field] of garment.fields.entries()) {
      const existing = db
        .select({ id: measurementFields.id })
        .from(measurementFields)
        .where(
          and(
            eq(measurementFields.garmentTypeId, row.id),
            eq(measurementFields.code, field.code),
          ),
        )
        .get();
      if (existing) continue;

      db.insert(measurementFields)
        .values({
          garmentTypeId: row.id,
          label: field.label,
          code: field.code,
          hint: field.hint ?? null,
          unit: field.unit ?? "in",
          fieldType: field.type ?? "number",
          choices: field.choices ? JSON.stringify(field.choices) : null,
          groupName: field.group ?? "Measurements",
          sortOrder: fieldIndex * 10,
        })
        .run();
      addedFields += 1;
    }
  }

  let addedSettings = 0;
  for (const [key, value] of Object.entries(SHOP_SETTINGS)) {
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) continue;
    db.insert(settings).values({ key, value }).run();
    addedSettings += 1;
  }

  const totalTypes = db.select().from(garmentTypes).all().length;
  const totalFields = db.select().from(measurementFields).all().length;

  console.log(
    `Seed complete.\n` +
      `  garment types : ${totalTypes} total (${addedTypes} added this run)\n` +
      `  fields        : ${totalFields} total (${addedFields} added this run)\n` +
      `  settings      : ${addedSettings} added this run`,
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
