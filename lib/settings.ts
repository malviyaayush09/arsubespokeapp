import { db } from "@/db";
import { settings } from "@/db/schema";

export type Shop = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  instagram: string;
  billFooter: string;
};

const FALLBACK: Shop = {
  name: "ARSU",
  tagline: "Ethnic & Western Bespoke Studio",
  address: "",
  phone: "",
  instagram: "",
  billFooter: "",
};

export function getSettingsMap(): Record<string, string> {
  return Object.fromEntries(
    db.select().from(settings).all().map((row) => [row.key, row.value]),
  );
}

/** The letterhead. Falls back to the studio name so a bill is never nameless. */
export function getShop(): Shop {
  const map = getSettingsMap();
  return {
    name: map.shop_name || FALLBACK.name,
    tagline: map.shop_tagline ?? FALLBACK.tagline,
    address: map.shop_address ?? FALLBACK.address,
    phone: map.shop_phone ?? FALLBACK.phone,
    instagram: map.shop_instagram ?? FALLBACK.instagram,
    billFooter: map.bill_footer ?? FALLBACK.billFooter,
  };
}

/* Re-exported for server callers. Client components must import them from
   lib/settings-fields directly — this module reaches the database. */
export { SETTING_KEYS, SETTING_LABELS } from "./settings-fields";
