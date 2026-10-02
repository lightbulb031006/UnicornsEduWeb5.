# Vé 05 — Schema và dữ liệu ba cấp

## Changes

- Prisma: `Chapter` → `Module` (`modules`), `Topic`/`Lecture` → `Lesson` (`lessons`), `TopicKind` → `LessonKind`, `ClassContentItem.lessonId`, `ClassTheoryLessonView`, `LessonQuiz` / `LessonQuizAnswer`. CHECK SQL `lessons_owner_check` (chuyên đề XOR lớp) và `lessons_practice_no_media_check`.
- Migration mới `apps/api/prisma/schema/migrations/20260921000000_rename_three_level_content/` — không sửa migration cũ. Backfill: mỗi lecture → một tiết lý thuyết (giữ id); practice topic → tiết thực hành (giữ id); class content/timeline nở N mục; ẩn copy nguyên; lượt xem ở tiết đầu.
- Docs: `CONTEXT.md`, `docs/Database Schema.md`, ADR `docs/adr/2026-09-15-three-level-content-model.md`, `docs/CHANGELOG.md`.

## Verification

- `pnpm dlx prisma@7.2.0 generate --schema=./prisma/schema/` (apps/api, no local node_modules): client 7.2.0 → `./generated` with `Module`, `Lesson`, `LessonKind`, `ClassContentItemKind.lesson`. `model Module` không bị Prisma reserved.
- Không chạy `migrate deploy` — worktree không có `.env` local; không đụng DB shared.
- `git diff` trên `apps/api/prisma/schema/migrations/`: chỉ thêm folder mới, không sửa file migration cũ.
- `tsc` API/web cố ý đỏ (~65 call site) — vé 06/07. Không merge/rebase/PR.

## Left

- Vé 06 (API) và 07 (web) trên cùng branch; nghiệm thu vé 08.
- Seed `seed-question-bank.ts` vẫn dùng tên Prisma cũ cho đến vé 06.
