CREATE TYPE "public"."quote_status" AS ENUM('draft', 'approved', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"items" jsonb NOT NULL,
	"margin_type" text DEFAULT 'percent' NOT NULL,
	"margin_value" text DEFAULT '30' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"list_price" integer DEFAULT 0 NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" text DEFAULT '0' NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"include_tax" boolean DEFAULT true NOT NULL,
	"tax_label" text,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"valid_until" date,
	"token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"job_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "quote_settings" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotes_business_idx" ON "quotes" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "quotes_lead_idx" ON "quotes" USING btree ("lead_id");