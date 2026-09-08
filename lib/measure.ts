/* A tailor writes 15½, not 15.5. The app stores both: the text exactly as it
 * was written (that is the record, and it is what prints on the cutting card)
 * and a parsed number used for validation and for showing how a client has
 * changed between visits. If we can't parse it, the text still saves — a
 * measurement the app doesn't understand is not a measurement worth losing. */

const VULGAR: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
};

export type ParsedMeasurement = { text: string; num: number | null };

/**
 * Accepts 15, 15.5, 15 1/2, 15-1/2, 15½, 15 ½, 1/2, ½, with or without a
 * trailing " or cm. Returns the tidied text plus the numeric value.
 */
export function parseMeasurement(input: string): ParsedMeasurement {
  const text = input.trim().replace(/\s+/g, " ");
  if (text === "") return { text: "", num: null };

  /* Strip a trailing unit mark so 34" and 34 parse the same. */
  const body = text.replace(/["”′″]|\b(in|inch|inches|cm)\b\.?$/gi, "").trim();

  // 15½  /  15 ½  /  ½
  const vulgarMatch = body.match(/^(-?\d+)?\s*([¼½¾⅛⅜⅝⅞⅓⅔])$/);
  if (vulgarMatch) {
    const whole = vulgarMatch[1] ? Number(vulgarMatch[1]) : 0;
    const frac = VULGAR[vulgarMatch[2]];
    return { text, num: whole < 0 ? whole - frac : whole + frac };
  }

  // 15 1/2  /  15-1/2  /  1/2
  const fracMatch = body.match(/^(-?\d+)?\s*[-\s]?\s*(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const denominator = Number(fracMatch[3]);
    if (denominator !== 0) {
      const whole = fracMatch[1] ? Number(fracMatch[1]) : 0;
      const frac = Number(fracMatch[2]) / denominator;
      return { text, num: whole < 0 ? whole - frac : whole + frac };
    }
  }

  // 15  /  15.5
  if (/^-?\d*\.?\d+$/.test(body)) return { text, num: Number(body) };

  /* Anything else — 'same as last time', 'loose fit' — is kept verbatim with
     no number. Free-text fields land here by design. */
  return { text, num: null };
}

/** 15.5 -> '15½'. Used for the change-over-time view, never for storage. */
export function formatMeasurement(num: number) {
  const whole = Math.trunc(num);
  const frac = Math.abs(num - whole);
  const mark = Object.entries(VULGAR).find(
    ([, value]) => Math.abs(value - frac) < 0.001,
  );
  if (!mark) return String(Number(num.toFixed(3)));
  if (whole === 0) return (num < 0 ? "-" : "") + mark[0];
  return `${whole}${mark[0]}`;
}

/** Signed difference between two measurement sets, for the history view. */
export function describeDelta(from: number, to: number) {
  const delta = to - from;
  if (Math.abs(delta) < 0.001) return null;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatMeasurement(Math.abs(delta))}`;
}
