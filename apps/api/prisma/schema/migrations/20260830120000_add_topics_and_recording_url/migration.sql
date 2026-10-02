-- Add recording_url to sessions for YouTube video recording links.
ALTER TABLE "sessions"
ADD COLUMN "recording_url" TEXT;

-- Create topics table for class-scoped lesson topics.
CREATE TABLE "topics" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()),
    "class_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "video_url" TEXT,
    "content" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for topics.
ALTER TABLE "topics"
ADD CONSTRAINT "topics_class_id_fkey"
FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "topics"
ADD CONSTRAINT "topics_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "topics"
ADD CONSTRAINT "topics_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for topics.
CREATE INDEX "topics_class_id_idx" ON "topics"("class_id");
