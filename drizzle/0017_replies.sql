CREATE TABLE "message_handled" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"handled_at" timestamp with time zone,
	"user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "direction" text DEFAULT 'in' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "message_handled" ADD CONSTRAINT "message_handled_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;