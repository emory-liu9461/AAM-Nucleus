CREATE TABLE "message_reads" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "message_reads_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;