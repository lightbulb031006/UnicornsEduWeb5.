# AGENTS.md — UnicornsEduWeb5

Instructions for coding agents working in this monorepo. Keep changes minimal, follow existing patterns, and keep documentation in sync.

## Source of truth (read first)

- `docs/README.md`: monorepo snapshot & what exists.
- `docs/Cách làm việc.md`: commands, stack, and working conventions.
- `docs/UI-Schema.md`: design tokens / theme / UI conventions.
- `docs/Database Schema.md`: Prisma schema source of truth (`apps/api/prisma/schema/`).
- `docs/pages/`: route specs (especially when implementing new pages).
- `docs/CHANGELOG.md`: changelog conventions (update when preparing to commit/push).

## Monorepo basics

- **Apps**
  - **Frontend**: `apps/web` (Next.js 16, React 19, Tailwind v4)
  - **Backend**: `apps/api` (NestJS)
- **Preferred commands (from repo root)**
  - Dev: `pnpm dev` (all) or `pnpm --filter web dev` / `pnpm --filter api dev`
  - Types: `pnpm check-types` (and for web: `pnpm --filter web exec tsc --noEmit`)
  - Lint: `pnpm lint` or `pnpm --filter web lint`
- **Dependency installation**
  - Install dependencies inside the app scope (recommended):
    - `cd apps/web && pnpm add <pkg>`
    - `cd apps/api && pnpm add <pkg>`
  - Do **not** create/use a project-local `.pnpm-store`. Prefer a global pnpm store.

## Documentation sync (mandatory)

When code changes affect behavior, **update the matching docs in the same task**. Do not finish with docs out of sync.

- Prisma schema changes under `apps/api/prisma/schema/` → update `docs/Database Schema.md`
- API endpoints / DTOs / auth flow changes → update the relevant API docs in `docs/`
- Env/config/runtime dependency changes → update `.env.example` and setup docs
- Architecture/module boundary changes → update relevant architecture docs / README

## Keep agent instructions up to date (mandatory)

If you change project workflow/conventions for agents (commands, required checks, FE/BE constraints, docs process), **update this file (`AGENTS.md`) in the same task** so instructions match reality.

## Agent skills

- **Issue tracker**: use local markdown issues under `.scratch/` unless the user explicitly asks to publish to GitHub. See `docs/agents/issue-tracker.md`.
- **Triage labels**: use the canonical triage labels documented in `docs/agents/triage-labels.md` (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`).
- **Domain docs**: treat this as a single-context monorepo and use the docs listed in Source of truth first. See `docs/agents/domain.md`.

## Frontend rules (`apps/web`) (mandatory)

- **Backend communication**: use **TanStack Query** (`useQuery` / `useMutation`) for all server state.
  - Use the shared Axios client at `apps/web/lib/client.ts`.
  - Avoid raw `useEffect` fetch patterns for server state.
- **BE-first business logic**: frontend must not own authoritative business rules or derived server facts.
  - Do not calculate financial totals, unpaid/paid summaries, tuition/allowance formulas, effective package values, or cross-record membership diffs in FE when those values affect persisted data or decision-making.
  - Do not fetch broad datasets and then apply required filtering/authorization/business classification in FE if BE can enforce it; add/query a backend endpoint instead.
  - FE may only do presentation-only derivations (formatting, labels, local UI sorting of already-authoritative data, optimistic form state). If the derived value could change what is saved, shown as official totals, or used to decide permissions/workflow, it belongs in BE.
- **Design quality (mandatory for FE work)**:
  - Review touched UI against **Web Interface Guidelines** (source: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`) and fix violations before finalizing.
  - Follow a “frontend-design” approach: commit to a clear aesthetic direction, refine typography/spacing, avoid generic UI output.
