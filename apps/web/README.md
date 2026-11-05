# UniEdu Web

Frontend của UniEdu 5.0, dùng Next.js App Router.

## Routes hiện có

- `/`
- `/landing-page`
- `/auth/login`
- `/auth/register` (disabled — redirect về `/auth/login`)
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/setup-password`
- `/admin` (alias dashboard)
- `/admin/home`
- `/admin/dashboard` (canonical admin dashboard route)
- `/admin/classes`
- `/admin/classes/[id]`
- `/admin/students`
- `/admin/staffs`
- `/admin/staffs/[id]`
- `/admin/costs`
- `/admin/categories`
- `/admin/history`
- `/admin/lesson-plans`
- `/admin/lessons`
- `/admin/notes-subject`
- `/api/healthcheck`

## Environment

Thiết lập `NEXT_PUBLIC_BACKEND_URL` để trỏ tới backend NestJS đang chạy.

## Commands

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web exec tsc --noEmit
```

## Tham chiếu

- [../../docs/README.md](../../docs/README.md)
- [../../docs/pages/README.md](../../docs/pages/README.md)
