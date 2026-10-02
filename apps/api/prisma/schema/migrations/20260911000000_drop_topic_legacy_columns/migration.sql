-- Drop legacy video_url and content columns from topics table.
-- Data was migrated to lectures in migration 20260907100000.

ALTER TABLE "topics" DROP COLUMN "video_url";
ALTER TABLE "topics" DROP COLUMN "content";