- **Mock data for UI-first work (preferred)**: if backend data is not required yet, create page-local mock data directly inside the relevant `apps/web/app/**/page.tsx` to render UI immediately. When switching to real data, replace the mock with TanStack Query + DTOs in `apps/web/dtos/`.
- **Notifications**: use **Sonner** for success/error toasts (avoid inline alert blocks unless explicitly required).
- **UI components**: prefer **shadcn/ui** components; compose/extend before hand-rolling new components.
- **Native temporal inputs**: use shared `apps/web/components/ui/DateInput.tsx`, `MonthInput.tsx`, and `TimeInput.tsx` for native date/month/time fields so clicking the whole input opens the picker.
- **Dropdowns**: for simple single-select dropdowns, use the shared upgraded dropdown at `apps/web/components/ui/UpgradedSelect.tsx` instead of native `<select>`.
  - Keep a custom combobox/listbox only when the UX truly needs search, multi-select, async suggestions, or richer option content.
- **Mobile-first**: implement for small screens first, then add larger breakpoints.
- **Protected sidebar prefetch**: sidebar links in protected shells (`AdminSidebar`, `StaffSidebar`, `StudentSidebar`) should use `prefetch={false}` to avoid background prefetch triggering `apps/web/proxy.ts` and creating `/auth/session` request bursts.
- **Protected proxy verification**: `apps/web/proxy.ts` should verify auth on direct protected document navigations, but skip Next App Router internal RSC/prefetch requests (`RSC`, `_rsc`, `next-router-state-tree`, `next-router-prefetch`) so dashboard tab/query changes do not call `/auth/session`.
- **Route parity**: if you change anything in `apps/web/app/admin/**` (UI, behavior, permissions, shared components), review and update the corresponding `staff` and/or `student` routes/features that rely on the same domain behavior so experiences don’t diverge.
- **Workspace access matrix**: if you change admin/staff/student role gates, proxy redirects, sidebar visibility, or backend role decorators, update `docs/pages/README.md` and the matching route spec (`docs/pages/admin.md`, `docs/pages/staff.md`, or `docs/pages/student.md`) in the same task.
- **DTOs/enums location**: define all frontend DTOs/enums in `apps/web/dtos/` (do not define ad-hoc types in pages or `lib/apis/*`).

## Backend rules (`apps/api`) (mandatory)

- **Swagger decorators**: every controller should include appropriate decorators:
  - `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()`, `@ApiBody()`, `@ApiParam()`, `@ApiCookieAuth()` (when needed)
- **DTO style**: use **interfaces** for request/response types (follow project convention).
- **Input validation at boundaries**: validate/normalize incoming data at controllers/pipes/services as appropriate.
- **Prisma client sync**: after changing Prisma schema or Prisma package versions, use workspace-local scripts (`pnpm --filter api db:generate`, `pnpm --filter api build`, etc.). Do **not** use a global Prisma CLI because `apps/api/generated/` must match the Prisma version installed in this workspace.
- **CD Prisma behavior**: GitHub Actions deploy must not apply Prisma migrations; keep CD to image build/deploy plus `prisma generate` validation only. Apply committed production/shared DB migrations through a separate, explicit ops step.
- **Prisma migrations on shared DBs**: do **not** run `prisma migrate dev` against shared/staging/production Supabase databases. Use `pnpm --filter api db:migrate` only on a disposable local dev database, and use `pnpm --filter api db:deploy` to apply committed migrations to shared environments without reset prompts.
- **Prisma drift fixes**: treat committed Prisma schema + migrations as the only supported database shape. If an environment has manual/legacy drift (for example stray legacy columns/tables), fix it with a committed migration and run `pnpm --filter api db:deploy` before rolling the API code; do **not** add runtime compatibility writes just to tolerate drift.

## Quality & safety checklist

- Keep changes focused on the requested scope.
- Validate inputs at system boundaries; avoid OWASP Top 10 pitfalls.
- Prefer editing existing files/components over creating new ones.
- After substantive edits, run typecheck/lint/test commands relevant to the touched app(s).
- If docs should change, update them before finishing.
