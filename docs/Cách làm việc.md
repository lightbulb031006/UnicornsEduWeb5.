# Cách làm việc với Turborepo, Next.js và NestJS

## Tổng quan

Dự án sử dụng **Turborepo** để quản lý monorepo, kết hợp **pnpm workspaces** để quản lý dependencies. Trong monorepo có các ứng dụng:

| Ứng dụng | Đường dẫn  | Framework | Mô tả                                            |
| -------- | ---------- | --------- | ------------------------------------------------ |
| `web`    | `apps/web` | Next.js   | Giao diện người dùng (Frontend)                  |
| `api`    | `apps/api` | NestJS    | Backend API (Auth, Learning, Finance, Lesson, …) |

## Cấu trúc thư mục (thực tế)

```
UnicornsEduWeb5./
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/                # App Router (routes, layout, pages)
│   │   │   ├── admin/          # /admin (dashboard, classes, students, …)
│   │   │   ├── auth/           # /auth/*
│   │   │   ├── landing-page/   # /landing-page
│   │   │   ├── api/            # Route handlers API (vd. healthcheck)
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── lib/                # API client, utils
│   └── api/                    # NestJS backend
│       ├── src/                # modules, controllers, services
│       │   ├── auth/
│       │   ├── cache/          # dashboard_cache helpers (PostgreSQL-backed)
│       │   ├── action-history/ # audit log service cho create/update/delete
│       │   ├── prisma/
│       │   ├── session/        # session facade + create/update/delete/reporting workflows
│       │   ├── staff-ops/      # shared access rules for staff operations flows
│       │   └── …
│       ├── prisma/schema/      # Prisma schema
│       ├── generated/          # Prisma Client output
│       └── dtos/
├── packages/                   # Shared libs (hiện chỉ .gitkeep)
├── docs/                       # Tài liệu dự án
├── archived/                   # Bản lưu (vd. UniEdu-Web-3.9)
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── pnpm-lock.yaml
```

## Tech stack Frontend (`apps/web`)

Dùng làm context khi implement hoặc review code frontend; giúp model chọn đúng thư viện và pattern.

