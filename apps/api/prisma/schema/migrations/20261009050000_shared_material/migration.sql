-- Tư liệu dùng chung (hồ sơ JP): đoạn văn/ảnh nhiều câu cùng dựa vào.
CREATE TABLE "shared_materials" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shared_materials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shared_materials_course_id_idx" ON "shared_materials"("course_id");

ALTER TABLE "shared_materials" ADD CONSTRAINT "shared_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "questions" ADD COLUMN "shared_material_id" TEXT;

CREATE INDEX "questions_shared_material_id_idx" ON "questions"("shared_material_id");

ALTER TABLE "questions" ADD CONSTRAINT "questions_shared_material_id_fkey" FOREIGN KEY ("shared_material_id") REFERENCES "shared_materials"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Snapshot lúc start: id để gom khối, content để hiển thị.
ALTER TABLE "attempt_answers" ADD COLUMN "shared_material_id" TEXT,
ADD COLUMN "shared_material_content" TEXT;
