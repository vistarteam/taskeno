CREATE TYPE "public"."role_key" AS ENUM('user', 'provider', 'support', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('uploading', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('draft', 'pending_review', 'published', 'paused', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved_buyer', 'resolved_provider', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('unpaid', 'escrow_held', 'released', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'accepted', 'in_progress', 'delivered', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."commission_calc_type" AS ENUM('percent', 'fixed', 'percent_plus_fixed');--> statement-breakpoint
CREATE TYPE "public"."commission_scope" AS ENUM('global', 'category', 'service', 'provider');--> statement-breakpoint
CREATE TYPE "public"."journal_kind" AS ENUM('deposit', 'withdrawal', 'order_payment', 'escrow_release', 'commission', 'refund', 'transfer', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('deposit', 'order_payment');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."wallet_owner_type" AS ENUM('user', 'platform');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(20),
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(64),
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(64),
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"requested_ip" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(30) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"avatar_file_id" uuid,
	"bio" varchar(600),
	"province" varchar(60),
	"city" varchar(60),
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"completed_orders_count" integer DEFAULT 0 NOT NULL,
	"is_provider" boolean DEFAULT false NOT NULL,
	"provider_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "role_key" NOT NULL,
	"title_fa" varchar(60) NOT NULL,
	"description" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_agent" varchar(400),
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(120)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254),
	"phone" varchar(20),
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"slug" varchar(60) NOT NULL,
	"title_fa" varchar(80) NOT NULL,
	"description" varchar(300),
	"icon" varchar(40),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"storage_provider" varchar(20) DEFAULT 'local' NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" varchar(64) NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "file_status" DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_tags" (
	"service_id" uuid NOT NULL,
	"tag" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"price" numeric(20, 0) NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"delivery_days" smallint NOT NULL,
	"revisions" smallint DEFAULT 0 NOT NULL,
	"status" "service_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" varchar(300),
	"published_at" timestamp with time zone,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"participant_a" uuid NOT NULL,
	"participant_b" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"reason" varchar(120) NOT NULL,
	"description" varchar(1000),
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"resolution_note" varchar(600),
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"message" text NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"service_id" uuid,
	"service_snapshot" jsonb NOT NULL,
	"title_snapshot" varchar(120) NOT NULL,
	"description_snapshot" text NOT NULL,
	"price_snapshot" numeric(20, 0) NOT NULL,
	"delivery_days_snapshot" smallint NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(20),
	"reason" varchar(600),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"buyer_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"subtotal" numeric(20, 0) NOT NULL,
	"commission_amount" numeric(20, 0) DEFAULT 0 NOT NULL,
	"commission_snapshot" jsonb,
	"total" numeric(20, 0) NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'unpaid' NOT NULL,
	"note" varchar(1000),
	"idempotency_key" varchar(120),
	"accept_deadline_at" timestamp with time zone,
	"auto_complete_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" varchar(120) NOT NULL,
	"description" varchar(1000),
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"resolution_note" varchar(600),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"service_id" uuid,
	"author_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" varchar(1000),
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "commission_scope" NOT NULL,
	"scope_ref" uuid,
	"calc_type" "commission_calc_type" DEFAULT 'percent' NOT NULL,
	"percent_bps" integer DEFAULT 0 NOT NULL,
	"fixed_amount" numeric(20, 0) DEFAULT 0 NOT NULL,
	"min_commission" numeric(20, 0),
	"max_commission" numeric(20, 0),
	"priority" smallint DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(60) NOT NULL,
	"key" varchar(160) NOT NULL,
	"user_id" uuid,
	"request_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "journal_kind" NOT NULL,
	"reference_type" varchar(32),
	"reference_id" uuid,
	"idempotency_key" varchar(160) NOT NULL,
	"memo" varchar(300),
	"created_by" uuid,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount" numeric(20, 0) NOT NULL,
	"balance_before" numeric(20, 0) NOT NULL,
	"balance_after" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"source" varchar(20) NOT NULL,
	"payload" jsonb,
	"signature_valid" boolean,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"purpose" "payment_purpose" NOT NULL,
	"provider" varchar(32) NOT NULL,
	"amount" numeric(20, 0) NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"provider_authority" varchar(120),
	"provider_reference" varchar(120),
	"redirect_url" text,
	"idempotency_key" varchar(160),
	"paid_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"failure_code" varchar(60),
	"failure_message" varchar(300),
	"request_payload" jsonb,
	"verify_payload" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"order_id" uuid,
	"amount" numeric(20, 0) NOT NULL,
	"reason" varchar(300) NOT NULL,
	"status" varchar(20) DEFAULT 'succeeded' NOT NULL,
	"provider_reference" varchar(120),
	"journal_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "wallet_owner_type" DEFAULT 'user' NOT NULL,
	"owner_id" uuid,
	"code" varchar(32),
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"balance" numeric(20, 0) DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(60) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(60),
	"unique_key" varchar(80),
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" varchar(120),
	"last_error" varchar(300),
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"disabled_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" varchar(600) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"aggregate_type" varchar(40) NOT NULL,
	"aggregate_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_callback_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"raw_query" text,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" varchar(300),
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_images" ADD CONSTRAINT "service_images_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_images" ADD CONSTRAINT "service_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tags" ADD CONSTRAINT "service_tags_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_users_id_fk" FOREIGN KEY ("participant_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_users_id_fk" FOREIGN KEY ("participant_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles" USING btree ("username");--> statement-breakpoint
CREATE INDEX "profiles_provider_idx" ON "profiles" USING btree ("is_provider");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_key" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_idx" ON "verification_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_checksum_owner_key" ON "files" USING btree ("owner_user_id","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "service_images_order_key" ON "service_images" USING btree ("service_id","sort_order");--> statement-breakpoint
CREATE INDEX "service_images_service_idx" ON "service_images" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_tags_key" ON "service_tags" USING btree ("service_id","tag");--> statement-breakpoint
CREATE INDEX "service_tags_tag_idx" ON "service_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_key" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "services_browse_idx" ON "services" USING btree ("status","category_id","created_at");--> statement-breakpoint
CREATE INDEX "services_provider_idx" ON "services" USING btree ("provider_id","status");--> statement-breakpoint
CREATE INDEX "services_price_idx" ON "services" USING btree ("price");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_order_key" ON "conversations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "conversations_participant_a_idx" ON "conversations" USING btree ("participant_a","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_participant_b_idx" ON "conversations" USING btree ("participant_b","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_order_open_key" ON "disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "order_deliveries_order_idx" ON "order_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_code_key" ON "orders" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key" ON "orders" USING btree ("buyer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_provider_idx" ON "orders" USING btree ("provider_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_auto_complete_idx" ON "orders" USING btree ("status","auto_complete_at");--> statement-breakpoint
CREATE INDEX "orders_accept_deadline_idx" ON "orders" USING btree ("status","accept_deadline_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_author_key" ON "reviews" USING btree ("order_id","author_id");--> statement-breakpoint
CREATE INDEX "reviews_service_idx" ON "reviews" USING btree ("service_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_target_idx" ON "reviews" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "commission_rules_scope_idx" ON "commission_rules" USING btree ("scope","scope_ref","is_active");--> statement-breakpoint
CREATE INDEX "commission_rules_priority_idx" ON "commission_rules" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys" USING btree ("scope","key","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journals_idempotency_key_key" ON "journals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "journals_reference_idx" ON "journals" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "journals_kind_idx" ON "journals" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_journal_wallet_key" ON "ledger_entries" USING btree ("journal_id","wallet_id","direction");--> statement-breakpoint
CREATE INDEX "ledger_entries_wallet_idx" ON "ledger_entries" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_authority_key" ON "payments" USING btree ("provider","provider_authority");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key" ON "payments" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_owner_key" ON "wallets" USING btree ("owner_type","owner_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_code_key" ON "wallets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "wallets_owner_id_idx" ON "wallets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "jobs_poll_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_unique_key_idx" ON "jobs" USING btree ("unique_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_key" ON "notification_preferences" USING btree ("user_id","channel");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "payment_callback_log_created_idx" ON "payment_callback_log" USING btree ("created_at");