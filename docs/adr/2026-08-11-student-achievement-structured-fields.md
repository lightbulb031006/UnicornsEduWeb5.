# ADR: Student achievements use structured CMS fields (not freeform title)

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

Landing `/thanh-tich` (CMS `Achievement` on `FeaturedStudent`) needs structured fields: `award`, `exam`, `year`, `level`, `courseLabel`, proof image. EduWeb5 `student_achievements` originally mirrored staff with only `title` + image — insufficient for filters/bands by level/year and card copy on the public site.

Staff achievements remain a simple title list (professional highlights), not competition rows.

## Decision

- Replace `student_achievements.title` with `award`, `exam`, `year`, `level` (`AchievementLevel` enum mirroring landing), optional `course_label`.
- Keep staff on `title` only.
- Landing API for students returns structured fields plus derived `title = "${award} · ${exam}"` for short-term CMS compatibility.
- EduWeb5 is source of truth; landing CMS syncs into `FeaturedStudent` + nested `Achievement` (readonly in CMS editor).

## Consequences

- Separate create/update DTOs and FE editor modes for staff vs student.
- Existing student rows backfilled: `award = title`, `exam = '(chưa phân loại)'`, `year` from `created_at`, `level = PROVINCE`.
- Import scripts / ops must supply structured fields + images, not a single title blob.
