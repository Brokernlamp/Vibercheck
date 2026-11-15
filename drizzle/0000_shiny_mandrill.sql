CREATE TYPE "public"."analyst_status" AS ENUM('OPEN', 'CONFIRMED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."audit_tier" AS ENUM('QUICK_SCAN', 'FULL_AUDIT', 'CONTINUOUS_MONITORING');--> statement-breakpoint
CREATE TYPE "public"."billing_kind" AS ENUM('ONE_TIME', 'SUBSCRIPTION');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('PENDING', 'PAID', 'ACTIVE', 'FAILED', 'REFUNDED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('OPEN', 'REMEDIATED');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('INTAKE', 'SCANNING', 'SCAN_FAILED', 'UNDER_REVIEW', 'READY_FOR_CLIENT', 'DELIVERED', 'REMEDIATION', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');--> statement-breakpoint
CREATE TYPE "public"."finding_source" AS ENUM('CUSTOM', 'SECRET', 'SCA', 'LICENSE', 'ANALYST');--> statement-breakpoint
CREATE TYPE "public"."org_plan" AS ENUM('NONE', 'MONITORING');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('DRAFT', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."scan_kind" AS ENUM('INITIAL', 'RESCAN', 'CI');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('ZIP', 'GITHUB', 'SAMPLE');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'ANALYST', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'OUTSTANDING', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" "user_role",
	"actor_email" text,
	"org_id" uuid,
	"engagement_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by_id" uuid,
	"name" text NOT NULL,
	"repo_url" text,
	"source_type" "source_type" NOT NULL,
	"tier" "audit_tier" NOT NULL,
	"status" "engagement_status" DEFAULT 'INTAKE' NOT NULL,
	"intake" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_completed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"review_note" text,
	"terms_accepted_at" timestamp with time zone,
	"terms_accepted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"rule_id" text NOT NULL,
	"source" "finding_source" NOT NULL,
	"title" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"owasp" text NOT NULL,
	"category" text NOT NULL,
	"file_path" text NOT NULL,
	"line_start" integer NOT NULL,
	"line_end" integer NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"description" text NOT NULL,
	"remediation" text NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"analyst_status" "analyst_status" DEFAULT 'OPEN' NOT NULL,
	"analyst_comment" text,
	"analyst_priority" text,
	"analyst_title" text,
	"analyst_description" text,
	"analyst_remediation" text,
	"triaged_by_id" uuid,
	"triaged_at" timestamp with time zone,
	"client_status" "client_status" DEFAULT 'OPEN' NOT NULL,
	"client_note" text,
	"remediated_at" timestamp with time zone,
	"verification" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"org_id" uuid,
	"token_hash" text NOT NULL,
	"invited_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid,
	"kind" "billing_kind" NOT NULL,
	"tier" "audit_tier" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "billing_status" DEFAULT 'PENDING' NOT NULL,
	"provider" text DEFAULT 'SIMULATED' NOT NULL,
	"provider_ref" text,
	"paid_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "org_plan" DEFAULT 'NONE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "report_status" DEFAULT 'DRAFT' NOT NULL,
	"executive_summary" text DEFAULT '' NOT NULL,
	"payload" jsonb,
	"finalized_by_id" uuid,
	"finalized_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" "scan_kind" NOT NULL,
	"status" "scan_status" DEFAULT 'QUEUED' NOT NULL,
	"source_path" text,
	"source_bytes" integer DEFAULT 0 NOT NULL,
	"files_scanned" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"engine_version" text,
	"score" integer,
	"grade" text,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comparison" jsonb,
	"source_purged_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"engagement_id" uuid,
	"tier" "audit_tier" NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"org_id" uuid,
	"email_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"mfa_secret" text,
	"mfa_enabled_at" timestamp with time zone,
	"mfa_recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_terms_accepted_by_id_users_id_fk" FOREIGN KEY ("terms_accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_scan_runs_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_triaged_by_id_users_id_fk" FOREIGN KEY ("triaged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_scan_id_scan_runs_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_finalized_by_id_users_id_fk" FOREIGN KEY ("finalized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_engagement_idx" ON "audit_logs" USING btree ("engagement_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "engagements_org_idx" ON "engagements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "engagements_status_idx" ON "engagements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_scan_fingerprint_idx" ON "findings" USING btree ("scan_id","fingerprint");--> statement-breakpoint
CREATE INDEX "findings_scan_idx" ON "findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "findings_engagement_idx" ON "findings" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "findings_fingerprint_idx" ON "findings" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_engagement_version_idx" ON "reports" USING btree ("engagement_id","version");--> statement-breakpoint
CREATE INDEX "reports_engagement_idx" ON "reports" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_runs_engagement_sequence_idx" ON "scan_runs" USING btree ("engagement_id","sequence");--> statement-breakpoint
CREATE INDEX "scan_runs_engagement_idx" ON "scan_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");