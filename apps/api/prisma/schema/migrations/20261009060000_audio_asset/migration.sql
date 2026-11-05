-- Audio làm tư liệu (hồ sơ JP): bucket private `question-audio`, đọc qua signed URL.
CREATE TABLE "audio_assets" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audio_assets_course_id_idx" ON "audio_assets"("course_id");

ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shared_materials" ADD COLUMN "audio_id" TEXT;

ALTER TABLE "shared_materials" ADD CONSTRAINT "shared_materials_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "questions" ADD COLUMN "audio_id" TEXT;

ALTER TABLE "questions" ADD CONSTRAINT "questions_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Snapshot lúc start (không FK — asset bất biến, giữ cho bài đã làm).
ALTER TABLE "attempt_answers" ADD COLUMN "audio_id" TEXT,
ADD COLUMN "shared_material_audio_id" TEXT;
