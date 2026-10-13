/* Pure constants, deliberately in their own module.
 *
 * lib/settings.ts reads the database, so anything importing it drags
 * better-sqlite3 along. The settings FORM is a client component and only needs
 * these names — importing them from lib/settings.ts pulled a native Node module
 * into the browser bundle and broke the build. Keep this file free of any
 * import that touches the database. */

export const SETTING_KEYS = [
  "shop_name",
  "shop_tagline",
  "shop_address",
  "shop_phone",
  "shop_store_phone",
  "shop_email",
  "shop_instagram",
  "bill_footer",
  "shop_terms",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_LABELS: Record<SettingKey, string> = {
  shop_name: "Shop name",
  shop_tagline: "Tagline",
  shop_address: "Address",
  shop_phone: "Mobile",
  shop_store_phone: "Store number",
  shop_email: "Email",
  shop_instagram: "Instagram",
  bill_footer: "Bill footer note",
  shop_terms: "Terms printed at the foot of every copy",
};
