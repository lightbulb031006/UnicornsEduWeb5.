-- Hồ sơ tạo trước cột Nguồn khách còn customer_source NULL.
-- Gán Khác + chú thích cố định. Hồ sơ đã có nguồn không bị đụng.
-- NULL còn lại sau câu này (nếu có) vẫn là Chưa gán.

UPDATE "student_info"
SET
  "customer_source" = 'other',
  "customer_source_note" = 'Nguồn cũ'
WHERE "customer_source" IS NULL;
