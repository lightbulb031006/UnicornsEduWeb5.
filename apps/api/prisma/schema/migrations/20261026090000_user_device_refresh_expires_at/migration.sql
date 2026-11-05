-- Migration: user_device_refresh_expires_at
--
-- Thiết bị học sinh được coi là "đang đăng nhập" tới 60 ngày không hoạt động,
-- trong khi refresh token chỉ sống 1 ngày (30 ngày khi tick «Ghi nhớ»). Cookie
-- hết hạn nhưng row `user_devices` vẫn chặn đăng nhập với `DEVICE_ACTIVE`.
-- Lưu hạn refresh token để luật một thiết bị chỉ tính thiết bị còn phiên thật.

ALTER TABLE "user_devices" ADD COLUMN "refresh_expires_at" TIMESTAMPTZ(6);

-- Row cũ không biết rememberMe.
-- - Học sinh: lấy 1 ngày kể từ lần hoạt động cuối. Lấy 30 ngày thì học sinh
--   đang bị chặn oan (cookie 1 ngày đã chết) vẫn bị chặn tới 30 ngày sau
--   deploy. Học sinh «Ghi nhớ» đang dùng sẽ được ghi lại hạn đúng ở lần
--   refresh kế tiếp; ai bỏ máy > 1 ngày chỉ phải đăng nhập lại một lần (không
--   bị chặn, vì row đã hết hạn).
-- - Staff/admin: không áp luật một thiết bị, giữ cận trên 30 ngày để không cắt
--   phiên «Ghi nhớ» còn hiệu lực.
UPDATE "user_devices" AS d
SET "refresh_expires_at" = d."last_active_at" + CASE
    WHEN u."role_type" = 'student' THEN INTERVAL '1 day'
    ELSE INTERVAL '30 days'
  END
FROM "users" AS u
WHERE u."id" = d."user_id"
  AND d."refresh_expires_at" IS NULL;

CREATE INDEX "user_devices_refresh_expires_at_idx" ON "user_devices"("refresh_expires_at");
