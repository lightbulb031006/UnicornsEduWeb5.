# ADR: Assistant Admin-Mirror Policy

- **Status:** Superseded bởi `docs/adr/2026-11-12-admin-deny-by-default.md` (#267). Trang quản trị nay mặc định đóng; `AllowAssistantOnAdminRoutes` đã bị xoá; Trợ lí chỉ còn Học sinh, ví học sinh và Thông báo. Nội dung dưới đây chỉ còn giá trị lịch sử.

## Context

Assistant is expected to operate almost like admin across the admin-mirror surface, but a few high-risk areas must remain admin-only. The repo currently has both implicit assistant fallback and explicit per-endpoint overrides, so the documented policy must be unambiguous.

## Decision

Assistant is the default admin-mirror role on `@Roles(admin)` routes unless the endpoint explicitly denies it.

- `staff.assistant` should be able to use nearly all admin and staff-mirror operations.
- `@AllowAssistantOnAdminRoutes(false)` marks the exceptions that remain full-admin only.
- The current exceptions are admin dashboard aggregate routes and the direct-topup approval/queue/manual wallet-credit flows for student wallets. Assistant may still create a top-up request for admin approval and may withdraw/reduce student balance directly, but may not apply a positive manual wallet credit.
- **Superseded by #269 (biên bản 2026-11-12 mục 4):** notification moderation is admin-only; the assistant / Sale & CSKH head is a regular publisher. Historical text: Notification moderation is a partial exception: assistant sees every published notification on the management screen (other people's drafts stay private) and may delete notifications authored by staff, but may not delete notifications authored by admin. Like admin, assistant may never edit or re-push someone else's notification (see CONTEXT.md "Người tạo thông báo").

## Consequences

- Backend and frontend must keep the same exception list for assistant.
- Assistant may manage users, staff, classes, students, notifications, deductions, and other admin-mirror modules, but must not see the admin dashboard aggregate or directly approve/apply positive wallet top-ups. Creating a top-up request for admin approval remains allowed, and direct negative balance adjustments remain allowed.
- Docs must describe the assistant exception list explicitly instead of describing assistant as read-only or limited by default.
