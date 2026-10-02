# Project Rules

## Cài đặt dependencies (Package installation)

- **Luôn cài đặt thư viện vào `node_modules` của từng app**, không dùng `.pnpm-store` trong project.
- Cài cả monorepo: `bun install` hoặc `pnpm install` từ root (`package.json` `workspaces` + `pnpm-workspace.yaml`).
- Khi thêm package mới, chạy `pnpm add <package>` **từ thư mục của app** (hoặc `bun add`):
  - API: `cd apps/api && pnpm add <package>`
  - Web: `cd apps/web && pnpm add <package>`
- Để tránh tạo `.pnpm-store` trong project, chạy một lần trên máy:  
  `pnpm config set store-dir ~/.local/share/pnpm/store` (hoặc bỏ qua nếu đã dùng store global).

## Documentation Sync (Bắt buộc)

Trước khi bắt đầu bất kỳ task nào, **luôn đọc `docs/`** (tương ứng `../../docs/` từ `apps/api`) để nắm context tài liệu hiện tại.

Khi thay đổi code, **luôn cập nhật tài liệu liên quan trong cùng phiên làm việc**.

### Quy tắc bắt buộc
1. Mọi thay đổi ảnh hưởng hành vi hệ thống phải có cập nhật docs tương ứng.
2. Không kết thúc task khi docs còn lệch với code.
3. Nếu chưa có tài liệu phù hợp, tạo mục mới trong `docs/`.

### Mapping cập nhật docs
- Thay đổi Prisma schema (`apps/api/prisma/schema/*`) → cập nhật `docs/Database Schema.md`.
- Thay đổi API/DTO/response/auth flow → cập nhật tài liệu API tương ứng trong `docs/`.
- Thay đổi env/config/runtime dependency → cập nhật `.env.example` và tài liệu setup.
- Thay đổi kiến trúc/module quan trọng → cập nhật tài liệu kiến trúc hoặc README liên quan.

### Checklist trước khi hoàn tất
- [ ] Đã rà soát docs bị ảnh hưởng
- [ ] Đã cập nhật docs tương ứng
- [ ] Nội dung docs khớp với code hiện tại

## Quy tắc bổ sung (Bắt buộc)

- Luôn viết báo cáo khi hoàn tất yêu cầu (nêu rõ thay đổi, phạm vi ảnh hưởng, kết quả verify).
- Frontend phải dùng Sonner để thông báo cho người dùng (toast success/error) thay vì render thông báo inline nếu không có yêu cầu đặc biệt.
---

## Best practices & stack conventions

- Trước khi implement, **luôn kiểm tra và áp dụng best practice** tương ứng (framework, bảo mật, hiệu năng) theo tài liệu chính thống hoặc `docs/`.

### Frontend (`apps/web`)

- **TanStack Query (React Query) – Bắt buộc:** Luôn luôn dùng TanStack Query cho mọi giao tiếp với Backend (query/mutation/invalidate). Không gọi API backend trực tiếp bằng `useEffect`/`useState` thuần.
- **TanStack Query (React Query):** Dùng cho mọi server state: fetch dữ liệu, cache, mutation. Ưu tiên `useQuery` / `useMutation` với Axios client trong `lib/client.ts`. Không fetch trong `useEffect` thuần khi dữ liệu là server state.
- **Reusable components (React best practices) – Bắt buộc:** Luôn tách UI thành các reusable components khi có phần lặp lại hoặc logic dùng lại, ưu tiên component nhỏ, rõ trách nhiệm, dễ test và dễ bảo trì.
- **shadcn/ui – Bắt buộc ưu tiên:** Khi xây UI trong `apps/web`, ưu tiên dùng component từ `shadcn/ui` thay vì tự code component mới từ đầu.
- **shadcn/ui – Quy tắc mở rộng:** Nếu cần custom, hãy compose/extend từ component shadcn hiện có; chỉ tự code component mới khi shadcn chưa đáp ứng được yêu cầu cụ thể.
- **Dialog / confirm:** Không tự code overlay (`<div className="fixed inset-0">`) hay `window.confirm`. Overlay form/nội dung dùng `apps/web/components/ui/ResponsiveDialog.tsx`; hỏi xác nhận dùng `apps/web/components/ui/ConfirmDialog.tsx` (compose shadcn AlertDialog). Backdrop/Escape khi form dirty phải hỏi trước khi bỏ thay đổi.
- **Dropdown nâng cấp – Bắt buộc:** Với simple single-select dropdown trong `apps/web`, luôn dùng `apps/web/components/ui/UpgradedSelect.tsx`; không thêm lại native `<select>` cho UI đã style.
- **Ngoại lệ dropdown:** Chỉ giữ hoặc tự làm custom combobox/listbox khi thật sự cần search, multi-select, async suggestion hoặc option content phức tạp hơn simple dropdown.
- **Mobile-first – Bắt buộc:** **LUÔN LUÔN CODE MOBILE-FIRST**. Thiết kế và implement UI từ màn hình nhỏ trước, sau đó mới mở rộng breakpoint cho tablet/desktop.
- **Validation/Transform:** Chọn giải pháp phù hợp theo từng module (không bắt buộc `class-validator` / `class-transformer`).
- **DTO/Enums location – Bắt buộc:** Mọi DTO và Enums dùng ở frontend phải được tách và đặt trong `apps/web/dtos/`. Không khai báo DTO/Enums cục bộ trong `apps/web/lib/apis/*` hoặc trong page/component.

### Backend (`apps/api`) & DTO

- **Swagger (OpenAPI):** Mọi controller phải có Swagger decorators: `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()`, `@ApiBody()`, `@ApiParam()`, `@ApiCookieAuth()` khi cần.
- **DTO:** Dùng interface cho request/response types.
