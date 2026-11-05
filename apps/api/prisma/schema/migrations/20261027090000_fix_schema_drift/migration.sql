-- Đưa DB khớp lại schema Prisma (drift phát hiện khi `prisma migrate diff` trên bản copy production).
-- Các default cột (id/updated_at/level) vốn đã có trong DB từ migration cũ → khai báo vào schema,
-- không đổi DB. Migration này chỉ sửa những gì schema không thể mô tả khác đi.

-- 1. Khoá ngoại thiếu: xoá khoá học để lại mức độ khó mồ côi.
--    Bảng được tạo không có FK ở 20260906000000_rename_class_category_to_course.
ALTER TABLE "course_difficulty_levels"
  ADD CONSTRAINT "course_difficulty_levels_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Khoá chính còn giữ tên bảng cũ class_categories.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_categories_pkey' AND conrelid = '"courses"'::regclass
  ) THEN
    ALTER TABLE "courses" RENAME CONSTRAINT "class_categories_pkey" TO "courses_pkey";
  END IF;
END $$;

-- 3. FK class_content_items → classes thiếu ON UPDATE CASCADE (mặc định của Prisma).
ALTER TABLE "class_content_items" DROP CONSTRAINT IF EXISTS "class_content_items_class_id_fkey";
ALTER TABLE "class_content_items"
  ADD CONSTRAINT "class_content_items_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
