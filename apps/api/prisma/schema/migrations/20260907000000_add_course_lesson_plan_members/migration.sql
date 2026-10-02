-- AddCourseLessonPlanMember
-- Đội giáo án của một Khoá học: bảng quan hệ course–staff.
CREATE TABLE "course_lesson_plan_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "course_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "course_lesson_plan_members_pkey" PRIMARY KEY ("id")
);

-- Unique: one staff per course
CREATE UNIQUE INDEX "course_lesson_plan_members_course_id_staff_id_key" ON "course_lesson_plan_members"("course_id", "staff_id");

-- FK indexes
CREATE INDEX "course_lesson_plan_members_course_id_idx" ON "course_lesson_plan_members"("course_id");
CREATE INDEX "course_lesson_plan_members_staff_id_idx" ON "course_lesson_plan_members"("staff_id");

-- FK constraints
ALTER TABLE "course_lesson_plan_members" ADD CONSTRAINT "course_lesson_plan_members_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_lesson_plan_members" ADD CONSTRAINT "course_lesson_plan_members_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
