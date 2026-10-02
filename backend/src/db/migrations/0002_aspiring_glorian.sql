CREATE TYPE "public"."task_status" AS ENUM('open', 'taken', 'in_progress', 'delivered', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"provider_id" uuid,
	"category_id" uuid,
	"order_id" uuid,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"budget" numeric(20, 0) NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"estimated_minutes" smallint NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone,
	"taken_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_public_idx" ON "tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_buyer_idx" ON "tasks" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_provider_idx" ON "tasks" USING btree ("provider_id","status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_expires_idx" ON "tasks" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_order_key" ON "tasks" USING btree ("order_id");