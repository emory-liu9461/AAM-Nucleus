CREATE TYPE "public"."call_status" AS ENUM('ringing', 'answered', 'missed', 'voicemail');--> statement-breakpoint
CREATE TYPE "public"."chat_channel" AS ENUM('web', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."inbox_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."message_author" AS ENUM('customer', 'assistant', 'staff', 'system');--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'phone';--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"contact_id" uuid,
	"call_sid" text NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"status" "call_status" DEFAULT 'ringing' NOT NULL,
	"duration_sec" integer,
	"recording_url" text,
	"recording_seconds" integer,
	"texted_back" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_call_sid_unique" UNIQUE("call_sid")
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel" "inbox_channel" NOT NULL,
	"conversation_id" uuid,
	"contact_id" uuid,
	"direction" text NOT NULL,
	"author" "message_author" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"external_id" text,
	"status" text,
	"sent_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "phone_settings" jsonb;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "email_settings" jsonb;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "channel" "chat_channel" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "ai_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "sms_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_business_idx" ON "calls" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_conv_idx" ON "inbox_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_contact_idx" ON "inbox_messages" USING btree ("contact_id");