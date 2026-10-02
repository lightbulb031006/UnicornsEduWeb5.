-- Vé 05: Khoá học → Chuyên đề (modules) → Tiết học (lessons).
-- Migration MỚI chồng lên lịch sử hiện có. Không sửa các file migration đã commit.
-- Production (main) sẽ tạo chapters/topics/lectures rồi đổi tên ngay sau đó — thừa vài giây, vô hại.
--
-- Data rules (biên bản 13/09/2026):
--   * mỗi Lecture cũ → một tiết lý thuyết riêng (giữ id, title, video, content, thứ tự)
--   * Topic practice → một tiết thực hành (giữ id); Topic theory không có lecture → một tiết lý thuyết (giữ id)
--   * lớp gán 1 chuyên đề N bài → N class_content_items + N timeline items; ẩn/người ẩn copy nguyên
--   * lượt xem lý thuyết cũ nằm ở tiết đầu; tiết sau chưa xem
--   * tiết thuộc chuyên đề XOR lớp (CHECK); tiết thực hành không mang video/content (CHECK)

-- ---------------------------------------------------------------------------
-- 1. Rename enum + chapters → modules
-- ---------------------------------------------------------------------------
ALTER TYPE "TopicKind" RENAME TO "LessonKind";

ALTER TABLE "chapters" RENAME TO "modules";
ALTER TABLE "modules" RENAME CONSTRAINT "chapters_pkey" TO "modules_pkey";
ALTER INDEX "chapters_course_id_idx" RENAME TO "modules_course_id_idx";
ALTER TABLE "modules" RENAME CONSTRAINT "chapters_course_id_fkey" TO "modules_course_id_fkey";

-- questions.chapter_id → module_id (bảng có thể dùng snake_case từ @map)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'chapter_id'
  ) THEN
    ALTER TABLE "questions" RENAME COLUMN "chapter_id" TO "module_id";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'chapterId'
  ) THEN
    ALTER TABLE "questions" RENAME COLUMN "chapterId" TO "module_id";
  END IF;
END $$;

ALTER INDEX IF EXISTS "questions_chapter_id_idx" RENAME TO "questions_module_id_idx";

ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_chapter_id_fkey";
ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_chapterId_fkey";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'module_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'questions' AND constraint_name = 'questions_module_id_fkey'
  ) THEN
    ALTER TABLE "questions"
      ADD CONSTRAINT "questions_module_id_fkey"
      FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create lessons + map old topic/lecture ids
-- ---------------------------------------------------------------------------
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()),
    "kind" "LessonKind" NOT NULL,
    "course_id" TEXT,
    "module_id" TEXT,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "video_url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT now(),

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lessons_course_id_idx" ON "lessons"("course_id");
CREATE INDEX "lessons_module_id_idx" ON "lessons"("module_id");
CREATE INDEX "lessons_class_id_idx" ON "lessons"("class_id");

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey"
    FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TEMP TABLE topic_lesson_map (
    topic_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (topic_id, seq)
);

-- Practice topics keep their id as the practice lesson.
INSERT INTO topic_lesson_map (topic_id, lesson_id, seq)
SELECT t."id", t."id", 1
FROM "topics" t
WHERE t."kind" = 'practice';

-- Theory topics with no lectures keep their id (one theory lesson, no media).
INSERT INTO topic_lesson_map (topic_id, lesson_id, seq)
SELECT t."id", t."id", 1
FROM "topics" t
WHERE t."kind" = 'theory'
  AND NOT EXISTS (SELECT 1 FROM "lectures" l WHERE l."topic_id" = t."id");

-- Each lecture of a theory topic becomes its own theory lesson (same lecture id).
INSERT INTO topic_lesson_map (topic_id, lesson_id, seq)
SELECT
    t."id",
    l."id",
    ROW_NUMBER() OVER (PARTITION BY t."id" ORDER BY l."order", l."id")::int
FROM "lectures" l
JOIN "topics" t ON t."id" = l."topic_id"
WHERE t."kind" = 'theory';

INSERT INTO "lessons" (
    "id", "kind", "course_id", "module_id", "class_id",
    "title", "video_url", "content", "order",
    "created_by", "updated_by", "created_at", "updated_at"
)
SELECT
    m.lesson_id,
    CASE WHEN t."kind" = 'practice' THEN 'practice'::"LessonKind" ELSE 'theory'::"LessonKind" END,
    t."course_id",
    t."chapter_id",
    t."class_id",
    COALESCE(lec."title", t."title"),
    CASE WHEN t."kind" = 'practice' THEN NULL ELSE lec."video_url" END,
    CASE WHEN t."kind" = 'practice' THEN NULL ELSE lec."content" END,
    (
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(t."chapter_id", t."class_id")
            ORDER BY t."order", t."id", m.seq, m.lesson_id
        ) - 1
    )::int,
    t."created_by",
    t."updated_by",
    COALESCE(lec."created_at", t."created_at"),
    COALESCE(lec."updated_at", t."updated_at")
