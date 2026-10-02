-- Bỏ mã phân loại lớp (code) khỏi class_categories; id (uuid) đã tự sinh, chỉ cần name.
ALTER TABLE "class_categories" DROP COLUMN "code";
