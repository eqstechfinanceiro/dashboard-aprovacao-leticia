import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Local (Neon) state. The VExpenses API is the source of truth for reports,
 * expenses, and team members. We only persist what the API cannot expose:
 *   - history log of advances created through the dashboard
 *   - application users (who can log into *this* dashboard)
 *   - AI consultora rules
 *   - audit log of every write performed through the dashboard
 *   - pre-computed balance snapshots (for performance; recomputed every few
 *     minutes so the Caixa tab does not pay 5000+ API calls on every request)
 */

export const advanceStatusEnum = pgEnum("advance_status", [
  "created",
  "cancelled",
  "consumed",
]);

export const balanceStatusEnum = pgEnum("balance_status", [
  "DEVEDOR",
  "QUITADO",
  "CREDOR",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "ADVANCE_CREATED",
  "REPORT_APPROVED",
  "REPORT_REJECTED",
  "REPORT_REOPENED",
  "REPORT_PAID",
  "RULE_CREATED",
  "RULE_UPDATED",
  "RULE_DELETED",
  "RULE_RUN",
]);

export const advances = pgTable(
  "advances",
  {
    id: serial("id").primaryKey(),
    vexpensesId: integer("vexpenses_id"),
    teamMemberId: integer("team_member_id").notNull(),
    teamMemberName: text("team_member_name"),
    value: text("value").notNull(),
    currencyCode: text("currency_code").notNull().default("BRL"),
    description: text("description"),
    status: advanceStatusEnum("status").notNull().default("created"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => ({
    memberIdx: index("advances_member_idx").on(t.teamMemberId),
    createdAtIdx: index("advances_created_at_idx").on(t.createdAt),
  }),
);

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    teamMemberId: integer("team_member_id").primaryKey(),
    teamMemberName: text("team_member_name").notNull(),
    departmentName: text("department_name"),
    totalAdvances: text("total_advances").notNull().default("0"),
    totalConsumed: text("total_consumed").notNull().default("0"),
    totalPendingReimbursement: text("total_pending_reimbursement")
      .notNull()
      .default("0"),
    balance: text("balance").notNull().default("0"),
    status: balanceStatusEnum("status").notNull().default("QUITADO"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("snapshot_status_idx").on(t.status),
  }),
);

export const aiRules = pgTable("ai_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull().default("advice"), // 'advice' | 'autoaction'
  enabled: boolean("enabled").notNull().default(true),
  condition: jsonb("condition").notNull().default({}),
  action: jsonb("action").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appUsers = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    vexpensesTeamMemberId: integer("vexpenses_team_member_id"),
    role: text("role").notNull().default("viewer"), // 'admin' | 'approver' | 'viewer'
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("app_users_email_idx").on(t.email),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorEmail: text("actor_email"),
    action: auditActionEnum("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    actionIdx: index("audit_action_idx").on(t.action),
    entityIdx: index("audit_entity_idx").on(t.entity, t.entityId),
  }),
);

export const reportNotes = pgTable(
  "report_notes",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull(),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("report_notes_report_idx").on(t.reportId),
  }),
);

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: serial("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    scope: text("scope").notNull(), // 'approvals' | 'reports' | 'cash' | ...
    name: text("name").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ownerScopeIdx: index("filter_owner_scope_idx").on(t.ownerEmail, t.scope),
  }),
);

export type Advance = typeof advances.$inferSelect;
export type NewAdvance = typeof advances.$inferInsert;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type AIRule = typeof aiRules.$inferSelect;
export type NewAIRule = typeof aiRules.$inferInsert;
export type AppUser = typeof appUsers.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type ReportNote = typeof reportNotes.$inferSelect;
export type SavedFilter = typeof savedFilters.$inferSelect;
