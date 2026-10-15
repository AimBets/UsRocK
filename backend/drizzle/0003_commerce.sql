CREATE TYPE "public"."campaign_placement" AS ENUM('announcement_bar', 'home_hero', 'home_panel');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."coupon_discount_type" AS ENUM('percentage', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."newsletter_event_type" AS ENUM('subscribe_requested', 'confirmed', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."newsletter_status" AS ENUM('pending', 'confirmed', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "citext" NOT NULL,
	"placement" "campaign_placement" NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"cta_label" text,
	"cta_href" text,
	"media_url" text,
	"media_alt" text,
	"collection_id" uuid,
	"coupon_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug"),
	CONSTRAINT "campaigns_slug_format" CHECK ("campaigns"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "campaigns_period" CHECK ("campaigns"."ends_at" IS NULL OR "campaigns"."ends_at" > "campaigns"."starts_at"),
	CONSTRAINT "campaigns_title_length" CHECK (length(trim("campaigns"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "campaigns_subtitle_length" CHECK ("campaigns"."subtitle" IS NULL OR length("campaigns"."subtitle") <= 300),
	CONSTRAINT "campaigns_cta_pair" CHECK (("campaigns"."cta_label" IS NULL) = ("campaigns"."cta_href" IS NULL)),
	CONSTRAINT "campaigns_cta_href_safe" CHECK ("campaigns"."cta_href" IS NULL OR "campaigns"."cta_href" ~ '^(/[^/]|/$|https://)'),
	CONSTRAINT "campaigns_media_url_safe" CHECK ("campaigns"."media_url" IS NULL OR "campaigns"."media_url" ~ '^(/[^/]|https://)'),
	CONSTRAINT "campaigns_media_has_alt" CHECK ("campaigns"."media_url" IS NULL OR length(trim("campaigns"."media_alt")) > 0)
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "citext" NOT NULL,
	"description" text NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"percent_off" integer,
	"amount_off_minor" integer,
	"max_discount_minor" integer,
	"min_subtotal_minor" integer DEFAULT 0 NOT NULL,
	"collection_id" uuid,
	"requires_account" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"times_redeemed" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_code_format" CHECK ("coupons"."code"::text ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
	CONSTRAINT "coupons_discount_shape" CHECK (("coupons"."discount_type" = 'percentage' AND "coupons"."percent_off" BETWEEN 1 AND 100 AND "coupons"."amount_off_minor" IS NULL)
        OR ("coupons"."discount_type" = 'fixed_amount' AND "coupons"."amount_off_minor" > 0 AND "coupons"."percent_off" IS NULL AND "coupons"."max_discount_minor" IS NULL)),
	CONSTRAINT "coupons_max_discount_positive" CHECK ("coupons"."max_discount_minor" IS NULL OR "coupons"."max_discount_minor" > 0),
	CONSTRAINT "coupons_min_subtotal_non_negative" CHECK ("coupons"."min_subtotal_minor" >= 0),
	CONSTRAINT "coupons_period" CHECK ("coupons"."ends_at" IS NULL OR "coupons"."ends_at" > "coupons"."starts_at"),
	CONSTRAINT "coupons_usage" CHECK ("coupons"."times_redeemed" >= 0 AND ("coupons"."usage_limit" IS NULL OR "coupons"."usage_limit" > 0)),
	CONSTRAINT "coupons_description_length" CHECK (length(trim("coupons"."description")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor_snapshot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_variant_unique" UNIQUE("cart_id","variant_id"),
	CONSTRAINT "cart_items_quantity_range" CHECK ("cart_items"."quantity" BETWEEN 1 AND 10),
	CONSTRAINT "cart_items_snapshot_non_negative" CHECK ("cart_items"."unit_price_minor_snapshot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"guest_token_hash" text,
	"coupon_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_user_unique" UNIQUE("user_id"),
	CONSTRAINT "carts_guest_token_hash_unique" UNIQUE("guest_token_hash"),
	CONSTRAINT "carts_single_owner" CHECK (("carts"."user_id" IS NOT NULL AND "carts"."guest_token_hash" IS NULL AND "carts"."expires_at" IS NULL)
        OR ("carts"."user_id" IS NULL AND "carts"."guest_token_hash" IS NOT NULL AND "carts"."expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "newsletter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event" "newsletter_event_type" NOT NULL,
	"policy_version" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"status" "newsletter_status" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp with time zone,
	"unsubscribe_token_hash" text NOT NULL,
	"policy_version" text NOT NULL,
	"source" text NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscriptions_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_confirm_token_hash_unique" UNIQUE("confirm_token_hash"),
	CONSTRAINT "newsletter_unsubscribe_token_hash_unique" UNIQUE("unsubscribe_token_hash")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_events" ADD CONSTRAINT "newsletter_events_subscription_id_newsletter_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."newsletter_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_subscriptions" ADD CONSTRAINT "newsletter_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_active_idx" ON "campaigns" USING btree ("status","placement","starts_at");--> statement-breakpoint
CREATE INDEX "cart_items_variant_idx" ON "cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "carts_expires_idx" ON "carts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "favorites_user_created_idx" ON "favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "newsletter_events_subscription_idx" ON "newsletter_events" USING btree ("subscription_id","created_at");