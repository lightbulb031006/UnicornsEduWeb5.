-- Thời lượng làm bài chuyển từ lần giao lên tiết thực hành (cấp khoá).
ALTER TABLE "lessons" ADD COLUMN "duration_minutes" INTEGER;

-- Backfill: tiết thực hành lấy thời lượng của lần giao gần nhất; chưa giao lần nào → 60 phút.
UPDATE "lessons" l
SET "duration_minutes" = COALESCE(
  (
    SELECT cci."duration_minutes"
    FROM "class_content_items" cci
    WHERE cci."lesson_id" = l."id" AND cci."duration_minutes" IS NOT NULL
    ORDER BY cci."created_at" DESC
    LIMIT 1
  ),
  60
)
WHERE l."kind" = 'practice';

-- Lần giao cũ giữ nguyên `class_content_items.duration_minutes` (thời lượng đã chốt).
