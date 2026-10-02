-- CreateEnum: TopicKind
CREATE TYPE "TopicKind" AS ENUM ('theory', 'practice');

-- CreateTable: chapters
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()),
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: chapters
CREATE INDEX "chapters_course_id_idx" ON "chapters"("course_id");

-- AddForeignKey: chapters → courses
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add new columns to topics
ALTER TABLE "topics" ADD COLUMN "kind" "TopicKind" NOT NULL DEFAULT 'theory';
ALTER TABLE "topics" ADD COLUMN "course_id" TEXT;
ALTER TABLE "topics" ADD COLUMN "chapter_id" TEXT;

-- AlterTable: Make class_id nullable (was NOT NULL)
ALTER TABLE "topics" ALTER COLUMN "class_id" DROP NOT NULL;

-- AddForeignKey: topics → courses
ALTER TABLE "topics" ADD CONSTRAINT "topics_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: topics → chapters
ALTER TABLE "topics" ADD CONSTRAINT "topics_chapter_id_fkey"
    FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: topics
CREATE INDEX "topics_course_id_idx" ON "topics"("course_id");
CREATE INDEX "topics_chapter_id_idx" ON "topics"("chapter_id");

-- CreateTable: lectures
CREATE TABLE "lectures" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()),
    "topic_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "video_url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL,

    CONSTRAINT "lectures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: lectures
CREATE INDEX "lectures_topic_id_idx" ON "lectures"("topic_id");

-- AddForeignKey: lectures → topics
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraint: topics must belong to either (courseId+chapterId) OR classId, never both
ALTER TABLE "topics" ADD CONSTRAINT "topics_owner_check"
    CHECK (
        ("course_id" IS NOT NULL AND "chapter_id" IS NOT NULL AND "class_id" IS NULL)
        OR
        ("course_id" IS NULL AND "chapter_id" IS NULL AND "class_id" IS NOT NULL)
    );

-- Data migration: Create a Lecture for each existing Topic (theory) with its video_url/content
INSERT INTO "lectures" ("id", "topic_id", "title", "video_url", "content", "order", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    t."id",
    t."title",
    t."video_url",
    t."content",
    0,
    t."created_at",
    t."updated_at"
FROM "topics" t
WHERE t."video_url" IS NOT NULL OR t."content" IS NOT NULL;
