CREATE TABLE "project_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"caption" text,
	"service_slug" text,
	"area_slug" text,
	"kind" text DEFAULT 'photo' NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"job_id" uuid,
	"contact_id" uuid NOT NULL,
	"token" text NOT NULL,
	"channels" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clicked_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	CONSTRAINT "review_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "alert_settings" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "review_settings" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "tax_label" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "tax_rate" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "subtotal" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_label" text;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_business_idx" ON "project_photos" USING btree ("business_id","sort_order");--> statement-breakpoint
CREATE INDEX "review_requests_business_idx" ON "review_requests" USING btree ("business_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_job" ON "review_requests" USING btree ("job_id");