/* The importable client fields.
 *
 * These live outside app/actions/import.ts because a "use server" file may
 * only export async functions — exporting this array from there compiled
 * cleanly and then threw at runtime the first time the module was evaluated,
 * with "A 'use server' file can only export async functions, found object."
 * Types are fine there (they are erased); values are not. */

export type ImportField =
  | "name"
  | "phone"
  | "altPhone"
  | "address"
  | "email"
  | "notes";

export const IMPORT_FIELDS: {
  key: ImportField;
  label: string;
  required?: boolean;
}[] = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "altPhone", label: "Alternate phone" },
  { key: "address", label: "Address" },
  { key: "email", label: "Email" },
  { key: "notes", label: "Notes" },
];

/* Header spellings seen in the wild. Matched after normalisation, so
   "Client Name", "client_name" and "NAME" all land on the same field. */
export const HEADER_GUESSES: Record<ImportField, string[]> = {
  name: ["name", "clientname", "customername", "client", "customer", "partyname"],
  phone: ["phone", "mobile", "phoneno", "mobileno", "contact", "contactno", "number"],
  altPhone: ["altphone", "alternatephone", "phone2", "mobile2", "otherphone"],
  address: ["address", "addr", "location", "residence"],
  email: ["email", "emailid", "mail"],
  notes: ["notes", "note", "remarks", "remark", "comments", "description"],
};