FROM topic_lesson_map m
JOIN "topics" t ON t."id" = m.topic_id
LEFT JOIN "lectures" lec ON lec."id" = m.lesson_id AND lec."topic_id" = t."id";

-- Anomalous: lectures hanging off a practice topic (should not exist). Keep as sibling theory
-- lessons so DROP lectures is lossless; do NOT put them on topic_lesson_map under the practice
-- topic (that would explode a class practice assignment into extra content items).
INSERT INTO "lessons" (
    "id", "kind", "course_id", "module_id", "class_id",
    "title", "video_url", "content", "order",
    "created_by", "updated_by", "created_at", "updated_at"
)
SELECT
    l."id",
    'theory'::"LessonKind",
    t."course_id",
    t."chapter_id",
    t."class_id",
    l."title",
    l."video_url",
    l."content",
    (
        COALESCE(
            (SELECT MAX(les."order") FROM "lessons" les
             WHERE les."module_id" IS NOT DISTINCT FROM t."chapter_id"
               AND les."class_id" IS NOT DISTINCT FROM t."class_id"),
            -1
        ) + ROW_NUMBER() OVER (
            PARTITION BY COALESCE(t."chapter_id", t."class_id")
            ORDER BY l."order", l."id"
        )
    )::int,
    t."created_by",
    t."updated_by",
    l."created_at",
    l."updated_at"
FROM "lectures" l
JOIN "topics" t ON t."id" = l."topic_id"
WHERE t."kind" = 'practice'
  AND NOT EXISTS (SELECT 1 FROM "lessons" les WHERE les."id" = l."id");

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_owner_check" CHECK (
    ("course_id" IS NOT NULL AND "module_id" IS NOT NULL AND "class_id" IS NULL)
    OR
    ("course_id" IS NULL AND "module_id" IS NULL AND "class_id" IS NOT NULL)
);

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_practice_no_media_check" CHECK (
    "kind" <> 'practice'
    OR ("video_url" IS NULL AND "content" IS NULL)
);

-- ---------------------------------------------------------------------------
-- 3. question_links: remap theory-with-lectures onto first lesson, then rename
-- ---------------------------------------------------------------------------
ALTER TABLE "question_links" DROP CONSTRAINT IF EXISTS "question_links_topic_id_fkey";

UPDATE "question_links" ql
SET "topic_id" = m.lesson_id
FROM topic_lesson_map m
WHERE m.topic_id = ql."topic_id"
  AND m.seq = 1
  AND ql."topic_id" IS DISTINCT FROM m.lesson_id;

DELETE FROM "question_links" ql
WHERE NOT EXISTS (
    SELECT 1 FROM "lessons" les WHERE les."id" = ql."topic_id"
);

ALTER TABLE "question_links" RENAME COLUMN "topic_id" TO "lesson_id";
ALTER INDEX IF EXISTS "question_links_topic_id_question_id_key" RENAME TO "question_links_lesson_id_question_id_key";
ALTER INDEX IF EXISTS "question_links_topic_id_idx" RENAME TO "question_links_lesson_id_idx";
ALTER TABLE "question_links" ADD CONSTRAINT "question_links_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Expand class_content_items (N lectures → N items) then point at lessons
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE content_snapshot AS
SELECT
    "id", "class_id", "topic_id", "sort_order", "kind",
    "open_at", "duration_minutes", "hidden_at", "hidden_by_staff_id", "created_at"
FROM "class_content_items"
WHERE "topic_id" IS NOT NULL;

ALTER TABLE "class_content_items" DROP CONSTRAINT IF EXISTS "class_content_items_topic_id_fkey";

