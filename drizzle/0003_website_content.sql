ALTER TABLE "businesses" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "site" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_domain_unique" UNIQUE("domain");