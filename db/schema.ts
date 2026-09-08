/* Arsu Atelier — schema.
 *
 * Two rules govern everything below.
 *
 * 1. MEASUREMENTS ON AN ORDER ARE A SNAPSHOT, NOT A REFERENCE.
 *    `measurement_sets` holds what a client measures *today*. When an order is
 *    built, the numbers are COPIED into `order_item_measurements` along with
 *    their label and unit. Re-measure the client next year and every past
 *    order still shows what was actually cut. A foreign key here would
 *    silently rewrite the history of every garment ever made for them.
 *
 * 2. MONEY IS INTEGER PAISE. Never a float, anywhere, ever. Totals are always
 *    computed from the parts (see lib/orders.ts) and never stored, so a bill
 *    can never disagree with the lines it is made of.
 *
 * Calendar dates (order date, delivery date, date measured) are TEXT
 * 'YYYY-MM-DD'. They are days in the shop's life, not instants, and storing
 * them as timestamps drags timezone drift into a tailor's delivery date.
 * Audit timestamps, which *are* instants, are integer epoch ms.
 */
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const ORDER_STATUSES = [
  "placed",
  "cutting",
  "stitching",
  "trial",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The line a garment actually moves along. `cancelled` sits off to the side. */
export const STATUS_FLOW: OrderStatus[] = [
  "placed",
  "cutting",
  "stitching",
  "trial",
  "ready",
  "delivered",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Order Placed",
  cutting: "Cutting",
  stitching: "Stitching",
  trial: "Trial",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const GARMENT_CATEGORIES = [
  "western",
  "mens_ethnic",
  "womens_ethnic",
  "other",
] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  western: "Western",
  mens_ethnic: "Men's Ethnic",
  womens_ethnic: "Women's Ethnic",
  other: "Other",
};

export const FIELD_TYPES = ["number", "text", "choice"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const PAYMENT_METHODS = ["cash", "upi", "card", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank: "Bank transfer",
  other: "Other",
};

export const FABRIC_SOURCES = ["shop", "client"] as const;
export type FabricSource = (typeof FABRIC_SOURCES)[number];

/* ── clients ──────────────────────────────────────────────────────────── */

export const clients = sqliteTable(
  "clients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /* Deliberately not unique: families share a number, and a duplicate is
       better than a blocked save with a client standing at the counter. The
       new-client form warns on a match instead of refusing it. */
    phone: text("phone").notNull(),
    altPhone: text("alt_phone"),
    address: text("address"),
    email: text("email"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("clients_phone_idx").on(t.phone),
    index("clients_name_idx").on(t.name),
  ],
);

/* ── configurable garment schema ──────────────────────────────────────── */

export const garmentTypes = sqliteTable(
  "garment_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category", { enum: GARMENT_CATEGORIES })
      .notNull()
      .default("other"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /* House rates, copied onto a new order line so they are not retyped every
       time. Copied, not referenced — raising the shirt rate next year must not
       silently reprice a bill from last year. */
    defaultStitchingPaise: integer("default_stitching_paise").notNull().default(0),
    defaultFabricPaise: integer("default_fabric_paise").notNull().default(0),
  },
  (t) => [uniqueIndex("garment_types_slug_idx").on(t.slug)],
);

/** The karigars. Who is cutting and stitching what. */
export const tailors = sqliteTable(
  "tailors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    phone: text("phone"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("tailors_active_idx").on(t.isActive)],
);

export const measurementFields = sqliteTable(
  "measurement_fields",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    garmentTypeId: integer("garment_type_id")
      .notNull()
      .references(() => garmentTypes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /* Stable machine name. Snapshots keep their own copy of the label, so
       renaming one later never disturbs an order already printed. */
    code: text("code").notNull(),
    hint: text("hint"),
    unit: text("unit").notNull().default("in"),
    fieldType: text("field_type", { enum: FIELD_TYPES })
      .notNull()
      .default("number"),
    /** JSON array of strings. Only read when fieldType === 'choice'. */
    choices: text("choices"),
    isRequired: integer("is_required", { mode: "boolean" })
      .notNull()
      .default(false),
    groupName: text("group_name"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("measurement_fields_code_idx").on(t.garmentTypeId, t.code),
  ],
);

/* ── the client's own measurement history ─────────────────────────────── */

export const measurementSets = sqliteTable(
  "measurement_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    garmentTypeId: integer("garment_type_id")
      .notNull()
      .references(() => garmentTypes.id, { onDelete: "restrict" }),
    /** 'YYYY-MM-DD'. The latest set for a garment type wins — there is no
        is_current flag, because a flag is one more thing to fall out of sync. */
    takenOn: text("taken_on").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("measurement_sets_lookup_idx").on(
      t.clientId,
      t.garmentTypeId,
      t.takenOn,
    ),
  ],
);

export const measurementValues = sqliteTable(
  "measurement_values",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    setId: integer("set_id")
      .notNull()
      .references(() => measurementSets.id, { onDelete: "cascade" }),
    fieldId: integer("field_id")
      .notNull()
      .references(() => measurementFields.id, { onDelete: "cascade" }),
    /* Kept exactly as written — a tailor writes 15½ and that is the record.
       valueNum is the parsed form, for validation and change-over-time. */
    valueText: text("value_text").notNull(),
    valueNum: real("value_num"),
  },
  (t) => [uniqueIndex("measurement_values_unique_idx").on(t.setId, t.fieldId)],
);