-- Extra items for seq > 1 (keep original row for seq = 1: attempts + views stay there).
INSERT INTO "class_content_items" (
    "id", "class_id", "kind", "topic_id", "sort_order",
    "open_at", "duration_minutes", "hidden_at", "hidden_by_staff_id",
    "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    s."class_id",
    s."kind",
    m.lesson_id,
    s."sort_order",
    s."open_at",
    s."duration_minutes",
    s."hidden_at",
    s."hidden_by_staff_id",
    s."created_at",
    NOW()
FROM content_snapshot s
JOIN topic_lesson_map m ON m.topic_id = s."topic_id" AND m.seq > 1;

UPDATE "class_content_items" ci
SET "topic_id" = m.lesson_id, "updated_at" = NOW()
FROM content_snapshot s
JOIN topic_lesson_map m ON m.topic_id = s."topic_id" AND m.seq = 1
WHERE ci."id" = s."id"
  AND ci."topic_id" IS DISTINCT FROM m.lesson_id;

WITH ranked AS (
    SELECT
        ci."id",
        ROW_NUMBER() OVER (
            PARTITION BY ci."class_id"
            ORDER BY COALESCE(s."sort_order", ci."sort_order"), COALESCE(m.seq, 1), ci."id"
        ) - 1 AS new_sort
    FROM "class_content_items" ci
    LEFT JOIN topic_lesson_map m ON m.lesson_id = ci."topic_id"
    LEFT JOIN content_snapshot s
        ON s."topic_id" = m.topic_id AND s."class_id" = ci."class_id"
)
UPDATE "class_content_items" ci
SET "sort_order" = ranked.new_sort
FROM ranked
WHERE ci."id" = ranked."id";

ALTER TABLE "class_content_items" RENAME COLUMN "topic_id" TO "lesson_id";
ALTER INDEX IF EXISTS "class_content_items_class_id_topic_id_key" RENAME TO "class_content_items_class_id_lesson_id_key";
ALTER INDEX IF EXISTS "class_content_items_topic_id_idx" RENAME TO "class_content_items_lesson_id_idx";
ALTER TABLE "class_content_items" ADD CONSTRAINT "class_content_items_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Timeline: one content_item row per new content item; hidden copied
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE timeline_snapshot AS
SELECT
    "id", "class_id", "kind", "sort_order",
    "session_id", "class_survey_id", "class_content_item_id",
    "hidden_at", "hidden_by_staff_id", "created_at"
FROM "class_timeline_items";

CREATE TEMP TABLE new_content_extras AS
SELECT
    ci."id" AS content_item_id,
    ci."class_id",
    m.seq,
    s."id" AS orig_content_id,
    s."sort_order" AS orig_content_sort,
    ci."hidden_at",
    ci."hidden_by_staff_id",
    ci."created_at"
FROM "class_content_items" ci
JOIN topic_lesson_map m ON m.lesson_id = ci."lesson_id" AND m.seq > 1
JOIN content_snapshot s ON s."topic_id" = m.topic_id AND s."class_id" = ci."class_id";

INSERT INTO "class_timeline_items" (
    "id", "class_id", "kind", "sort_order", "class_content_item_id",
    "hidden_at", "hidden_by_staff_id", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    x."class_id",
    'content_item'::"ClassTimelineItemKind",
    COALESCE(t."sort_order", x.orig_content_sort),
    x.content_item_id,
    COALESCE(t."hidden_at", x."hidden_at"),
    COALESCE(t."hidden_by_staff_id", x."hidden_by_staff_id"),
    COALESCE(t."created_at", x."created_at"),
    NOW()
FROM new_content_extras x
LEFT JOIN timeline_snapshot t ON t."class_content_item_id" = x.orig_content_id
WHERE NOT EXISTS (
    SELECT 1 FROM "class_timeline_items" ti WHERE ti."class_content_item_id" = x.content_item_id
);

-- Any content item still missing a timeline row (including originals that never had one).
INSERT INTO "class_timeline_items" (
    "id", "class_id", "kind", "sort_order", "class_content_item_id",
    "hidden_at", "hidden_by_staff_id", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    ci."class_id",
    'content_item'::"ClassTimelineItemKind",
    ci."sort_order",
    ci."id",
    ci."hidden_at",
    ci."hidden_by_staff_id",
    ci."created_at",
    NOW()
FROM "class_content_items" ci
WHERE NOT EXISTS (
    SELECT 1 FROM "class_timeline_items" ti WHERE ti."class_content_item_id" = ci."id"
);

WITH ranked AS (
    SELECT
        ti."id",
        ROW_NUMBER() OVER (
            PARTITION BY ti."class_id"
            ORDER BY
                COALESCE(ts."sort_order", parent_ts."sort_order", ti."sort_order"),
                COALESCE(m.seq, 0),
                ti."id"
        ) - 1 AS new_sort
    FROM "class_timeline_items" ti
    LEFT JOIN timeline_snapshot ts ON ts."id" = ti."id"
    LEFT JOIN "class_content_items" ci ON ci."id" = ti."class_content_item_id"
    LEFT JOIN topic_lesson_map m ON m.lesson_id = ci."lesson_id"
    LEFT JOIN content_snapshot orig
        ON orig."topic_id" = m.topic_id AND orig."class_id" = ti."class_id"
    LEFT JOIN timeline_snapshot parent_ts
        ON parent_ts."class_content_item_id" = orig."id"
)
UPDATE "class_timeline_items" ti
SET "sort_order" = ranked.new_sort
FROM ranked
WHERE ti."id" = ranked."id";

-- ---------------------------------------------------------------------------
-- 6. lecture_quizzes / answers → lesson_*; views table rename
-- ---------------------------------------------------------------------------
ALTER TABLE "lecture_quizzes" DROP CONSTRAINT IF EXISTS "lecture_quizzes_lecture_id_fkey";
ALTER TABLE "lecture_quizzes" RENAME COLUMN "lecture_id" TO "lesson_id";
ALTER TABLE "lecture_quizzes" RENAME TO "lesson_quizzes";
ALTER INDEX IF EXISTS "lecture_quizzes_pkey" RENAME TO "lesson_quizzes_pkey";
ALTER INDEX IF EXISTS "lecture_quizzes_lecture_id_question_id_key" RENAME TO "lesson_quizzes_lesson_id_question_id_key";
ALTER INDEX IF EXISTS "lecture_quizzes_lecture_id_idx" RENAME TO "lesson_quizzes_lesson_id_idx";
ALTER INDEX IF EXISTS "lecture_quizzes_question_id_idx" RENAME TO "lesson_quizzes_question_id_idx";
ALTER TABLE "lesson_quizzes" RENAME CONSTRAINT "lecture_quizzes_question_id_fkey" TO "lesson_quizzes_question_id_fkey";
ALTER TABLE "lesson_quizzes" ADD CONSTRAINT "lesson_quizzes_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lecture_quiz_answers" DROP CONSTRAINT IF EXISTS "lecture_quiz_answers_lecture_id_fkey";
ALTER TABLE "lecture_quiz_answers" RENAME COLUMN "lecture_id" TO "lesson_id";
ALTER TABLE "lecture_quiz_answers" RENAME TO "lesson_quiz_answers";
ALTER INDEX IF EXISTS "lecture_quiz_answers_pkey" RENAME TO "lesson_quiz_answers_pkey";
ALTER INDEX IF EXISTS "lecture_quiz_answers_lecture_id_question_id_student_id_key" RENAME TO "lesson_quiz_answers_lesson_id_question_id_student_id_key";
ALTER INDEX IF EXISTS "lecture_quiz_answers_lecture_id_idx" RENAME TO "lesson_quiz_answers_lesson_id_idx";
ALTER INDEX IF EXISTS "lecture_quiz_answers_question_id_idx" RENAME TO "lesson_quiz_answers_question_id_idx";
ALTER INDEX IF EXISTS "lecture_quiz_answers_student_id_idx" RENAME TO "lesson_quiz_answers_student_id_idx";
ALTER TABLE "lesson_quiz_answers" RENAME CONSTRAINT "lecture_quiz_answers_question_id_fkey" TO "lesson_quiz_answers_question_id_fkey";
ALTER TABLE "lesson_quiz_answers" RENAME CONSTRAINT "lecture_quiz_answers_student_id_fkey" TO "lesson_quiz_answers_student_id_fkey";
ALTER TABLE "lesson_quiz_answers" ADD CONSTRAINT "lesson_quiz_answers_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_theory_topic_views" RENAME TO "class_theory_lesson_views";
ALTER INDEX IF EXISTS "class_theory_topic_views_pkey" RENAME TO "class_theory_lesson_views_pkey";
ALTER INDEX IF EXISTS "class_theory_topic_views_class_content_item_id_student_id_key"
    RENAME TO "ctlv_cci_student_id_key";
ALTER INDEX IF EXISTS "class_theory_topic_views_student_id_idx"
    RENAME TO "class_theory_lesson_views_student_id_idx";
-- Identifier is 64 chars; Postgres stores it truncated to 63 (`..._at_id`).
ALTER INDEX IF EXISTS "class_theory_topic_views_class_content_item_id_last_viewed_at_idx"
    RENAME TO "ctlv_cci_last_viewed_at_idx";
ALTER TABLE "class_theory_lesson_views"
    RENAME CONSTRAINT "class_theory_topic_views_class_content_item_id_fkey"
    TO "class_theory_lesson_views_class_content_item_id_fkey";
ALTER TABLE "class_theory_lesson_views"
    RENAME CONSTRAINT "class_theory_topic_views_student_id_fkey"
    TO "class_theory_lesson_views_student_id_fkey";

-- ---------------------------------------------------------------------------
-- 7. Drop old tables; rename ClassContentItemKind value
-- ---------------------------------------------------------------------------
DROP TABLE "lectures";
DROP TABLE "topics";

ALTER TYPE "ClassContentItemKind" RENAME VALUE 'topic' TO 'lesson';
ALTER TABLE "class_content_items" ALTER COLUMN "kind" SET DEFAULT 'lesson';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('chapters', 'topics', 'lectures')
  ) THEN
    RAISE EXCEPTION 'old content tables still present after three-level rename';
  END IF;
END $$;
