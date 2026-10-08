-- Test migration 20261004000000_one_time_course_setting trên DB local (KHÔNG chạy trên DB dùng chung/production).
-- Toàn bộ chạy trong một transaction rồi ROLLBACK: gỡ tạm cột của migration, nạp fixture
-- theo schema cũ, chạy đúng file migration, assert, rồi hoàn tác sạch.
-- DB đã có lớp thật THPTQG 02 / PREVOI 02 (bản sao prod) thì đổi tạm id của chúng (FK
-- ON UPDATE CASCADE kéo theo) để fixture dùng đúng id lớp mà migration nhắm tới.
--
--   cd apps/api && psql "<local url>" -v ON_ERROR_STOP=1 -f prisma/tests/20261004000000_one_time_course_setting.test.sql
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE "courses" DROP COLUMN IF EXISTS "is_one_time";
UPDATE "classes" SET "id" = "id" || '-t08orig' WHERE "id" IN ('UNICL-c1f789b32e', 'UNICL-dc32916487');
-- Học sinh được giảm giá (đăng ký chung) có id cố định trong migration: đổi tạm id bản thật.
UPDATE "student_info" SET "id" = "id" || '-t08orig' WHERE "id" = 'UNIST-9b344d2867';
-- Khoá thật cùng tên trên DB local không được dính vào fixture.
UPDATE "courses" SET "name" = "name" || ' (t08 orig)' WHERE "name" IN ('THPTQG', 'PREVOI');

INSERT INTO "courses" ("id", "name", "updated_at") VALUES
  ('t08-basic', 't08 basic', NOW()),
  ('t08-qg', 'THPTQG', NOW()),
  ('t08-pv', 'PREVOI', NOW());
INSERT INTO "classes" ("id", "name", "course_id", "pricing_mode", "tuition_package_total", "updated_at") VALUES
  ('UNICL-c1f789b32e', 't08 QG 02', 't08-basic', 'per_session', 1600000, NOW()),
  ('UNICL-dc32916487', 't08 PV 02', 't08-pv', 'one_time', 3000000, NOW());
INSERT INTO "student_info" ("id", "full_name", "account_balance", "updated_at") VALUES
  ('t08-s1', 't08 s1', 100000, NOW()),
  ('t08-s2', 't08 s2', 0, NOW()),
  ('t08-s3', 't08 s3', 50000, NOW()),
  ('t08-s4', 't08 s4', 200000, NOW()),
  ('UNIST-9b344d2867', 't08 s5', 0, NOW());
INSERT INTO "student_classes" ("id", "student_id", "class_id", "status", "custom_tuition_package_total") VALUES
  ('t08-sc1', 't08-s1', 'UNICL-c1f789b32e', 'active', 0),
  ('t08-sc2', 't08-s2', 'UNICL-c1f789b32e', 'active', 1000000),
  ('t08-sc3', 't08-s3', 'UNICL-c1f789b32e', 'inactive', NULL),
  ('t08-sc4', 't08-s4', 'UNICL-dc32916487', 'active', NULL),
  ('t08-sc5', 'UNIST-9b344d2867', 'UNICL-c1f789b32e', 'active', 1600000);
INSERT INTO "sessions" ("id", "teacher_id", "class_id", "date", "start_time", "updated_at")
SELECT v.id, (SELECT "id" FROM "staff_info" ORDER BY "id" LIMIT 1), v.class_id, v.d::date, v.t::time, NOW()
FROM (VALUES
  ('t08-q1', 'UNICL-c1f789b32e', '2026-08-10', '18:00'),
  ('t08-q2', 'UNICL-c1f789b32e', '2026-08-12', '18:00'),
  ('t08-q3', 'UNICL-c1f789b32e', '2026-08-14', '18:00'),
  ('t08-p1', 'UNICL-dc32916487', '2026-08-11', '19:30')
) AS v(id, class_id, d, t);

