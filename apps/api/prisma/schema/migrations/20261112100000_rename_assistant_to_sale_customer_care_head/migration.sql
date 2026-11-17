-- #268 Đổi tên role Trợ lí thành Trưởng phòng Sale & CSKH (biên bản docs/meetings/2026-11-12-bien-ban.md).
-- StaffRole.assistant                 → StaffRole.sale_customer_care_head
-- RegulationAudience.staff_assistant  → RegulationAudience.staff_sale_customer_care_head
--
-- Đổi tên giá trị enum TẠI CHỖ (`ALTER TYPE ... RENAME VALUE`, Postgres ≥ 10): mọi dòng đang
-- dùng giá trị cũ — cột đơn (role_type ở thuế/lương cứng/trợ cấp thêm/lesson_outputs) lẫn
-- cột mảng (staff_info.roles, notifications.target_staff_roles, regulations.audiences) — tự
-- mang giá trị mới vì Postgres lưu enum theo OID, không theo nhãn. Không đụng dữ liệu, không
-- tạo lại tài khoản: người đang là Trợ lí tự thành Trưởng phòng Sale & CSKH.
--
-- Không đổi tên cột: các cột `attendance.assistant_*` (quan hệ Trưởng phòng quản lí CSKH,
-- hoa hồng trưởng phòng) giữ nguyên, Prisma map qua `@map` sang field `saleCsHead*`.
--
-- Idempotent: chỉ đổi khi giá trị cũ còn và giá trị mới chưa có.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'StaffRole'
       AND n.nspname = current_schema()
       AND e.enumlabel = 'assistant'
  ) THEN
    ALTER TYPE "StaffRole" RENAME VALUE 'assistant' TO 'sale_customer_care_head';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'RegulationAudience'
       AND n.nspname = current_schema()
       AND e.enumlabel = 'staff_assistant'
  ) THEN
    ALTER TYPE "RegulationAudience" RENAME VALUE 'staff_assistant' TO 'staff_sale_customer_care_head';
  END IF;
END
$$;
