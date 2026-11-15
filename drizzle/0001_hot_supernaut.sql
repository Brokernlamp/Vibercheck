CREATE TYPE "public"."ci_failure_policy" AS ENUM('REPORT_ONLY', 'BLOCK_HIGH', 'BLOCK_ANY');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'DEVELOPER';--> statement-breakpoint
CREATE TABLE "github_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'PROCESSING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "ci_failure_policy" "ci_failure_policy" DEFAULT 'REPORT_ONLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN "github_owner" text;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN "github_repo" text;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN "github_installation_id" text;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD COLUMN "github_commit_sha" text;--> statement-breakpoint
CREATE INDEX "github_webhook_deliveries_created_idx" ON "github_webhook_deliveries" USING btree ("created_at");