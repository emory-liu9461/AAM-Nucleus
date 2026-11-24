CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"meta" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"author" text,
	"text" text,
	"rating" integer,
	"url" text,
	"replied" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"day" date NOT NULL,
	"followers" integer,
	"views" integer,
	"likes" integer,
	"comments" integer,
	"reviews_count" integer,
	"rating" text,
	"extra" jsonb,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_items" ADD CONSTRAINT "social_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_stats" ADD CONSTRAINT "social_stats_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_unique" ON "social_accounts" USING btree ("business_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "social_items_unique" ON "social_items" USING btree ("business_id","channel","external_id");--> statement-breakpoint
CREATE INDEX "social_items_recent" ON "social_items" USING btree ("business_id","posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_stats_day" ON "social_stats" USING btree ("business_id","channel","day");