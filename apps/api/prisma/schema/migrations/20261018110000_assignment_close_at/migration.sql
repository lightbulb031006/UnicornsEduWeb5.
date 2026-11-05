-- Hạn làm bài trên lần giao, độc lập với thời lượng (trước đây hạn = open_at + duration).
ALTER TABLE "class_content_items" ADD COLUMN "close_at" TIMESTAMPTZ(6);

-- Backfill lần giao (tiết thực hành) = hạn xem nội dung của lớp; lớp không có hạn → null.
UPDATE "class_content_items" cci
SET "close_at" = c."content_access_expires_at"::timestamptz
FROM "classes" c, "lessons" l
WHERE cci."class_id" = c."id"
  AND cci."lesson_id" = l."id"
  AND l."kind" = 'practice'
  AND c."content_access_expires_at" IS NOT NULL;