/* ── orders ───────────────────────────────────────────────────────────── */

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Human-facing bill number, e.g. '26-0147'. Also the invoice number: the
        order IS the invoice, so money has exactly one source of truth. */
    orderNo: text("order_no").notNull(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    orderDate: text("order_date").notNull(),
    promisedDate: text("promised_date"),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("placed"),
    discountPaise: integer("discount_paise").notNull().default(0),
    /** Shop-only. Never rendered on the client copy. */
    internalNotes: text("internal_notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("orders_no_idx").on(t.orderNo),
    index("orders_client_idx").on(t.clientId),
    index("orders_status_idx").on(t.status),
    index("orders_promised_idx").on(t.promisedDate),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    garmentTypeId: integer("garment_type_id").references(
      () => garmentTypes.id,
      { onDelete: "set null" },
    ),
    /** Snapshot of the garment name, so a retired garment type still prints. */
    garmentLabel: text("garment_label").notNull(),
    /* Who is making this one. SET NULL rather than cascade: a karigar leaving
       must not take the garment record with him. */
    tailorId: integer("tailor_id").references(() => tailors.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull().default(1),
    fabricSource: text("fabric_source", { enum: FABRIC_SOURCES })
      .notNull()
      .default("client"),
    fabricNotes: text("fabric_notes"),
    itemNotes: text("item_notes"),
    /** Per-garment rates. Line total = (stitching + fabric) x quantity. */
    stitchingRatePaise: integer("stitching_rate_paise").notNull().default(0),
    fabricRatePaise: integer("fabric_rate_paise").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** The frozen cutting card. See rule 1 at the top of this file. */
export const orderItemMeasurements = sqliteTable(
  "order_item_measurements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    /* Nullable, ON DELETE SET NULL on purpose: removing a field from a garment
       type must never blank a measurement something was already cut to. The
       label and unit stored here are what actually print. */
    fieldId: integer("field_id").references(() => measurementFields.id, {
      onDelete: "set null",
    }),
    fieldCode: text("field_code").notNull(),
    fieldLabel: text("field_label").notNull(),
    unit: text("unit").notNull().default("in"),
    valueText: text("value_text").notNull(),
    valueNum: real("value_num"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_item_measurements_item_idx").on(t.orderItemId)],
);

/** Named extras — 'Express delivery', 'Extra buttons', 'Alteration'. */
export const orderCharges = sqliteTable(
  "order_charges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountPaise: integer("amount_paise").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_charges_order_idx").on(t.orderId)],
);

/** Advance, balance, and anything in between. Paid = SUM(amountPaise). */
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    amountPaise: integer("amount_paise").notNull(),
    paidOn: text("paid_on").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull().default("cash"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

export const orderStatusEvents = sqliteTable(
  "order_status_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: ORDER_STATUSES }),
    toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
    changedAt: integer("changed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    note: text("note"),
  },
  (t) => [index("order_status_events_order_idx").on(t.orderId)],
);

/** Shop name, address, phone — whatever prints in the letterhead. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Client = typeof clients.$inferSelect;
export type Tailor = typeof tailors.$inferSelect;
export type GarmentType = typeof garmentTypes.$inferSelect;
export type MeasurementField = typeof measurementFields.$inferSelect;
export type MeasurementSet = typeof measurementSets.$inferSelect;
export type MeasurementValue = typeof measurementValues.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderItemMeasurement = typeof orderItemMeasurements.$inferSelect;
export type OrderCharge = typeof orderCharges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type OrderStatusEvent = typeof orderStatusEvents.$inferSelect;