INSERT INTO "wallet_transactions_history" ("id", "student_id", "type", "amount", "note", "date") VALUES
  ('t08-w1a', 't08-s1', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-10. | Số dư: x', '2026-08-10'),
  ('t08-w1b', 't08-s1', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-12. | Số dư: x', '2026-08-12'),
  ('t08-w1c', 't08-s1', 'repayment', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-14. | Số dư: x', '2026-08-14'),
  -- Giao dịch sửa buổi mất link + một lần hoàn: chỉ khớp qua note.
  ('t08-w1d', 't08-s1', 'repayment', 40000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-12. | Số dư: x', '2026-08-13'),
  ('t08-w1e', 't08-s1', 'topup', 20000, 'Hoàn trả số dư lớp t08 QG 02 buổi học 2026-08-12. | Số dư: x', '2026-08-13'),
  -- Lớp khác, nạp tiền: giữ nguyên.
  ('t08-w1f', 't08-s1', 'extend', 30000, 'Đóng học phí lớp t08 khác buổi học 2026-08-10. | Số dư: x', '2026-08-10'),
  ('t08-w1g', 't08-s1', 'topup', 500000, 'Nạp tiền', '2026-08-01'),
  ('t08-w2b', 't08-s2', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-12. | Số dư: x', '2026-08-12'),
  ('t08-w2c', 't08-s2', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-14. | Số dư: x', '2026-08-14'),
  ('t08-w3a', 't08-s3', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-10. | Số dư: x', '2026-08-10'),
  ('t08-w3b', 't08-s3', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-12. | Số dư: x', '2026-08-12'),
  ('t08-w3c', 't08-s3', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-14. | Số dư: x', '2026-08-14'),
  ('t08-w4a', 't08-s4', 'extend', 91400, 'Đóng học phí lớp t08 PV 02 buổi học 2026-08-11. | Số dư: x', '2026-08-11'),
  ('t08-w5b', 'UNIST-9b344d2867', 'extend', 20000, 'Đóng học phí lớp t08 QG 02 buổi học 2026-08-12. | Số dư: x', '2026-08-12');

INSERT INTO "attendance" ("id", "session_id", "student_id", "status", "tuition_fee", "transaction_id") VALUES
  ('t08-a1-q1', 't08-q1', 't08-s1', 'present', 20000, 't08-w1a'),
  ('t08-a1-q2', 't08-q2', 't08-s1', 'present', 20000, 't08-w1b'),
  ('t08-a1-q3', 't08-q3', 't08-s1', 'excused', 20000, 't08-w1c'),
  ('t08-a2-q1', 't08-q1', 't08-s2', 'absent', 0, NULL),
  ('t08-a2-q2', 't08-q2', 't08-s2', 'present', 20000, 't08-w2b'),
  ('t08-a2-q3', 't08-q3', 't08-s2', 'present', 20000, 't08-w2c'),
  ('t08-a3-q1', 't08-q1', 't08-s3', 'present', 20000, 't08-w3a'),
  ('t08-a3-q2', 't08-q2', 't08-s3', 'present', 20000, 't08-w3b'),
  ('t08-a3-q3', 't08-q3', 't08-s3', 'present', 20000, 't08-w3c'),
  ('t08-a4-p1', 't08-p1', 't08-s4', 'present', 91400, 't08-w4a'),
  ('t08-a5-q2', 't08-q2', 'UNIST-9b344d2867', 'present', 20000, 't08-w5b');

\i prisma/schema/migrations/20261004000000_one_time_course_setting/migration.sql

DO $$
DECLARE
  n int;
  v text;
BEGIN
  SELECT string_agg("id" || ':' || "is_one_time", ',' ORDER BY "id") INTO v
    FROM "courses" WHERE "id" LIKE 't08-%';
  IF v IS DISTINCT FROM 't08-basic:false,t08-pv:true,t08-qg:true' THEN
    RAISE EXCEPTION 'is_one_time sai: %', v;
  END IF;

  SELECT string_agg("id" || ':' || "course_id" || ':' || "pricing_mode", ',' ORDER BY "id") INTO v
    FROM "classes" WHERE "id" IN ('UNICL-c1f789b32e', 'UNICL-dc32916487');
  IF v IS DISTINCT FROM 'UNICL-c1f789b32e:t08-qg:one_time,UNICL-dc32916487:t08-pv:one_time' THEN
    RAISE EXCEPTION 'lớp sai: %', v;
  END IF;

  -- Giảm giá đăng ký chung: gói riêng 1.6tr → 1.44tr; học sinh khác giữ gói riêng.
  SELECT string_agg("id" || ':' || COALESCE("custom_tuition_package_total"::text, '-'), ',' ORDER BY "id") INTO v
    FROM "student_classes" WHERE "id" LIKE 't08-%';
  IF v IS DISTINCT FROM 't08-sc1:0,t08-sc2:1000000,t08-sc3:-,t08-sc4:-,t08-sc5:1440000' THEN
    RAISE EXCEPTION 'gói riêng sai: %', v;
  END IF;

  -- s5 (giảm giá): 0 + 20k − 1.44tr.
  SELECT "account_balance"::text INTO v FROM "student_info" WHERE "id" = 'UNIST-9b344d2867';
  IF v IS DISTINCT FROM '-1420000' THEN
    RAISE EXCEPTION 'số dư học sinh giảm giá sai: %', v;
  END IF;

  -- s1: 100k + (20+20+20+40 − 20 hoàn) − 1.6tr gói lớp (gói riêng 0đ = không có).
  -- s2: 0 + 40k − 1tr gói riêng. s3 nghỉ: không đổi. s4: 200k + 91.4k − 3tr.
  SELECT string_agg("id" || ':' || "account_balance", ',' ORDER BY "id") INTO v
    FROM "student_info" WHERE "id" LIKE 't08-%';
  IF v IS DISTINCT FROM 't08-s1:-1420000,t08-s2:-960000,t08-s3:50000,t08-s4:-2708600' THEN
    RAISE EXCEPTION 'số dư sai: %', v;
  END IF;

  -- Giao dịch còn lại: s1 giữ lớp khác + nạp tiền, s3 giữ 3 giao dịch theo buổi.
  SELECT string_agg("id", ',' ORDER BY "id") INTO v
    FROM "wallet_transactions_history" WHERE "id" LIKE 't08-%';
  IF v IS DISTINCT FROM 't08-w1f,t08-w1g,t08-w3a,t08-w3b,t08-w3c' THEN
    RAISE EXCEPTION 'giao dịch cũ sai: %', v;
  END IF;

  SELECT string_agg(w."student_id" || ':' || w."type" || ':' || w."amount" || ':' || w."date"
      || ':' || (w."created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::text, ',' ORDER BY w."student_id") INTO v
    FROM "wallet_transactions_history" w
    WHERE (w."student_id" LIKE 't08-%' OR w."student_id" = 'UNIST-9b344d2867') AND w."id" NOT LIKE 't08-%';
  IF v IS DISTINCT FROM
    't08-s1:extend:1600000:2026-08-10:2026-08-10 18:00:00,'
    || 't08-s2:extend:1000000:2026-08-12:2026-08-12 18:00:00,'
    || 't08-s4:extend:3000000:2026-08-11:2026-08-11 19:30:00,'
    || 'UNIST-9b344d2867:extend:1440000:2026-08-12:2026-08-12 18:00:00' THEN
    RAISE EXCEPTION 'giao dịch gói sai: %', v;
  END IF;

  -- Điểm danh không bị cascade xoá theo giao dịch.
  SELECT count(*) INTO n FROM "attendance" WHERE "id" LIKE 't08-%';
  IF n <> 11 THEN
    RAISE EXCEPTION 'mất dòng điểm danh: còn %', n;
  END IF;

  SELECT string_agg(a."id" || ':' || a."tuition_fee" || ':' || COALESCE(a."payroll_basis_tuition_fee"::text, '-')
      || ':' || CASE WHEN a."transaction_id" IS NULL THEN 'none'
                     WHEN a."transaction_id" LIKE 't08-%' THEN a."transaction_id"
                     ELSE 'new' END, ',' ORDER BY a."id") INTO v
    FROM "attendance" a WHERE a."id" LIKE 't08-%';
  IF v IS DISTINCT FROM
    't08-a1-q1:1600000:20000:new,t08-a1-q2:0:20000:none,t08-a1-q3:0:20000:none,'
    || 't08-a2-q1:0:-:none,t08-a2-q2:1000000:20000:new,t08-a2-q3:0:20000:none,'
    || 't08-a3-q1:20000:20000:t08-w3a,t08-a3-q2:20000:20000:t08-w3b,t08-a3-q3:20000:20000:t08-w3c,'
    || 't08-a4-p1:3000000:91400:new,t08-a5-q2:1440000:20000:new' THEN
    RAISE EXCEPTION 'điểm danh sai: %', v;
  END IF;

  -- Link điểm danh trỏ đúng giao dịch gói của học sinh đó.
  SELECT count(*) INTO n
    FROM "attendance" a JOIN "wallet_transactions_history" w ON w."id" = a."transaction_id"
    WHERE a."id" IN ('t08-a1-q1', 't08-a2-q2', 't08-a4-p1', 't08-a5-q2')
      AND w."student_id" = a."student_id" AND w."amount" = a."tuition_fee";
  IF n <> 4 THEN
    RAISE EXCEPTION 'link giao dịch gói sai: %', n;
  END IF;

  SELECT string_agg("id" || ':' || "tuition_fee", ',' ORDER BY "id") INTO v
    FROM "sessions" WHERE "id" LIKE 't08-%';
  IF v IS DISTINCT FROM 't08-p1:3000000,t08-q1:1620000,t08-q2:2460000,t08-q3:20000' THEN
    RAISE EXCEPTION 'học phí buổi sai: %', v;
  END IF;
END $$;

\echo 'PASS 20261004000000_one_time_course_setting'
ROLLBACK;
