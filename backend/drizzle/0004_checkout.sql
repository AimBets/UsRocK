CREATE TYPE "public"."order_actor" AS ENUM('customer', 'system', 'payment_provider', 'shipping_provider', 'admin');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'in_fulfillment', 'shipped', 'delivered', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."coupon_redemption_status" AS ENUM('active', 'released');--> statement-breakpoint
CREATE TYPE "public"."stock_reservation_status" AS ENUM('active', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"recipient_name" text NOT NULL,
	"recipient_document" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"postal_code" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_postal_code_format" CHECK ("addresses"."postal_code" ~ '^[0-9]{8}$'),
	CONSTRAINT "addresses_document_format" CHECK ("addresses"."recipient_document" ~ '^[0-9]{11}$'),
	CONSTRAINT "addresses_phone_format" CHECK ("addresses"."recipient_phone" ~ '^[0-9]{10,11}$'),
	CONSTRAINT "addresses_state_format" CHECK ("addresses"."state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "addresses_recipient_length" CHECK (length(trim("addresses"."recipient_name")) BETWEEN 3 AND 120)
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"discount_minor" integer NOT NULL,
	"status" "coupon_redemption_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_order_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_slug" text NOT NULL,
	"product_name" text NOT NULL,
	"sku" text NOT NULL,
	"size" text NOT NULL,
	"color" text,
	"image_url" text,
	"image_alt" text,
	"unit_price_minor" integer NOT NULL,
	"compare_at_unit_price_minor" integer,
	"quantity" integer NOT NULL,
	"line_total_minor" integer NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_line_total" CHECK ("order_items"."line_total_minor" = "order_items"."unit_price_minor" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" "order_actor" NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text DEFAULT ('UR' || lpad(nextval('order_number_seq')::text, 6, '0')) NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"shipping_provider" text NOT NULL,
	"shipping_service_id" text NOT NULL,
	"shipping_service_name" text NOT NULL,
	"shipping_carrier" text NOT NULL,
	"shipping_delivery_days_min" integer NOT NULL,
	"shipping_delivery_days_max" integer NOT NULL,
	"coupon_id" uuid,
	"coupon_code" text,
	"subtotal_minor" integer NOT NULL,
	"discount_minor" integer NOT NULL,
	"shipping_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"currency_code" text DEFAULT 'BRL' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"reservation_expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"attention_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal_minor" >= 0 AND "orders"."discount_minor" >= 0 AND "orders"."shipping_minor" >= 0
        AND "orders"."discount_minor" <= "orders"."subtotal_minor"
        AND "orders"."total_minor" = "orders"."subtotal_minor" - "orders"."discount_minor" + "orders"."shipping_minor"),
	CONSTRAINT "orders_currency" CHECK ("orders"."currency_code" = 'BRL')
);
--> statement-breakpoint
CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"postal_code" text NOT NULL,
	"cart_fingerprint" text NOT NULL,
	"options" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_quotes_postal_code_format" CHECK ("shipping_quotes"."postal_code" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "stock_reservation_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservations_order_variant_unique" UNIQUE("order_id","variant_id"),
	CONSTRAINT "stock_reservations_quantity_positive" CHECK ("stock_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"provider_preference_id" text,
	"provider_payment_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'created' NOT NULL,
	"status_detail" text,
	"amount_minor" integer NOT NULL,
	"live_mode" boolean,
	"approved_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_key" text NOT NULL,
	"topic" text NOT NULL,
	"resource_id" text,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"service_id" text NOT NULL,
	"provider_order_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"tracking_code" text,
	"label_url" text,
	"posted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template" text NOT NULL,
	"order_id" uuid,
	"recipient" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_attempts_non_negative" CHECK ("notifications"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "width_cm" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "length_cm" integer;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "per_customer_limit" integer;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses" USING btree ("user_id") WHERE "addresses"."is_default";--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_user_idx" ON "coupon_redemptions" USING btree ("coupon_id","user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_user_scope_key_unique" ON "idempotency_keys" USING btree ("user_id","scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_pending_expiry_idx" ON "orders" USING btree ("reservation_expires_at") WHERE "orders"."status" = 'pending_payment';--> statement-breakpoint
CREATE INDEX "shipping_quotes_cart_idx" ON "shipping_quotes" USING btree ("cart_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_reservations_active_idx" ON "stock_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_key_unique" ON "webhook_events" USING btree ("provider","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_provider_order_unique" ON "shipments" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_shipping_positive" CHECK (("product_variants"."weight_grams" IS NULL OR "product_variants"."weight_grams" > 0) AND ("product_variants"."height_cm" IS NULL OR "product_variants"."height_cm" > 0)
        AND ("product_variants"."width_cm" IS NULL OR "product_variants"."width_cm" > 0) AND ("product_variants"."length_cm" IS NULL OR "product_variants"."length_cm" > 0));--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_per_customer_limit_positive" CHECK ("coupons"."per_customer_limit" IS NULL OR "coupons"."per_customer_limit" > 0);