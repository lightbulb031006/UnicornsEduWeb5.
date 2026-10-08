-- Test migration 20261002120000_add_class_modules trên DB local (KHÔNG chạy trên DB dùng chung/production).
-- Toàn bộ chạy trong một transaction rồi ROLLBACK: gỡ tạm DDL của migration, nạp fixture
-- theo schema cũ, chạy đúng file migration, assert, rồi hoàn tác sạch.
--
--   cd apps/api && psql "<local url>" -v ON_ERROR_STOP=1 -f prisma/tests/20261002120000_add_class_modules.test.sql
\set ON_ERROR_STOP on
BEGIN;

DROP TABLE "class_modules";
ALTER TABLE "lessons" DROP COLUMN "archived_at";

INSERT INTO "courses" ("id", "name", "updated_at") VALUES ('t07-course', 't07 course', NOW());
INSERT INTO "classes" ("id", "name", "course_id", "timeline_custom_order", "updated_at") VALUES
  ('t07-k1', 't07 k1', 't07-course', false, NOW()),
  ('t07-k2', 't07 k2', 't07-course', true, NOW()),
  ('t07-k3', 't07 k3', 't07-course', false, NOW());
INSERT INTO "modules" ("id", "course_id", "title", "sort_order", "updated_at") VALUES
  ('t07-m1', 't07-course', 'm1', 0, NOW()),
  ('t07-m2', 't07-course', 'm2', 1, NOW());
INSERT INTO "lessons" ("id", "kind", "course_id", "module_id", "class_id", "title", "order") VALUES
  ('t07-t1', 'theory', 't07-course', 't07-m1', NULL, 't1', 0),
  ('t07-t2', 'theory', 't07-course', 't07-m1', NULL, 't2', 1),
  ('t07-t3', 'theory', 't07-course', 't07-m1', NULL, 't3', 2),
  ('t07-p1', 'practice', 't07-course', 't07-m1', NULL, 'p1', 3),
  ('t07-t4', 'theory', 't07-course', 't07-m2', NULL, 't4', 0),
  ('t07-own', 'theory', NULL, NULL, 't07-k3', 'own', 0);

-- k1: t2 hiện, p1 hiện, t3 đã ẩn từ trước.
-- k2 (đã DnD): t1 hiện, t4 đã ẩn → không kéo m2.
-- k3: tiết riêng của lớp đang hiện.
INSERT INTO "class_content_items" ("id", "class_id", "lesson_id", "sort_order", "open_at", "duration_minutes", "hidden_at", "created_at") VALUES
  ('t07-i-k1-t2', 't07-k1', 't07-t2', 0, NULL, NULL, NULL, NOW() - INTERVAL '3 days'),
  ('t07-i-k1-p1', 't07-k1', 't07-p1', 1, NOW() - INTERVAL '2 days', 60, NULL, NOW() - INTERVAL '2 days'),
  ('t07-i-k1-t3', 't07-k1', 't07-t3', 2, NULL, NULL, NOW(), NOW() - INTERVAL '1 day'),
  ('t07-i-k2-t1', 't07-k2', 't07-t1', 0, NULL, NULL, NULL, NOW() - INTERVAL '3 days'),
  ('t07-i-k2-t4', 't07-k2', 't07-t4', 1, NULL, NULL, NOW(), NOW() - INTERVAL '2 days'),
  ('t07-i-k3-own', 't07-k3', 't07-own', 0, NULL, NULL, NULL, NOW() - INTERVAL '1 day');
INSERT INTO "class_timeline_items" ("id", "class_id", "kind", "sort_order", "class_content_item_id", "hidden_at", "updated_at") VALUES
  ('t07-tl-k1-t2', 't07-k1', 'content_item', 7, 't07-i-k1-t2', NULL, NOW()),
  ('t07-tl-k1-p1', 't07-k1', 'content_item', 3, 't07-i-k1-p1', NULL, NOW()),
  ('t07-tl-k1-t3', 't07-k1', 'content_item', 9, 't07-i-k1-t3', NOW(), NOW()),
  ('t07-tl-k2-t1', 't07-k2', 'content_item', 5, 't07-i-k2-t1', NULL, NOW()),
  ('t07-tl-k2-t4', 't07-k2', 'content_item', 6, 't07-i-k2-t4', NOW(), NOW()),
  ('t07-tl-k3-own', 't07-k3', 'content_item', 0, 't07-i-k3-own', NULL, NOW());

\i prisma/schema/migrations/20261002120000_add_class_modules/migration.sql

DO $$
DECLARE
  n int;
  v text;
