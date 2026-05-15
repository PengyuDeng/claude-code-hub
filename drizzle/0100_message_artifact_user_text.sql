DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'message_request_artifact'
      AND column_name = 'user_text'
  ) THEN
    ALTER TABLE "message_request_artifact" ADD COLUMN "user_text" text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'message_request_artifact'
      AND column_name = 'request_body'
  ) THEN
    ALTER TABLE "message_request_artifact" DROP COLUMN "request_body";
  END IF;
END $$;
