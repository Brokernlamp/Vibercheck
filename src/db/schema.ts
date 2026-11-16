import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "ANALYST", "CLIENT", "DEVELOPER"]);
export const orgPlan = pgEnum("org_plan", ["NONE", "MONITORING"]);
export const auditTier = pgEnum("audit_tier", [
  "QUICK_SCAN",
  "FULL_AUDIT",
  "CONTINUOUS_MONITORING",
]);
export const engagementStatus = pgEnum("engagement_status", [
  "INTAKE",
  "SCANNING",
  "SCAN_FAILED",
  "UNDER_REVIEW",
  "READY_FOR_CLIENT",
  "DELIVERED",
  "REMEDIATION",
  "CLOSED",
]);
export const sourceType = pgEnum("source_type", ["ZIP", "GITHUB", "SAMPLE"]);
export const scanKind = pgEnum("scan_kind", ["INITIAL", "RESCAN", "CI"]);
export const ciFailurePolicy = pgEnum("ci_failure_policy", [
  "REPORT_ONLY",
  "BLOCK_HIGH",
  "BLOCK_ANY",
]);
export const scanStatus = pgEnum("scan_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);
export const findingSeverity = pgEnum("finding_severity", [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);
export const findingSource = pgEnum("finding_source", [
  "CUSTOM",
  "SECRET",
  "SCA",
  "LICENSE",
  "ANALYST",
]);
export const analystStatus = pgEnum("analyst_status", [
  "OPEN",
  "CONFIRMED",
  "DISMISSED",
]);
export const clientStatus = pgEnum("client_status", ["OPEN", "REMEDIATED"]);
export const verificationStatus = pgEnum("verification_status", [
  "UNVERIFIED",
  "OUTSTANDING",
  "RESOLVED",
]);
export const reportStatus = pgEnum("report_status", ["DRAFT", "FINAL"]);
export const billingKind = pgEnum("billing_kind", ["ONE_TIME", "SUBSCRIPTION"]);
export const billingStatus = pgEnum("billing_status", [
  "PENDING",
  "PAID",
  "ACTIVE",
  "FAILED",
  "REFUNDED",
  "CANCELED",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: orgPlan("plan").notNull().default("NONE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    mfaSecret: text("mfa_secret"),
    mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
    mfaRecoveryCodes: jsonb("mfa_recovery_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_org_idx").on(table.orgId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 of the random cookie value
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull().unique(),
    invitedById: uuid("invited_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("invites_email_idx").on(table.email)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedIpHash: text("requested_ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_user_idx").on(table.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemHeartbeats = pgTable("system_heartbeats", {
  name: text("name").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
});

export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    repoUrl: text("repo_url"),
    githubInstallationId: text("github_installation_id"),
    sourceType: sourceType("source_type").notNull(),
    tier: auditTier("tier").notNull(),
    ciFailurePolicy: ciFailurePolicy("ci_failure_policy")
      .notNull()
      .default("REPORT_ONLY"),
    status: engagementStatus("status").notNull().default("INTAKE"),
    intake: jsonb("intake").$type<Record<string, unknown>>().notNull().default({}),
    reviewCompletedAt: timestamp("review_completed_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsAcceptedById: uuid("terms_accepted_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("engagements_org_idx").on(table.orgId),
    index("engagements_status_idx").on(table.status),
  ],
);

export const scanRuns = pgTable(
  "scan_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: scanKind("kind").notNull(),
    githubOwner: text("github_owner"),
    githubRepo: text("github_repo"),
    githubInstallationId: text("github_installation_id"),
    githubCommitSha: text("github_commit_sha"),
    status: scanStatus("status").notNull().default("QUEUED"),
    sourcePath: text("source_path"),
    sourceBytes: integer("source_bytes").notNull().default(0),
    filesScanned: integer("files_scanned").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    engineVersion: text("engine_version"),
    score: integer("score"),
    grade: text("grade"),
    counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
    comparison: jsonb("comparison").$type<unknown>(),
    sourcePurgedAt: timestamp("source_purged_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("scan_runs_engagement_sequence_idx").on(
      table.engagementId,
      table.sequence,
    ),
    index("scan_runs_engagement_idx").on(table.engagementId),
  ],
);

export const githubWebhookDeliveries = pgTable(
  "github_webhook_deliveries",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull().default("PROCESSING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("github_webhook_deliveries_created_idx").on(table.createdAt)],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scanRuns.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    ruleId: text("rule_id").notNull(),
    source: findingSource("source").notNull(),
    title: text("title").notNull(),
    severity: findingSeverity("severity").notNull(),
    cwe: jsonb("cwe").$type<string[]>().notNull().default([]),
    owasp: text("owasp").notNull(),
    owaspTaxonomy: text("owasp_taxonomy").notNull().default("OWASP Top 10:2025"),
    category: text("category").notNull(),
    filePath: text("file_path").notNull(),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    snippet: text("snippet").notNull().default(""),
    description: text("description").notNull(),
    remediation: text("remediation").notNull(),
    confidence: integer("confidence").notNull().default(70),
    analystStatus: analystStatus("analyst_status").notNull().default("OPEN"),
    analystComment: text("analyst_comment"),
    analystPriority: text("analyst_priority"),
    analystTitle: text("analyst_title"),
    analystDescription: text("analyst_description"),
    analystRemediation: text("analyst_remediation"),
    triagedById: uuid("triaged_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    clientStatus: clientStatus("client_status").notNull().default("OPEN"),
    clientNote: text("client_note"),
    remediatedAt: timestamp("remediated_at", { withTimezone: true }),
    verification: verificationStatus("verification").notNull().default("UNVERIFIED"),
    addedById: uuid("added_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("findings_scan_fingerprint_idx").on(table.scanId, table.fingerprint),
    index("findings_scan_idx").on(table.scanId),
    index("findings_engagement_idx").on(table.engagementId),
    index("findings_fingerprint_idx").on(table.fingerprint),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scanRuns.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: reportStatus("status").notNull().default("DRAFT"),
    executiveSummary: text("executive_summary").notNull().default(""),
    payload: jsonb("payload").$type<unknown>(),
    finalizedById: uuid("finalized_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reports_engagement_version_idx").on(
      table.engagementId,
      table.version,
    ),
    index("reports_engagement_idx").on(table.engagementId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: userRole("actor_role"),
    actorEmail: text("actor_email"),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_engagement_idx").on(table.engagementId, table.createdAt),
    index("audit_logs_org_idx").on(table.orgId, table.createdAt),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "set null",
    }),
    kind: billingKind("kind").notNull(),
    tier: auditTier("tier").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: billingStatus("status").notNull().default("PENDING"),
    provider: text("provider").notNull().default("SIMULATED"),
    providerRef: text("provider_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("invoices_org_idx").on(table.orgId)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "set null",
    }),
    tier: auditTier("tier").notNull(),
    status: subscriptionStatus("status").notNull().default("ACTIVE"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("subscriptions_org_idx").on(table.orgId)],
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Engagement = typeof engagements.$inferSelect;
export type ScanRun = typeof scanRuns.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
