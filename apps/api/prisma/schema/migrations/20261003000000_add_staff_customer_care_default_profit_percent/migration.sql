-- % mặc định của nhân sự CSKH (phân số 0.00–0.99, cùng đơn vị `customer_care_service.profit_percent`).
-- Áp vào `customer_care_service.profit_percent` khi CSKH được gán vào học sinh.
-- NOT NULL DEFAULT 0 backfill 0% cho mọi nhân sự hiện có (gồm CSKH đang hoạt động).
ALTER TABLE "staff_info" ADD COLUMN "customer_care_default_profit_percent" DECIMAL(2,2) NOT NULL DEFAULT 0;
