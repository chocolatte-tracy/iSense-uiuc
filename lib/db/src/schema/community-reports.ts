import { pgTable, text, doublePrecision, timestamp, integer, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const communityReportsTable = pgTable("community_reports", {
  id: text("id").primaryKey(),
  locationName: text("location_name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  noise: text("noise").notNull(),
  crowds: text("crowds").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("community_reports_observed_idx").on(table.observedAt)]);
export const insertCommunityReportSchema = createInsertSchema(communityReportsTable).omit({ id: true, createdAt: true });
export type CommunityReportRow = typeof communityReportsTable.$inferSelect;
export type InsertCommunityReport = typeof communityReportsTable.$inferInsert;

// Only short-lived HMAC bucket keys; no raw addresses, identities or location history.
export const communityReportLimitsTable = pgTable("community_report_limits", {
  id: text("id").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  requests: integer("requests").notNull().default(0),
});
