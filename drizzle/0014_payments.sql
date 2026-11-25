ALTER TABLE "businesses" ADD COLUMN "payment_settings" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pay_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_stripe_ref" ON "payments" USING btree ("reference") WHERE "payments"."reference" like 'stripe:%';--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pay_token_unique" UNIQUE("pay_token");