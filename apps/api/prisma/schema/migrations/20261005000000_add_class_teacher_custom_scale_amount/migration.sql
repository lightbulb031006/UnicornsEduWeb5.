-- Scale riêng của gia sư theo lớp. Null = theo classes.scale_amount; 0 = không có scale.
-- Chỉ đọc lúc tạo buổi (snapshot_scale_amount), không tính lại buổi đã có.
ALTER TABLE "class_teachers"
  ADD COLUMN IF NOT EXISTS "custom_scale_amount" INTEGER;
