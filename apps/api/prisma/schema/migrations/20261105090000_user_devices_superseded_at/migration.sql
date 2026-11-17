-- Migration: user_devices_superseded_at
--
-- Học sinh bị chặn `DEVICE_ACTIVE` được tự đăng xuất mọi thiết bị rồi đăng
-- nhập máy hiện tại (máy đăng nhập sau cùng thắng). Lưu mốc thời điểm đó để
-- máy bị đá nhận `DEVICE_SUPERSEDED` («tài khoản vừa đăng nhập ở thiết bị
-- khác») thay vì `NO_ACTIVE_DEVICE` («phiên hết hạn»): token cấp trước mốc này
-- mà không còn `UserDevice` là máy bị đá.

ALTER TABLE "users" ADD COLUMN "devices_superseded_at" TIMESTAMPTZ(6);
