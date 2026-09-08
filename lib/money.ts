/* Money is integer paise everywhere in this app. It is converted to rupees at
 * the edges only — once on the way in from a form, once on the way out to a
 * screen or a bill. Nothing in between ever holds a float, because 0.1 + 0.2
 * is how a shop ends up with a bill that disagrees with its own line items. */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const INR_PLAIN = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** '1,200.50', '₹1200', ' 1200 ' -> 120050. Returns null if unparseable. */
export function parseRupeesToPaise(input: string | number | null | undefined) {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/[₹,\s]/g, "").trim();
  if (raw === "") return null;
  if (!/^-?\d*\.?\d*$/.test(raw)) return null;

  const negative = raw.startsWith("-");
  const [rupees = "0", frac = ""] = raw.replace("-", "").split(".");

  /* Build paise from the digits rather than multiplying a float by 100:
     Math.round(19.99 * 100) is right, but 1.005 * 100 is 100.49999999999999
     and rounds the wrong way. Digit arithmetic has no such failure. */
  const paisePart = Number((frac + "00").slice(0, 2));
  const total = Number(rupees || "0") * 100 + (Number.isNaN(paisePart) ? 0 : paisePart);
  if (!Number.isFinite(total)) return null;
  return negative ? -total : total;
}

/** 120050 -> '₹1,200.50'. Whole rupees print without the .00 tail. */
export function formatPaise(paise: number) {
  return INR.format(paise / 100);
}

/** 120050 -> '1,200.50'. For bills, where the ₹ sits in the column header. */
export function formatPaisePlain(paise: number) {
  return INR_PLAIN.format(paise / 100);
}

/** 120050 -> '1200.50', for populating a form field from stored data. */
export function paiseToInput(paise: number) {
  if (paise % 100 === 0) return String(paise / 100);
  return (paise / 100).toFixed(2);
}
