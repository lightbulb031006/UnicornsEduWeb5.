-- Nguồn khách «Khách cũ», đặt ngay trước «Khác». Không đổi dữ liệu nguồn đang có.
ALTER TYPE "StudentCustomerSource" ADD VALUE IF NOT EXISTS 'returning_customer' BEFORE 'other';
