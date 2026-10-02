-- RenameClassCategoryToCourse
-- ADR: 2026-09-05-class-category-becomes-course.md (Accepted)
-- Migration in-place: ALTER TABLE ... RENAME, no CREATE TABLE courses, no INSERT ... SELECT copy.

-- 1. Rename table
ALTER TABLE "class_categories" RENAME TO "courses";

-- 2. Rename FK column on classes
ALTER TABLE "classes" RENAME COLUMN "class_category_id" TO "course_id";

-- 3. Rename indexes that reference the old column name
ALTER INDEX IF EXISTS "classes_class_category_id_idx" RENAME TO "classes_course_id_idx";

-- 4. Rename FK constraint
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_class_category_id_fkey";
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Add new column for default duration
ALTER TABLE "courses" ADD COLUMN "default_duration_days" INTEGER;

-- 6. Create course_difficulty_levels table
CREATE TABLE "course_difficulty_levels" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "course_difficulty_levels_pkey" PRIMARY KEY ("id")
);

-- 7. Unique constraint: one difficulty level name per course
CREATE UNIQUE INDEX "course_difficulty_levels_course_id_name_key" ON "course_difficulty_levels"("course_id", "name");

-- 8. FK index
CREATE INDEX "course_difficulty_levels_course_id_idx" ON "course_difficulty_levels"("course_id");