| Hạng mục                   | Công nghệ / Phiên bản          | Ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**              | Next.js 16.x                   | App Router (thư mục `app/`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **UI**                     | React 19.x                     | react, react-dom 19.2.x.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Styling**                | Tailwind CSS v4                | `@tailwindcss/postcss` trong `postcss.config.mjs`; trong `globals.css` dùng `@import "tailwindcss"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Theme / Design tokens**  | CSS variables                  | Trong `app/globals.css`: tokens theo `docs/UI-Schema.md` (--ue-bg-primary, --ue-text-primary, --ue-primary, …); chuyển theme bằng `[data-theme]` trên `<html>` (light / dark / pink).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Fonts**                  | next/font/google               | Geist (sans), Geist_Mono (mono); khai báo trong `app/layout.tsx`, dùng biến CSS `--font-geist-sans`, `--font-geist-mono`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Data fetching / API**    | TanStack React Query v5, Axios | React Query cho server state; Axios instance trong `lib/client.ts` (baseURL từ env, withCredentials, xử lý refresh token, chuẩn hóa lỗi `429 Too Many Requests` để FE hiện toast rate-limit nhất quán).                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Validation / Transform** | Tùy chọn theo module           | Không bắt buộc class-validator/class-transformer; chọn giải pháp phù hợp yêu cầu từng phần.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **TypeScript**             | TS 5.x                         | Path alias `@/*` → `./*` (tsconfig.json). Target ES2017, moduleResolution bundler, strict.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **API base URL**           | Biến môi trường                | `NEXT_PUBLIC_BACKEND_URL`; nên set tường minh trong `apps/web/.env`. Frontend hiện có fallback `http://localhost:3001`, trong khi API listen ở `PORT` hoặc `4000` nếu không cấu hình.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **SePay nạp ví học sinh**  | Biến môi trường                | Web hiển thị QR SePay tĩnh theo học sinh; không còn cờ `NEXT_PUBLIC_STUDENT_WALLET_SEPAY_TOPUP`. QR tĩnh dùng `SEPAY_TRANSFER_BANK_BIN`, `SEPAY_TRANSFER_ACCOUNT_NUMBER`, optional `SEPAY_TRANSFER_ACCOUNT_NAME`, `SEPAY_TRANSFER_BANK_NAME`, `SEPAY_TRANSFER_QR_TEMPLATE`, `SEPAY_VIETQR_IMAGE_BASE_URL`, `SEPAY_TRANSFER_NOTE_PREFIX` (mặc định rỗng; VietinBank theo hướng dẫn SePay nên dùng `SEVQR`); webhook cần `SEPAY_WEBHOOK_SECRET`, `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS=300`, SMTP (`apps/api/.env.example`), `ADMIN_EMAIL` thật cho duyệt yêu cầu nạp thẳng của staff (không dùng `admin@example.com`), `FRONTEND_URL` public HTTPS ở production, và **Chromium** (`CHROMIUM_PATH`) nếu cần đính kèm PDF biên lai (Docker API đã set sẵn). |

**Cấu trúc thư mục frontend:** `apps/web/app/` (routes, layout, page), `apps/web/lib/` (API client, utils). Component và style theo cấu trúc Next.js App Router; tokens và theme đã định nghĩa sẵn trong `globals.css`.

### Checklist SePay nạp ví

- FE: popup nạp ví hiển thị QR SePay tĩnh riêng học sinh, không nhập số tiền trong tab SePay. Admin vẫn có tab **Nạp thẳng** riêng và phải nhập lý do; CSKH/kế toán/trợ lí có tab **Nạp thẳng** nhưng chỉ tạo yêu cầu pending gửi tới `ADMIN_EMAIL`, không cộng ví ngay; student không được chỉnh thẳng số dư.
- Staff direct top-up request: `POST /student/:id/wallet-direct-topup-requests` lưu yêu cầu pending và gửi email React Email tới `ADMIN_EMAIL`; link mở `/wallet-direct-topup-approval?token=...`, token chỉ lưu dạng hash và hết hạn sau **14 ngày**. GET preview không cộng ví; chỉ `POST /student/wallet-direct-topup-approval/confirm` sau khi admin bấm xác nhận trên trang public mới tạo transaction `topup` và cộng `account_balance`. Nếu thiếu `ADMIN_EMAIL`, `ADMIN_EMAIL` là placeholder, production `FRONTEND_URL` không phải public HTTPS, hoặc SMTP gửi thất bại, backend trả lỗi và không giữ pending request.
- API: QR tĩnh dùng bank-transfer/VietQR từ `SEPAY_TRANSFER_*`, không phụ thuộc `SEPAY_TOPUP_MODE=va_order`. Có thể dùng `SEPAY_VIETQR_IMAGE_BASE_URL=https://qr.sepay.vn/img` để tạo link QR theo tham số SePay `acc/bank/des`; endpoint tạo order động cũ còn tồn tại để tương thích nhưng không còn là flow UI chính.
- Flow: `GET /users/me/student-wallet-sepay-static-qr` (học sinh tự nạp) hoặc `GET /student/:id/wallet-sepay-static-qr` (admin/staff có quyền) trả VietQR quick link không có amount, nội dung `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-[0-9a-f]{10}` (static QR mới không còn marker `NAPVI`, class id hoặc tên lớp); `POST /webhook/sepay` verify `X-SePay-Signature` + `X-SePay-Timestamp` bằng HMAC-SHA256 trên chuỗi `{timestamp}.{raw_body}` với `SEPAY_WEBHOOK_SECRET` (raw body đúng byte SePay gửi, không serialize lại từ `req.body`), từ chối timestamp quá `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` giây (mặc định `300`), chỉ nhận fallback `X-Secret-Key` cũ khi `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY=1`, nhận `transferAmount`, `transactionDate`, `referenceCode`, ack `{ "success": true }`, reconcile theo order động cũ hoặc static QR bằng id học sinh (vẫn tương thích marker `NAPVI`/`NAP VI`, `UNICL-*`, `LOP ...` cũ), tạo ledger completed trong `student_wallet_sepay_orders` để chống cộng trùng, tạo lịch sử ví và gửi **email biên lai nạp ví** tới `parent_email` và email CSKH nếu có qua `MailService.sendStudentWalletTopUpReceiptEmail` — HTML **React Email** + **PDF đính kèm** khi Chromium/Puppeteer hoạt động; biên lai lấy các lớp active của học sinh và hiển thị `Học sinh <id học sinh> gia hạn học phí các gói <tên lớp...>`; lỗi SMTP chỉ log, không fail acknowledge webhook; cập nhật `receipt_email_sent_at` khi gửi thành công.
- Test nhanh: chạy mail spec, tạo order sandbox, gọi webhook mẫu inbound, kiểm tra số dư ví + `wallet_transactions_history` + `receipt_email_sent_at`.
- **Gỡ lỗi webhook HMAC:** Nếu copy `curl` cũ (cùng `X-SePay-Timestamp` / chữ ký) và gọi lại sau vài phút, API trả `401` vì timestamp lệch quá `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` (mặc định `300`). Cần tạo lại chữ ký với timestamp hiện tại + đúng raw body + đúng `SEPAY_WEBHOOK_SECRET`, hoặc tăng tolerance trên môi trường test (prod nên giữ hẹp).

### Quy tắc BE-first cho frontend

- Frontend không được giữ logic nghiệp vụ mang tính authoritative.
- Không tự tính ở FE các giá trị ảnh hưởng dữ liệu lưu trữ hoặc số liệu chính thức như: tổng tiền, unpaid/paid summary, công thức học phí/trợ cấp, effective tuition/package, hoặc diff membership nhiều bản ghi.
- Không lấy list rộng rồi mới filter/search/classify bắt buộc ở FE nếu backend có thể và nên enforce; cần bổ sung query param hoặc endpoint ở BE.
- FE chỉ nên làm các biến đổi mang tính trình bày: format, label, UI-only sorting/filter cục bộ trên dữ liệu đã authoritative, state tạm trong form.
- Nếu một giá trị có thể làm thay đổi payload gửi đi, thay đổi quyền truy cập, hoặc xuất hiện như số liệu chính thức trên màn hình, hãy chuyển logic đó sang backend trước khi hoàn thiện FE.
- Với simple single-select dropdown trong `apps/web`, dùng component chung `apps/web/components/ui/UpgradedSelect.tsx` thay cho native `<select>`.
- Chỉ dùng custom combobox/listbox khác khi thật sự cần search, multi-select, async suggestion hoặc option content phức tạp hơn simple dropdown.
- Chuẩn hóa React Query keys qua `apps/web/lib/query-keys.ts`; ưu tiên dùng key factory thay vì hard-code mảng key lặp lại ở component.
- Logout flow ở shell/navbar phải dùng scoped cleanup (`apps/web/lib/query-invalidation.ts`) thay vì `queryClient.invalidateQueries()` toàn cục để tránh request burst.
- Với calendar pages (`/admin/calendar`, `/staff/calendar`), ưu tiên trigger `calendar:refetch` hoặc invalidation theo calendar key-scope; tránh nghe global mutation event không liên quan.
- Notification feed dùng `apps/web/lib/notification-feed-query.ts` (factory `notificationFeedQueryKey`) để đồng bộ key giữa tray/page/socket bridge.
- Auth guard ở `apps/web/proxy.ts` phải dùng `matcher` giới hạn vào route cần bảo vệ (`/admin`, `/staff`, `/student`, `/user-profile`) để tránh gọi lặp `/auth/session` cho static/public requests; proxy chỉ verify session cho request document/direct navigation, còn App Router RSC request (`RSC`, `_rsc`, `next-router-state-tree`) và prefetch phải đi thẳng để đổi tab/query trong dashboard không tạo burst `/auth/session`. Mọi staff role vận hành không phải admin (`teacher`, `lesson_plan`, `lesson_plan_head`, `assistant`, `accountant`, `communication`, `technical`, `customer_care`) thiếu hồ sơ bắt buộc hoặc chưa đồng ý phiên bản điều khoản thu thập/xử lý dữ liệu cá nhân hiện hành phải bị redirect tới `/user-profile?profile_required=1&from=...`; `/user-profile` hiển thị 2 checkbox consent bắt buộc và gọi `POST /auth/data-consent/accept`. Admin đầy đủ và student workspace không bị staff profile guard này. Không dùng route runtime `/staff/data-consent`.
- Protected shell/sidebar links (`AdminSidebar`, `StaffSidebar`, `StudentSidebar`) phải dùng `prefetch={false}` để tránh background prefetch gọi proxy và tạo burst `/auth/session`.
- Axios refresh interceptor trong `apps/web/lib/client.ts` chỉ được refresh cho business APIs; mọi endpoint `/auth/*` (bao gồm `/auth/session`) phải bỏ qua để tránh vòng lặp refresh khi auth endpoint trả `401`.

## Yêu cầu hệ thống

- **Node.js** >= 20
- **pnpm** >= 10 (dự án dùng `pnpm@10.27.0`)

## Cài đặt

**Cách 1 — Cài từ root (cả monorepo):**

```bash
git clone <repo-url>
cd UnicornsEduWeb5.
pnpm install
```

**Cách 2 — Cài trong từng app (chỉ app cần dùng):**

```bash
# Frontend
cd apps/web
pnpm i

# Backend (ví dụ api)
cd apps/api
pnpm i
```

Khi dùng cách 2, pnpm workspace vẫn resolve dependencies theo `pnpm-workspace.yaml`; chạy `pnpm i` trong thư mục app sẽ cài đúng dependencies của app đó (và hoist về root nếu cấu hình workspace cho phép). Các lệnh như `pnpm dev`, `pnpm build` chạy ngay trong thư mục app đó.

> Nếu gặp cảnh báo về build scripts bị bỏ qua, chạy `pnpm approve-builds` (từ root) để cho phép.

## Các lệnh thường dùng

### Chạy tất cả ứng dụng

```bash
# Chạy tất cả ở chế độ development
pnpm dev

# Build tất cả
pnpm build

# Lint tất cả
pnpm lint

# Kiểm tra TypeScript types
pnpm check-types

# Dọn dẹp build outputs
pnpm clean
```

### Chạy một ứng dụng cụ thể (dùng --filter)

```bash
# Chỉ chạy frontend (Next.js)
pnpm --filter web dev

# Chỉ chạy api (NestJS)
pnpm --filter api dev

# Build chỉ một app
pnpm --filter web build
```

### Thêm dependency cho một app

```bash
# Thêm dependency vào web
pnpm --filter web add <package>

# Thêm devDependency vào api
pnpm --filter api add -D <package>

# Thêm dependency vào root (ít khi dùng)
pnpm add -D <package> -w
```

## Cách Turborepo hoạt động

### Pipeline (`turbo.json`)

Turborepo sử dụng file `turbo.json` để định nghĩa các task và mối quan hệ giữa chúng:

- **`build`** — Build tất cả apps. `dependsOn: ["^build"]` nghĩa là package phụ thuộc sẽ được build trước.
- **`dev`** — Chạy development server. Không cache, chạy persistent (không tự tắt).
- **`lint`** — Kiểm tra code style. Chạy sau khi build xong các packages phụ thuộc.
- **`check-types`** — Kiểm tra TypeScript types. Chạy sau khi build xong các packages phụ thuộc.
- **`clean`** — Xóa build outputs. Không cache.

### Cache

Turborepo tự động cache kết quả của `build`, `lint`, `check-types`. Nếu code không thay đổi, lần chạy tiếp theo sẽ dùng cache thay vì chạy lại → **tiết kiệm thời gian đáng kể**.

Để bỏ qua cache:

```bash
pnpm build --force
```

### Xem task graph

```bash
pnpm exec turbo run build --dry
pnpm exec turbo run build --graph
```

## Làm việc với Next.js (`apps/web`)

Tech stack chi tiết xem mục **Tech stack Frontend** ở trên.

```bash
# Chạy dev server (mặc định port 3000)
pnpm --filter web dev

# Build production
pnpm --filter web build

# Chạy production server
pnpm --filter web start
```

Cấu trúc Next.js: App Router trong `apps/web/app/` (layout, page, route segments); components và styles trong `app/` hoặc thư mục con; shared logic trong `apps/web/lib/`.

**Logo & favicon (tối ưu dung lượng):** Asset logo nằm trong `apps/web/image/logo/` (mọi `*.png`). Script `square-trim-logos.mjs` (`pnpm square:logos`): trim viền, **cắt khung vuông** căn giữa với margin trong suốt ~3px (`LOGO_PAD_PX`), tùy chọn giới hạn cạnh `LOGO_MAX_EDGE` (mặc định 1024; `0` = không scale). Sau khi đổi logo nên chạy `pnpm square:logos` rồi `pnpm favicon:ico` (hoặc gộp quy trình tương đương). `pnpm optimize:assets` gọi `optimize-ui-logo.mjs` + `png-to-favicon-ico.mjs` (master 512px, `favicon.ico` qua png2icons + `icon.png`, `apple-icon.png`). Chi tiết biến môi trường xem comment đầu từng script.

## Làm việc với NestJS (`apps/api`)

```bash
# Từ root
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api prod
pnpm --filter api db:deploy
pnpm --filter api test
pnpm --filter api test:e2e

# Hoặc trong thư mục app
cd apps/api
pnpm dev
pnpm build
pnpm test
pnpm run test:e2e
```

CD trên VPS chạy `scripts/gha-deploy-remote.sh`: pull image GHCR mới, chạy `prisma generate` từ chính API image để kiểm tra schema/client generation, rồi recreate `api`/`web`/`nginx` và healthcheck. Workflow GitHub Actions này **không** chạy `prisma migrate deploy`; khi đổi Prisma schema cho production/shared DB, phải commit migration trong `apps/api/prisma/schema/migrations/` và áp dụng migration bằng quy trình vận hành riêng (`pnpm --filter api db:deploy` trên đúng environment hoặc lệnh tương đương trong container) trước rollout phụ thuộc schema. Không dùng `prisma migrate dev` trên database shared.

### Runbook: short system entity IDs

Migration `20260523110000_short_system_entity_ids` rotates existing `student_info.id`, `classes.id`, and `staff_info.id` to freshly generated short system IDs (`UNIST-[0-9a-f]{10}`, `UNICL-[0-9a-f]{10}`, `UNISTAFF-[0-9a-f]{10}`) using `pgcrypto.gen_random_bytes(5)`. It also backfills direct FK references through `ON UPDATE CASCADE`, rewrites embedded references in `classes.schedule`, `action_history` JSON/text fields, `student_wallet_sepay_orders.transfer_note`, and truncates `dashboard_cache` if present. The migration is fix-forward only; do not run `prisma migrate dev` against shared DBs and do not plan rollback.

Rollout order:

1. Announce a short maintenance window because old admin/staff/student links will stop resolving after ID rotation.
2. Run `pnpm --filter api db:deploy` on the target environment before deploying code that assumes short IDs.
3. Verify counts and formats with read-only SQL: `student_info.id ~ '^UNIST-[0-9a-f]{10}$'`, `classes.id ~ '^UNICL-[0-9a-f]{10}$'`, `staff_info.id ~ '^UNISTAFF-[0-9a-f]{10}$'`.
4. Reissue active student QR/VietQR payloads so parents use current `UNIST-*` and `UNICL-*` tokens. Persisted historical order notes are backfilled, but screenshots/printed QR codes are external and remain stale.
5. Resync/update Google Calendar external event metadata for class schedules and makeup events using the calendar resync/admin script for the environment. Do not delete/recreate all Calendar events by default; keep event IDs unless a targeted repair requires replacement.
6. Smoke check login, `/admin/students/:id`, `/admin/classes/:id`, `/admin/staffs/:id`, SePay static QR generation, SePay webhook parsing, and admin/staff calendar views.

Cấu trúc NestJS: modules, controllers, services, guards, pipes trong `apps/api/src/`; Prisma schema trong `apps/api/prisma/schema/`; Prisma Client generate ra `apps/api/generated/`. **CORS:** trong `main.ts`, cấu hình qua `NestFactory.create(AppModule, { cors: { origin: process.env.FRONTEND_URL, credentials: true } })` (không dùng `app.enableCors()` sau `create`), để preflight `OPTIONS` đi qua middleware `cors` trước router; `FRONTEND_URL` trong `apps/api/.env` phải khớp origin thực tế của web (ví dụ `http://localhost:3000`, không trộn `localhost` với `127.0.0.1`). Với các flow nhiều nghiệp vụ như `session`, ưu tiên chia theo workflow service nhỏ (`create`, `update`, `delete`, `reporting`) và gom rule truy cập dùng chung vào service riêng như `src/staff-ops/` thay vì dồn hết vào một god-service. Với các thao tác mutate nghiệp vụ, ưu tiên ghi audit qua `src/action-history/` ngay trong transaction để `action_history` luôn đồng bộ với dữ liệu chính. Hiện coverage đã phủ các mutate flow chính ở `session`, `class`, `cost`, `bonus`, `extra_allowance`, `cf_problem_tutorial`, `user`, `student`, `staff`, cùng các auth flow thay đổi dữ liệu `user` như `register`, `verify email`, `reset/change/setup password` và Google OAuth create/verify. Với snapshot `user`, `before_value` / `after_value` phản ánh đúng dữ liệu lưu DB, gồm cả các field hash như `passwordHash` / `refreshToken` nếu thao tác đó chạm vào chúng. Flow OAuth Google hiện expose cờ `requiresPasswordSetup` qua `GET /auth/profile` / `GET /auth/me`; frontend dùng route `/auth/setup-password` và gate tại `apps/web/app/providers.tsx` để buộc user chưa có `passwordHash` hoàn tất bước tạo mật khẩu trước khi dùng tiếp app. **Swagger UI:** khi chạy API, mở `http://localhost:<PORT>/api` để xem và gọi thử API (DocumentBuilder + SwaggerModule trong `main.ts`). Mọi controller nên có Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, …). Với request body cần validation runtime, ưu tiên DTO dạng `class` + `ValidationPipe`; không nên dùng `interface` nếu muốn `class-validator` hoạt động. Dashboard read endpoints hiện dùng bảng `dashboard_cache` của PostgreSQL qua `src/cache/dashboard-cache.service.ts`; cấu hình TTL bằng `DASHBOARD_CACHE_DEFAULT_TTL_SECONDS` trong `apps/api/.env`. Backend auth cũng có in-memory identity cache theo process để giảm query lặp `users` / `staff_info` ở `JwtStrategy`, `RolesGuard` và `GET /auth/profile`; cấu hình bằng `AUTH_IDENTITY_CACHE_TTL_MS` và `AUTH_IDENTITY_CACHE_MAX_ENTRIES`, cache chỉ giữ TTL ngắn và luôn invalidate sau các mutate làm đổi auth-visible fields. Nếu thao tác cache lỗi hoặc row đã hết hạn, service sẽ fail-open và query dữ liệu tươi trực tiếp từ PostgreSQL. API cũng bật global HTTP rate limiting bằng `@nestjs/throttler` với cấu hình `THROTTLE_DEFAULT_LIMIT`, `THROTTLE_DEFAULT_TTL_MS`, `THROTTLE_DEFAULT_BLOCK_DURATION_MS`; các auth endpoint nhạy cảm (`login`, `register`, `forgot-password`, `reset-password`, `change-password`, `verify`, `refresh`) có limit chặt hơn ngay tại controller, còn `POST /auth/setup-password` dùng chung ngưỡng `10 lần / 30 phút / IP` như đổi mật khẩu. Nếu deploy sau reverse proxy, cấu hình thêm `TRUST_PROXY` để Express ghi nhận đúng client IP cho throttler. Khi thay đổi Prisma schema hoặc phiên bản Prisma, chỉ generate qua workspace-local script như `pnpm --filter api db:generate`; không dùng Prisma CLI global vì `apps/api/generated/` phải khớp tuyệt đối với version `prisma` và `@prisma/client` đang cài trong repo. Các script `build`, `dev`, `start`, `check-types` của `apps/api` hiện đã tự chạy `db:generate` trước để giảm rủi ro lệch client/runtime; sau build, `postbuild` tạo entrypoint tương thích `dist/main.js` trỏ tới output Nest `dist/src/main.js`, nên `pnpm --filter api prod`, Docker CMD và thao tác `node dist/main` đều dùng được. Với database Supabase/shared đã có dữ liệu, không chạy `prisma migrate dev` trực tiếp vì Prisma có thể yêu cầu reset khi phát hiện history conflict hoặc drift; hãy tạo migration trên DB local/disposable, commit file SQL, rồi áp dụng lên shared DB bằng `pnpm --filter api db:deploy`. Khi rollout backend có phụ thuộc schema mới, cần chạy `pnpm --filter api db:deploy` trên đúng environment trước khi đổi image/restart API. Nếu phát hiện các object legacy/manual ngoài schema commit trong repo (ví dụ cột/bảng cũ còn sót), hãy dọn bằng migration commit vào repo thay vì vá service runtime để tương thích tạm thời.
Deploy Docker production pin `NODE_ENV=production` trong `docker-compose.prod.yml`; không override `NODE_ENV` trong VPS `.env` vì cookie auth phụ thuộc production mode. `FRONTEND_URL` nên là origin chính xác không có trailing slash (ví dụ `https://it.unicornsedu.com`); backend có normalize phòng lỗi cấu hình nhưng env vẫn nên sạch.

Avatar người dùng dùng backend proxy lên Supabase Storage bucket `avatars` với object key `users/{userId}/avatar`. Vì vậy cần cấu hình `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong `apps/api/.env` (không expose service role key ra frontend). Backend chịu trách nhiệm upload, xoá file và ký signed URL ngắn hạn; frontend chỉ gọi API NestJS và không tự ký URL hoặc truy cập bucket bằng service role key. Hồ sơ nhân sự không còn upload ảnh CCCD; các object legacy nếu còn trong bucket `id-cards` không được flow hiện tại tự xoá.

## Nginx reverse proxy local (một cổng: FE `/`, BE `/api/`)

Để Next và Nest **cùng origin** (cookie `Set-Cookie` + CORS khớp `FRONTEND_URL`), có thể chạy Nginx trên máy dev theo mẫu [`nginx/dev-local-8080.example.conf`](../nginx/dev-local-8080.example.conf). Cơ chế strip prefix `/api/` giống snippet Docker [`nginx/conf.d/snippets/proxy-locations.conf`](../nginx/conf.d/snippets/proxy-locations.conf).

**Env khi proxy `http://localhost:8080` (đổi cổng thì đổi tương ứng):**

- `apps/web/.env`: `NEXT_PUBLIC_BACKEND_URL=http://localhost:8080/api` (axios gọi `/auth/...` → đủ URL `.../api/auth/...`).
- `apps/api/.env`: `FRONTEND_URL=http://localhost:8080` (bắt buộc có scheme `http://` hoặc `https://`, không chỉ `localhost:8080`).
- Google OAuth: `GOOGLE_CALLBACK_URL` qua gateway, ví dụ `http://localhost:8080/api/auth/google/callback`.
- `TRUST_PROXY=true` (hoặc `1`) trên API khi đứng sau Nginx.
- Truy cập **HTTP** mà API chạy `NODE_ENV=production`: cookie `Secure` có thể không được trình duyệt chấp nhận; nên dùng `development` khi test qua HTTP hoặc bật HTTPS (mkcert, v.v.).

**Swagger qua gateway:** Nest mount UI tại path `/api` trên cổng API thuần; URL ngoài thường là `http://localhost:8080/api/api`.

## Thêm shared package mới

Khi cần chia sẻ code giữa các apps (ví dụ: types, utils, configs):

1. Tạo thư mục trong `packages/`:

```bash
mkdir packages/shared
cd packages/shared
pnpm init
```

2. Đặt tên package trong `packages/shared/package.json`:

```json
{
  "name": "@unicorns/shared",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

3. Thêm vào app cần dùng:

```bash
pnpm --filter web add @unicorns/shared --workspace
```

## Quy tắc làm việc

1. **Cài đặt:** Có thể chạy `pnpm i` từ root (cả monorepo) hoặc `cd` vào từng app rồi chạy `pnpm i` trong app đó.
2. **Chạy / build:** Từ root dùng `pnpm --filter web dev` (hoặc filter khác); hoặc `cd apps/web` rồi chạy `pnpm dev` / `pnpm build` trực tiếp trong app.
3. **Dùng `--filter`** — Khi ở root, dùng `--filter=<app>` để chỉ chạy task cho một app.
4. **Không commit `node_modules`** — Đã có trong `.gitignore`.
5. **Không chỉnh sửa `pnpm-lock.yaml` bằng tay** — File này được tự động tạo bởi pnpm.
6. **Kiểm tra types trước khi commit** — Từ root: `pnpm check-types`; với frontend nên chạy thêm `pnpm --filter web exec tsc --noEmit` vì `apps/web` hiện chưa khai báo script `check-types` riêng.

## Deploy VPS (GitHub Actions)

**Runbook triển khai đầy đủ:** [`docs/runbooks/vps-cd-deploy.md`](runbooks/vps-cd-deploy.md)

Pipeline: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — khi **push `main`**: hai job build song song `build-api` / `build-web` chạy trên runner `ubuntu-latest` (Buildx, **`linux/amd64`** push GHCR, Dockerfile dùng BuildKit cache mount cho pnpm store) + job **`mirror-nginx`** (copy manifest `nginx:1.27-alpine` từ Docker Hub lên **`ghcr.io/unicorns-prj-dev/nginx:1.27-alpine`** bằng `docker buildx imagetools create` — VPS không cần kéo `docker.io`) → job `deploy` **checkout** shallow → SSH công khai qua `appleboy/ssh-action` (IP/hostname VPS, không Tailscale) → script [`scripts/gha-deploy-remote.sh`](../scripts/gha-deploy-remote.sh) tại `DEPLOY_DIR` (mặc định `/opt/unicorns-edu`) → `git pull --ff-only` → **`docker login ghcr.io`** bằng secret `GHCR_USERNAME` + `GHCR_TOKEN` (bắt buộc nếu package private) → prune Docker unused data → pull/recreate `api`, `web`, `nginx` tuần tự để giảm peak disk → probe HTTP service nội bộ → `nginx -t` + reload → smoke HTTP loopback (`http://127.0.0.1`) cho cloudflared → prune lại Docker unused data. **Không** chạy lint/test trên GitHub Actions; kiểm tra local dùng `pnpm lint`, `pnpm check-types`, `pnpm --filter api test`, v.v.

**Kiến trúc VPS:** VPS production là **amd64** (`uname -m` → `x86_64`). Image `unicorns-api` / `unicorns-web` build **amd64-only** trên runner `ubuntu-latest`. Nếu chuyển sang VPS ARM64, đổi workflow về `ubuntu-24.04-arm` và `platforms: linux/arm64`.

**SSH:** GitHub Actions kết nối trực tiếp tới `VPS_HOST` (IP public hoặc hostname) cổng `VPS_SSH_PORT` (mặc định 22). Khuyến nghị user `deploy`, key-only auth, `ufw` chỉ mở SSH — không mở 80/443 ra internet vì ingress qua Cloudflare Tunnel.

**Docker Hub / `docker compose pull`:** service **`nginx`** trong [`docker-compose.prod.yml`](../docker-compose.prod.yml) dùng image **`ghcr.io/unicorns-prj-dev/nginx:1.27-alpine`** — được job CI **`mirror-nginx`** đồng bộ manifest đa kiến trúc từ `docker.io/library/nginx:1.27-alpine` lên GHCR mỗi lần push `main`, nên VPS sau `docker login ghcr.io` **chỉ cần** kéo từ GHCR (tránh `registry-1.docker.io` / TLS timeout). Script deploy vẫn **retry** `docker compose pull` cho lỗi mạng tạm thời khác.

**Cloudflared / NGINX production:** NGINX chỉ bind loopback host `127.0.0.1:80` trong [`docker-compose.prod.yml`](../docker-compose.prod.yml). Cloudflare Tunnel cấu hình service tới `http://127.0.0.1:80`; TLS/domain kết thúc ở Cloudflare, nên VPS không cần expose `443`, không cần `certbot`, và không dùng `VPS_PUBLIC_HOST` cho smoke test. `nginx/conf.d/app.conf` là catch-all local vhost; `nginx/nginx.conf` giữ lại `X-Forwarded-Proto` từ cloudflared để backend/web vẫn biết request gốc là HTTPS.

**Secrets / variables GitHub (CD):** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `NEXT_PUBLIC_BACKEND_URL`, **`GHCR_TOKEN`** (PAT `read:packages`, user đã authorize SSO org nếu có), **`GHCR_USERNAME`** (username GitHub của chủ PAT). Tuỳ chọn: variable `DEPLOY_DIR` (mặc định `/opt/unicorns-edu`), `VPS_SSH_PORT` (mặc định `22`). Có thể dùng Repository variable cho `GHCR_USERNAME`.

**Cloudflared smoke test:** deploy không cần `VPS_PUBLIC_HOST`. Script kiểm tra `api`, `web`, rồi kiểm tra NGINX qua `http://127.0.0.1/nginx-health` và `http://127.0.0.1/api/`; tunnel public do Cloudflare quản lý ngoài workflow.

### Lỗi `Process exited with status 137`

**137** = tiến trình bị **SIGKILL**; trên VPS nhỏ (512MB–1GB RAM) nguyên nhân hay gặp nhất là **OOM** (kernel kill) khi Docker **pull/giải nén layer** hoặc **recreate** `api` + `web` cùng lúc.

**Việc nên làm trên VPS:**

1. **Thêm swap** (ví dụ 2G) nếu RAM &lt; 2G — giảm đột biến OOM khi deploy.
2. **Nâng RAM** hoặc tách DB sang host khác để VPS chỉ chạy stack app.
3. Workflow đã bật `command_timeout: 45m`, `git pull --ff-only` trên VPS để cập nhật `docker-compose.prod.yml` / `nginx`, và probe HTTP readiness thật từ trong container trước khi reload nginx; `wait_for_http` chờ tối đa `90 × 5s` mỗi service (override qua `WAIT_HTTP_RETRIES`) để VPS thiếu disk boot chậm không bị abort giữa chừng làm `web`/`nginx` kẹt ở image cũ; nếu vẫn 137, ưu tiên swap / RAM. Nếu chạy `migrate deploy` tay trên VPS và gặp OOM, thử `NODE_OPTIONS=--max-old-space-size=384` (hoặc tương đương) khi `exec` vào container `api`.

### Lỗi `no space left on device` khi `docker compose pull`

Thường do `/var/lib/containerd` hoặc `/var/lib/docker` không còn đủ dung lượng để giữ đồng thời layer image cũ và image mới khi pull/giải nén. Script deploy hiện prune stopped containers + dangling images + build cache (`docker container/image/builder prune -f`, **không** dùng `-a` để tránh xoá nhầm image `:latest` vừa pull nhưng chưa có container) trước pull, pull từng service (`api` → migrate/up/wait/prune → `web` → wait/prune → `nginx`) và in `docker system df` + `df -h` khi pull fail. Nếu vẫn thiếu dung lượng, xử lý trên VPS:

```bash
docker system df
df -h / /var/lib/docker /var/lib/containerd
docker container prune -f
docker image prune -af
docker builder prune -af
```

Nếu vẫn không đủ, cần tăng disk hoặc chấp nhận downtime ngắn để xoá container cũ trước khi pull image mới.

### Nginx 502 `Connection refused` tới `172.x.x.x:3000` sau khi `docker compose up`

Nginx có thể giữ upstream tới IP container **trước khi recreate**; `web`/`api` đổi IP trong mạng Docker sẽ gây 502 nếu proxy chỉ resolve hostname lúc start. Repo hiện đã chặn trường hợp này theo 3 lớp:

1. `nginx/nginx.conf` khai báo Docker DNS `resolver 127.0.0.11` ở `http` scope để mọi server block (kể cả block TLS do Certbot thêm) đều re-resolve `api` / `web`.
2. `nginx/conf.d/app.conf` dùng `proxy_pass` qua biến thay vì `upstream` tĩnh để Nginx hỏi lại Docker DNS khi container đổi IP.
3. `docker-compose.prod.yml` thêm `healthcheck` cho `api` / `web`, còn workflow deploy sẽ `git pull --ff-only` trên VPS rồi probe HTTP readiness thật (`api` qua `http://127.0.0.1:4000/`, `web` qua `http://127.0.0.1:3000/api/healthcheck`) trước khi chạy `nginx -t` + `nginx -s reload`, nên không còn phụ thuộc vào `docker inspect .State.Health` của container cũ hoặc phải restart tay cả container `nginx`.

Nếu VPS vẫn đang dùng config cũ, pull repo mới rồi chạy lại:

```bash
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml exec nginx nginx -t
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Khi verify routing, **đừng dùng `http://IP/api` để kết luận API còn sống**. Với Nginx chỉ có `location /api/`, path `/api` không có dấu `/` cuối sẽ rơi xuống `location /` và có thể trả HTML của Next.js. Repo hiện đã thêm exact-match redirect `location = /api { return 301 /api/; }` để normalize case này. Với cấu hình proxy đang strip prefix `/api`, cách test đúng là `curl -i http://IP/api/` và kỳ vọng backend trả `Hello World!`; nếu mở Swagger qua reverse proxy thì URL ngoài là `http://IP/api/api`.

Lưu ý: khi `proxy_pass` dùng **biến hostname** để tránh stale Docker IP, **không** thêm URI `/` ở cuối kiểu `http://$upstream_api:4000/` trong block `location /api/`. Cách đó sẽ làm Nginx đẩy mọi request `/api/*` về `/` của backend. Repo hiện rewrite `^/api/(.*)` trước rồi `proxy_pass http://$upstream_api:4000` không kèm URI để giữ đúng path còn lại.

Nếu log `web` hiển thị Next.js chạy ở `http://0.0.0.0:4000` thay vì `3000`, nguyên nhân thường là cả `api` và `web` cùng ăn chung `env_file: .env` và biến `PORT=4000` từ backend đã override frontend. `docker-compose.prod.yml` hiện đã pin lại `api.PORT=4000` và `web.PORT=3000` ở từng service; sau khi cập nhật file này trên VPS, chạy lại `docker compose -f docker-compose.prod.yml up -d --force-recreate web nginx`.

### Cloudflared Tunnel với Nginx local

Stack prod không terminate TLS trong NGINX nữa. `docker-compose.prod.yml` bind NGINX vào **`127.0.0.1:80`** trên VPS; Cloudflare Tunnel trỏ service tới **`http://127.0.0.1:80`**. Public hostname, TLS certificate, redirect HTTPS và WAF/routing nằm ở Cloudflare.

1. Chạy deploy như bình thường để `api`, `web`, `nginx` lên cùng compose network.
2. Cấu hình cloudflared trên VPS:

   ```yaml
   ingress:
     - hostname: YOUR_CLOUDFLARE_HOSTNAME
       service: http://127.0.0.1:80
     - service: http_status:404
   ```

3. Kiểm tra local trước khi kiểm tra domain public:

   ```bash
   docker compose -f docker-compose.prod.yml exec nginx nginx -t
   docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   curl -fsS http://127.0.0.1/nginx-health
   curl -fsS http://127.0.0.1/api/
   ```

`nginx/conf.d/https-vhost.conf` cố ý để trống phần server block để tránh phụ thuộc cert trên VPS. `nginx/nginx.conf` preserve `X-Forwarded-Proto` từ cloudflared; backend/web vẫn thấy request gốc là HTTPS khi Cloudflare gửi header này.

Nếu gặp lỗi `OCI runtime exec failed: ... setns process`, đây thường là race ngay sau lúc container `nginx` vừa recreate hoặc đang restart. Workflow đã thêm `wait_for_nginx_running` + retry `docker compose exec -T nginx ...` trước khi test/reload; nếu vẫn fail sẽ in `docker compose ps` và `logs --tail=200 nginx` để chẩn đoán trực tiếp nguyên nhân root (thiếu cert, lỗi syntax config, crash loop...).

### Lỗi Prisma `The datasource.url property is required` khi chạy `migrate deploy` (tay trên VPS)

Image API phải chứa `prisma.config.ts` ở thư mục làm việc của container (`/app`): Prisma 7 khai báo `datasource.url` qua `process.env.DATABASE_URL` trong file đó (schema `prisma/schema/*.prisma` không còn dòng `url`). Đảm bảo đã build image từ Dockerfile mới có bước `COPY ... prisma.config.ts`, và file `.env` trên VPS có `DATABASE_URL` (Compose dùng `env_file`).

### Lỗi Prisma `Can't write to ... @prisma/engines` (quyền ghi `node_modules`)

Xảy ra khi container chạy user **không phải root** nhưng thư mục `/app` (đặc biệt `node_modules`) vẫn thuộc **root** sau bước `COPY` trong Dockerfile — Prisma có thể cần ghi dưới `@prisma/engines`. Image API/Web hiện gọi `chown -R appuser:appgroup /app` trước `USER appuser`. Nếu gặp lỗi trên image cũ: build lại image từ `apps/api/Dockerfile` / `apps/web/Dockerfile` mới và deploy lại.

**Lưu ý:** Dòng log có prefix `err:` từ SSH action có thể chỉ là **stderr** của Docker (bình thường), không phải lỗi logic cho đến khi có exit code khác 0.
