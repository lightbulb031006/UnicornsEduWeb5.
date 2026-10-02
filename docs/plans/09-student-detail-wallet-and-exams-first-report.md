# Vé 09 — Student detail: wallet and exams first

## Changes
- Reordered admin/staff student detail (`apps/web/app/admin/students/[id]/page.tsx`; staff re-exports this page) to: **Tài khoản hiện tại** → **Lịch thi** → **Thông tin cơ bản** → **Liên hệ phụ huynh** → Thành tích → Feedback → danh sách lớp.
- **Thông tin cơ bản** and **Liên hệ phụ huynh** titles unchanged; both start collapsed, expand independently via shadcn `Collapsible` (`apps/web/components/ui/collapsible.tsx` + `@radix-ui/react-collapsible`), persist in `localStorage`.
- Mobile-first: stacked column, two columns from `sm`.

## Verify
- `pnpm exec tsc --noEmit` in `apps/web`.
- Browser: not run end-to-end here (no authenticated local session in this worker). Coordinator should click a student on admin and staff shells, confirm order, collapse persist after reload.

## Out of scope / not done
- No merge to `dev` (coordinator instruction).
- Self-service `/student` dashboard unchanged.
