-- Migration: reset_student_passwords
--
-- Đặt lại mật khẩu của mọi tài khoản học sinh (users.role_type = 'student') về "123456".
-- Hash là bcrypt cost 10 (cùng cost với AuthService: bcrypt.hash(password, 10)),
-- sinh sẵn bằng node bcrypt và đã kiểm tra bcrypt.compare('123456', hash) === true.
-- Dùng literal để không phụ thuộc pgcrypto và để kết quả xác định.

UPDATE "users"
SET "password_hash" = '$2b$10$rYE6L/T4YsO4WUA2l8wQTOzoIeHCqO4DV7gZ/9..ISq8dw3/Zw0le',
    "updated_at" = now()
WHERE "role_type" = 'student';
