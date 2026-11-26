ALTER TABLE "users" ADD COLUMN "can_send_quotes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "can_send_quotes" = true WHERE "role" = 'owner';
