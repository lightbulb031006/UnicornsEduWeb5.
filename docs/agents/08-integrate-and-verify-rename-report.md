# Vé 08 — Tích hợp và nghiệm thu đợt đổi tên

**Branch:** `SunnyYeahBoiii/rename-three-levels` (chung với vé 04–07). Không merge / rebase / checkout / PR. Commit trên branch hiện tại.

## Đã làm

- Dọn comment từ vựng cũ: `class-content.service.ts` (JSDoc xoá Module/Lesson, khối XOR `Lesson.classId`, map `lesson/module`) và `question.service.ts` (`shared module + difficulty`). Không đụng `lesson-output-pricing.ts` / `dtos/lesson.dto.ts`.
- Glossary `CONTEXT.md`: cặp dễ nhầm **Tiết học** vs **Buổi học** (cấm viết tắt cả hai), danh sách tên đã khai tử (`Chapter`/`Topic`/`Lecture`/`TopicKind`/`ClassTheoryTopicView`/HTTP cũ).
- Hai ADR: `docs/adr/2026-09-16-one-lecture-becomes-one-lesson.md` (không gộp lecture; số mục lớp nhân lên), `docs/adr/2026-09-16-class-owned-lesson-xor.md` (XOR chuyên đề hoặc lớp). Cập nhật ADR mô hình `2026-09-15`.
- Docs sống khớp code: `docs/Database Schema.md`, `docs/api/courses.md`, `docs/pages/admin.md`, `docs/README.md`, `docs/Cách làm việc.md`, `docs/AI Question Import.md`, `docs/Seed Question Bank.md`, `docs/agents/domain.md`, `docs/CHANGELOG.md`.

## Verify

- `apps/web` `tsc --noEmit` — 0 lỗi.
- `apps/web` vitest — 16 file / **135 passed**.
- `apps/api` jest — 89 suite / **984 passed** (các test customer-care/unioj được cảnh báo sẵn-đỏ **không tái hiện** trong lần chạy này; không sửa chúng).
- `prisma migrate deploy` từ DB Postgres trống: **fail sẵn** tại migration cũ `20260906000000_add_activate_secret_hash` (`login_requests` does not exist) — **không** phải migration rename `20260921000000`. Không sửa file migration đã có theo lệnh coordinator. Container throwaway đã xoá.

## Không làm

- Không merge, rebase, checkout branch khác, không mở PR.
- Không sửa 21+ migration đã commit.
- Không đụng domain giáo án (`lesson-output-pricing.ts`, `dtos/lesson.dto.ts`).
