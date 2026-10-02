# Vé 04 — Prefactor content routes

## Changes

- Next.js hrefs for the content tree live in `apps/web/lib/course-content-routes.ts` (admin/staff course pages + student class topic pages).
- Axios paths live in `apps/web/lib/content-api-paths.ts` (course chapters/topics, lectures, practice questions, student-class topic/quiz, class course-topics picker).
- Call sites in `class.api.ts`, `student-class.api.ts`, `useCourseTaxonomyCreate.ts`, course workspace, and student lists/pages no longer concatenate `/chapters|/topics|/lectures`.

## Verification

- `pnpm test` in `apps/web`: 135 tests passed (includes new builder tests).
- `tsc --noEmit` in this worktree reports missing `@/image/logo/*.png` in `BrandLogo` / `SidebarThemePicker` — pre-existing; logos are not in this checkout. Touched files have no new type errors.
- No merge to `dev` (coordinator instruction).

## Left

- Tickets 05–07 rename segments in the two builders (and App Router folders). NestJS controller paths stay until those tickets.
