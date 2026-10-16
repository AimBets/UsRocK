CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_roles" "user_role"[] NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"request_id" text,
	CONSTRAINT "admin_audit_logs_action_format" CHECK ("admin_audit_logs"."action" ~ '^[a-z_]+\.[a-z_]+$'),
	CONSTRAINT "admin_audit_logs_resource_type_format" CHECK ("admin_audit_logs"."resource_type" ~ '^[a-z_]+$')
);
--> statement-breakpoint
CREATE INDEX "admin_audit_logs_occurred_idx" ON "admin_audit_logs" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_resource_idx" ON "admin_audit_logs" USING btree ("resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
-- Hand-written (not derived from the Drizzle schema): the audit trail is append-only.
-- UPDATE and DELETE are refused for every role, including the application's own.
-- TRUNCATE is not affected (used by the test suite only; never by the application).
CREATE FUNCTION "admin_audit_logs_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "admin_audit_logs_no_update_delete" BEFORE UPDATE OR DELETE ON "admin_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "admin_audit_logs_immutable"();
