CREATE TABLE IF NOT EXISTS "message_request_artifact" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_request_id" integer NOT NULL,
	"key" varchar NOT NULL,
	"request_body" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "message_request_artifact" ADD CONSTRAINT "message_request_artifact_message_request_id_message_request_id_fk" FOREIGN KEY ("message_request_id") REFERENCES "public"."message_request"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_message_request_artifact_message_request" ON "message_request_artifact" USING btree ("message_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_message_request_artifact_key_created_at" ON "message_request_artifact" USING btree ("key","created_at");
