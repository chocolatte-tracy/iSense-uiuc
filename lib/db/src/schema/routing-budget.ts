import { pgTable, text, integer, bigint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// One shared ledger for every team member and server instance.
export const routingBudgetTable = pgTable("routing_budget", {
  id: text("id").primaryKey(),
  totalRequests: integer("total_requests").notNull().default(0),
  reservedCents: bigint("reserved_cents", { mode: "number" }).notNull().default(0),
  minuteStart: bigint("minute_start", { mode: "number" }).notNull().default(0),
  minuteRequests: integer("minute_requests").notNull().default(0),
  dayStart: bigint("day_start", { mode: "number" }).notNull().default(0),
  dayRequests: integer("day_requests").notNull().default(0),
  leases: jsonb("leases").$type<Record<string, number>>().notNull().default({}),
});
export const insertRoutingBudgetSchema = createInsertSchema(routingBudgetTable);
export type RoutingBudget = typeof routingBudgetTable.$inferSelect;
export type InsertRoutingBudget = typeof routingBudgetTable.$inferInsert;
