-- Lưu đúng mức trợ cấp / học sinh / buổi admin nhập cho gia sư trên lớp.
-- `custom_allowance` lưu theo block 30 phút (ROUND(giá_buổi / số_block_chuẩn)),
-- nhân ngược không ra số cũ khi không chia hết: 70000 / 3 → 23333 → 69999.
-- Cột mới là nguồn sự thật của mức theo buổi; `custom_allowance` giữ mức per-block.

ALTER TABLE "class_teachers"
  ADD COLUMN "custom_allowance_per_session" INTEGER;

-- Backfill: dựng lại mức theo buổi như API đang hiển thị (per-block × số block chuẩn
-- = GCD các khung lịch đang hiệu lực), rồi snap về số tròn gần nhất (1000 / 500 /
-- 100 / 10đ) nếu số đó chia lại ra đúng giá trị per-block đang lưu.
DO $$
DECLARE
  rec RECORD;
  slot RECORD;
  blocks INTEGER;
  slot_blocks INTEGER;
  slot_minutes INTEGER;
  rebuilt INTEGER;
  candidate INTEGER;
  step INTEGER;
BEGIN
  FOR rec IN
    SELECT ct.id, ct.class_id, ct.custom_allowance, c.allowance_per_block_per_student
    FROM class_teachers ct
    JOIN classes c ON c.id = ct.class_id
    WHERE ct.custom_allowance IS NOT NULL
  LOOP
    -- Lớp chưa backfill per-block: custom_allowance vẫn là mức theo buổi.
    IF rec.allowance_per_block_per_student IS NULL THEN
      UPDATE class_teachers
      SET custom_allowance_per_session = rec.custom_allowance
      WHERE id = rec.id;
      CONTINUE;
    END IF;

    blocks := NULL;
    FOR slot IN
      SELECT e."from", e."to"
      FROM class_schedule_entries e
      WHERE e.class_id = rec.class_id AND e.effective_to IS NULL
    LOOP
      IF slot."from" !~ '^\d{2}:\d{2}(:\d{2})?$' OR slot."to" !~ '^\d{2}:\d{2}(:\d{2})?$' THEN
        blocks := NULL;
        EXIT;
      END IF;
      slot_minutes := EXTRACT(EPOCH FROM (slot."to"::time - slot."from"::time))::integer / 60;
      IF slot_minutes <= 0 OR MOD(slot_minutes, 30) <> 0 THEN
        blocks := NULL;
        EXIT;
      END IF;
      slot_blocks := slot_minutes / 30;
      blocks := CASE WHEN blocks IS NULL THEN slot_blocks ELSE gcd(blocks, slot_blocks) END;
    END LOOP;

    IF blocks IS NULL OR blocks <= 0 THEN
      rebuilt := rec.custom_allowance;
    ELSE
      rebuilt := rec.custom_allowance * blocks;
      FOREACH step IN ARRAY ARRAY[1000, 500, 100, 10] LOOP
        candidate := (ROUND(rebuilt::numeric / step) * step)::integer;
        IF ROUND(candidate::numeric / blocks) = rec.custom_allowance THEN
          rebuilt := candidate;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    UPDATE class_teachers
    SET custom_allowance_per_session = rebuilt
    WHERE id = rec.id;
  END LOOP;
END $$;
