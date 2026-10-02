# Vé 10 — Timeline lớp admin mặc định chỉ hiện buổi học

**Branch:** `SunnyYeahBoiii/admin-timeline-lessons-toggle` (cắt từ `dev`). Xong merge thẳng vào `dev`.

## Đã làm

- `ClassTimelineManager` nhận prop `lessonVisibility?: "always" | "opt-in"` (mặc định `"always"`). Component không đọc role.
- Trang `/admin/classes/[id]` truyền `lessonVisibility="opt-in"`: mặc định ẩn `content_item` (tiết lý thuyết / tiết thực hành); switch **Hiện tiết học** (hàng riêng, `min-h-11`, bấm cả hàng) mới hiện. Khảo sát vẫn hiện.
- Trang staff không truyền prop → hiện đủ như trước, không toggle.
- Lọc chỉ ở UI; kéo-thả/`Lưu thứ tự` vẫn dùng list đầy đủ để `orderedIds` không thiếu tiết đang ẩn.
- Docs: `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/CHANGELOG.md`.

## Verify

- `apps/web` `tsc --noEmit` — 0 lỗi.
- Browser: Chrome DevTools MCP không gắn được (profile đang bị process khác giữ). Không login/end-to-end trên UI.

## Không làm

- Không đổi API timeline.
- Không thêm toggle phía học sinh.