BEGIN
  -- Chuyên đề được thêm: k1→m1, k2→m1. Không m2 (t4 ẩn), không k3 (tiết riêng).
  SELECT string_agg("class_id" || ':' || "module_id", ',' ORDER BY "class_id")
    INTO v FROM "class_modules" WHERE "class_id" LIKE 't07-%';
  IF v IS DISTINCT FROM 't07-k1:t07-m1,t07-k2:t07-m1' THEN
    RAISE EXCEPTION 'class_modules sai: %', v;
  END IF;

  -- k1: bổ sung t1 (sort 3 = max 2 + 1). t3 vẫn ẩn, không nhân đôi. Không kéo p1 mới, không kéo t4.
  SELECT string_agg(l."id" || '@' || cci."sort_order" || (CASE WHEN cci."hidden_at" IS NULL THEN '' ELSE '!h' END), ',' ORDER BY cci."sort_order")
    INTO v FROM "class_content_items" cci JOIN "lessons" l ON l."id" = cci."lesson_id" WHERE cci."class_id" = 't07-k1';
  IF v IS DISTINCT FROM 't07-t2@0,t07-p1@1,t07-t3@2!h,t07-t1@3' THEN
    RAISE EXCEPTION 'item k1 sai: %', v;
  END IF;

  -- k2: bổ sung t2, t3 theo thứ tự tiết. t4 ẩn giữ nguyên.
  SELECT string_agg(l."id" || '@' || cci."sort_order" || (CASE WHEN cci."hidden_at" IS NULL THEN '' ELSE '!h' END), ',' ORDER BY cci."sort_order")
    INTO v FROM "class_content_items" cci JOIN "lessons" l ON l."id" = cci."lesson_id" WHERE cci."class_id" = 't07-k2';
  IF v IS DISTINCT FROM 't07-t1@0,t07-t4@1!h,t07-t2@2,t07-t3@3' THEN
    RAISE EXCEPTION 'item k2 sai: %', v;
  END IF;

  -- Mọi item đều có dòng timeline.
  SELECT count(*) INTO n FROM "class_content_items" cci
    WHERE cci."class_id" LIKE 't07-%'
      AND NOT EXISTS (SELECT 1 FROM "class_timeline_items" t WHERE t."class_content_item_id" = cci."id");
  IF n <> 0 THEN RAISE EXCEPTION 'item thiếu timeline: %', n; END IF;

  -- k2 đã DnD: dòng cũ giữ sort, dòng mới nối cuối (7, 8) theo thứ tự tiết.
  SELECT string_agg(l."id" || '@' || t."sort_order", ',' ORDER BY t."sort_order")
    INTO v FROM "class_timeline_items" t
    JOIN "class_content_items" cci ON cci."id" = t."class_content_item_id"
    JOIN "lessons" l ON l."id" = cci."lesson_id"
    WHERE t."class_id" = 't07-k2';
  IF v IS DISTINCT FROM 't07-t1@5,t07-t4@6,t07-t2@7,t07-t3@8' THEN
    RAISE EXCEPTION 'timeline k2 sai: %', v;
  END IF;

  -- k1 chưa DnD: sắp lại theo thời gian, mới nhất trên (t1 vừa thêm → 0).
  SELECT string_agg(l."id" || '@' || t."sort_order", ',' ORDER BY t."sort_order")
    INTO v FROM "class_timeline_items" t
    JOIN "class_content_items" cci ON cci."id" = t."class_content_item_id"
    JOIN "lessons" l ON l."id" = cci."lesson_id"
    WHERE t."class_id" = 't07-k1';
  IF v IS DISTINCT FROM 't07-t1@0,t07-t3@1,t07-p1@2,t07-t2@3' THEN
    RAISE EXCEPTION 'timeline k1 sai: %', v;
  END IF;

  -- Tiết riêng của lớp: lưu trữ, không xoá; item + timeline ẩn.
  SELECT count(*) INTO n FROM "lessons" WHERE "id" = 't07-own' AND "archived_at" IS NOT NULL AND "class_id" = 't07-k3';
  IF n <> 1 THEN RAISE EXCEPTION 'tiết riêng chưa lưu trữ'; END IF;
  SELECT count(*) INTO n FROM "class_content_items" WHERE "id" = 't07-i-k3-own' AND "hidden_at" IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'item tiết riêng chưa ẩn'; END IF;
  SELECT count(*) INTO n FROM "class_timeline_items" WHERE "id" = 't07-tl-k3-own' AND "hidden_at" IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'timeline tiết riêng chưa ẩn'; END IF;
  -- Tiết cấp khoá không bị lưu trữ.
  SELECT count(*) INTO n FROM "lessons" WHERE "id" LIKE 't07-%' AND "class_id" IS NULL AND "archived_at" IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'tiết cấp khoá bị lưu trữ nhầm: %', n; END IF;

  RAISE NOTICE 'migration 20261002120000_add_class_modules: OK';
END $$;

ROLLBACK;
