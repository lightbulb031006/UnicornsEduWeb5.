-- #266 Bỏ role Kế toán chung (biên bản docs/meetings/2026-11-12-bien-ban.md).
-- Xoá StaffRole.accountant và RegulationAudience.staff_accountant.
-- Giữ nguyên accountant_income / accountant_expense (Kế toán thu / Kế toán chi).
--
-- Postgres không hỗ trợ `ALTER TYPE ... DROP VALUE`, nên dùng kỹ thuật chuẩn:
--   đổi tên type cũ → tạo type mới không có giá trị → ALTER mọi cột (kể cả mảng)
--   sang type mới qua ::text → khôi phục default → DROP type cũ.
--
-- Migration KHÔNG tự xoá/đổi dữ liệu: nếu còn bất kỳ dòng nào dùng giá trị bị bỏ
-- (cột đơn hoặc phần tử mảng, ở mọi bảng có cột kiểu enum đó) thì RAISE EXCEPTION,
-- liệt kê bảng/cột/số dòng và dừng toàn bộ migration. Dọn dữ liệu thủ công rồi chạy lại.
-- Cột được dò tự động qua pg_catalog nên không bỏ sót bảng nào dùng enum.

CREATE FUNCTION pg_temp.uniedu_drop_enum_value(p_type TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_type_oid  OID;
  v_array_oid OID;
  v_old_type  TEXT := p_type || '_old';
  v_labels    TEXT;
  v_offenders TEXT := '';
  v_count     BIGINT;
  v_default   TEXT;
  v_is_array  BOOLEAN;
  r           RECORD;
BEGIN
  SELECT t.oid, t.typarray
    INTO v_type_oid, v_array_oid
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE t.typname = p_type
     AND n.nspname = current_schema();

  IF v_type_oid IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy enum "%" trong schema "%".', p_type, current_schema();
  END IF;

  -- Đã bỏ trước đó → không làm gì (idempotent).
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = v_type_oid AND enumlabel = p_value
  ) THEN
    RETURN;
  END IF;

  -- 1. Chặn nếu còn dữ liệu dùng giá trị.
  FOR r IN
    SELECT n.nspname, c.relname, a.attname, a.atttypid
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE a.atttypid IN (v_type_oid, v_array_oid)
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND c.relkind IN ('r', 'p')
       AND NOT c.relispartition
     ORDER BY n.nspname, c.relname, a.attname
  LOOP
    IF r.atttypid = v_type_oid THEN
      EXECUTE format(
        'SELECT count(*) FROM %I.%I WHERE %I::text = $1',
        r.nspname, r.relname, r.attname
      ) INTO v_count USING p_value;
    ELSE
      EXECUTE format(
        'SELECT count(*) FROM %I.%I WHERE $1 = ANY (%I::text[])',
        r.nspname, r.relname, r.attname
      ) INTO v_count USING p_value;
    END IF;

    IF v_count > 0 THEN
      v_offenders := v_offenders
        || format(E'\n  - %I.%I.%I: %s dòng', r.nspname, r.relname, r.attname, v_count);
    END IF;
  END LOOP;

  IF v_offenders <> '' THEN
    RAISE EXCEPTION 'Không thể xoá giá trị "%" khỏi enum "%": vẫn còn dữ liệu dùng giá trị này:%',
      p_value, p_type, v_offenders
      USING HINT = 'Gỡ/đổi giá trị này khỏi các dòng trên (ví dụ chuyển sang accountant_income / accountant_expense) rồi chạy lại migration. Migration không tự xoá dữ liệu.';
  END IF;

  -- 2. Tạo type mới không có giá trị bị bỏ (giữ thứ tự cũ).
  SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
    INTO v_labels
    FROM pg_enum
   WHERE enumtypid = v_type_oid
     AND enumlabel <> p_value;

  EXECUTE format('ALTER TYPE %I RENAME TO %I', p_type, v_old_type);
  EXECUTE format('CREATE TYPE %I AS ENUM (%s)', p_type, v_labels);

  -- 3. Chuyển mọi cột (đơn + mảng) sang type mới, giữ default.
  FOR r IN
    SELECT n.nspname, c.oid AS relid, c.relname, a.attnum, a.attname, a.atttypid
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE a.atttypid IN (v_type_oid, v_array_oid)
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND c.relkind IN ('r', 'p')
       AND NOT c.relispartition
     ORDER BY n.nspname, c.relname, a.attname
  LOOP
    v_is_array := r.atttypid = v_array_oid;

    SELECT pg_get_expr(d.adbin, d.adrelid)
      INTO v_default
      FROM pg_attrdef d
     WHERE d.adrelid = r.relid
       AND d.adnum = r.attnum;

    IF v_default IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',
        r.nspname, r.relname, r.attname);
    END IF;

    IF v_is_array THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I[] USING %I::text[]::%I[]',
        r.nspname, r.relname, r.attname, p_type, r.attname, p_type
      );
    ELSE
      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I USING %I::text::%I',
        r.nspname, r.relname, r.attname, p_type, r.attname, p_type
      );
    END IF;

    IF v_default IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s',
        r.nspname, r.relname, r.attname,
        replace(v_default, quote_ident(v_old_type), quote_ident(p_type)));
    END IF;
  END LOOP;

  EXECUTE format('DROP TYPE %I', v_old_type);
END;
$$;

SELECT pg_temp.uniedu_drop_enum_value('StaffRole', 'accountant');
SELECT pg_temp.uniedu_drop_enum_value('RegulationAudience', 'staff_accountant');

DROP FUNCTION pg_temp.uniedu_drop_enum_value(TEXT, TEXT);
