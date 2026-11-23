ALTER TABLE "businesses" ADD COLUMN "form_key" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "form_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "form_heading" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "form_services" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "form_thank_you" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "allowed_domains" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "attribution" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_form_key_unique" UNIQUE("form_key");