CREATE TYPE "public"."advance_status" AS ENUM('created', 'cancelled', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('ADVANCE_CREATED', 'REPORT_APPROVED', 'REPORT_REJECTED', 'REPORT_REOPENED', 'REPORT_PAID', 'RULE_CREATED', 'RULE_UPDATED', 'RULE_DELETED', 'RULE_RUN');--> statement-breakpoint
CREATE TYPE "public"."balance_status" AS ENUM('DEVEDOR', 'QUITADO', 'CREDOR');--> statement-breakpoint
CREATE TABLE "advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"vexpenses_id" integer,
	"team_member_id" integer NOT NULL,
	"team_member_name" text,
	"value" text NOT NULL,
	"currency_code" text DEFAULT 'BRL' NOT NULL,
	"description" text,
	"status" "advance_status" DEFAULT 'created' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'advice' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"vexpenses_team_member_id" integer,
	"role" text DEFAULT 'viewer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_email" text,
	"action" "audit_action" NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"team_member_id" integer PRIMARY KEY NOT NULL,
	"team_member_name" text NOT NULL,
	"department_name" text,
	"total_advances" text DEFAULT '0' NOT NULL,
	"total_consumed" text DEFAULT '0' NOT NULL,
	"total_pending_reimbursement" text DEFAULT '0' NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"status" "balance_status" DEFAULT 'QUITADO' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"author_email" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"scope" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "advances_member_idx" ON "advances" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "advances_created_at_idx" ON "advances" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_idx" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "snapshot_status_idx" ON "balance_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_notes_report_idx" ON "report_notes" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "filter_owner_scope_idx" ON "saved_filters" USING btree ("owner_email","scope");