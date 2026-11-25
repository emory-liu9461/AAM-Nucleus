CREATE TABLE "event_staff" (
	"event_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"role" text,
	"invited_at" timestamp with time zone,
	"invite_error" text,
	CONSTRAINT "event_staff_event_id_staff_id_pk" PRIMARY KEY("event_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"phone" text,
	"email" text,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"notes" text,
	"send_invites" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"calendar_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_calendar_token_unique" UNIQUE("calendar_token")
);
--> statement-breakpoint
ALTER TABLE "schedule_events" ADD COLUMN "days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD COLUMN "sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_schedule_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."schedule_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_staff_staff_idx" ON "event_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_business_idx" ON "staff_members" USING btree ("business_id");