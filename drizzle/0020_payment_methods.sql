ALTER TYPE "public"."payment_method" ADD VALUE 'etransfer';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'other';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "confirmed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "payments" SET "confirmed_at" = "received_at" WHERE "confirmed_at" IS NULL;
