# UniEdu 5.0

Monorepo cho hệ thống quản lý giáo dục của UniEdu, gồm frontend Next.js và backend NestJS.

## Workspace

- `apps/web`: Next.js 16 + React 19, App Router, admin/auth/landing pages.
- `apps/api`: NestJS 11 + Prisma, auth và các domain `class`, `staff`, `student`, `session`, `bonus`, `cost`.
- `docs/`: tài liệu vận hành, route plans, schema và changelog.
- `archived/`: mã tham khảo từ phiên bản cũ.

## Quick Start

```bash
pnpm install
pnpm --filter api dev
pnpm --filter web dev
```

Lưu ý:

- API mặc định listen ở `PORT` hoặc `4000` nếu không cấu hình.
- Web đọc API base URL từ `NEXT_PUBLIC_BACKEND_URL`.
- Nên set `apps/web/.env` để frontend trỏ đúng backend đang chạy.

## Useful Commands

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter api check-types
pnpm --filter api test
```

## Tài liệu

- [docs/README.md](docs/README.md): index tài liệu và health snapshot.
- [docs/Cách làm việc.md](docs/C%C3%A1ch%20l%C3%A0m%20vi%E1%BB%87c.md): setup, commands, conventions.
- [docs/pages/README.md](docs/pages/README.md): route map và trạng thái page plans.
- [docs/Database Schema.md](docs/Database%20Schema.md): source of truth cho schema Prisma.
