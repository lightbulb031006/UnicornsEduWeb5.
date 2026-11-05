# ADR: Thành tích nổi bật là cột riêng `is_highlight`, bắt buộc với gia sư

- **Status:** Accepted
- **Date:** 2026-11-04
- **Mở rộng:** `docs/adr/2026-10-20-teacher-achievement-required.md` — gate gia sư thêm điều kiện có thành tích nổi bật.

## Context

Landing hiện thành tích **đầu tiên** của gia sư cạnh avatar. Gia sư không biết thứ tự kéo-thả quyết định cái gì lên website, nên nhiều người đang hiện thành tích không phải cao nhất. Vận hành muốn gia sư tự chọn đúng 1 thành tích cao nhất (tích sao), cái đó tự lên đầu, và gia sư nào cũng phải chọn.

## Decision

1. Thêm cột `staff_achievements.is_highlight` + partial unique index `(staff_id) WHERE is_highlight` — DB đảm bảo tối đa 1 sao/nhân sự. List luôn sắp `is_highlight DESC, sort_order, created_at`; `PUT .../:id/highlight` bỏ sao cũ + đặt sao mới + đánh lại `sort_order` trong một transaction; reorder ghim dòng có sao ở đầu.
2. Gia sư (`teacher`) phải có ≥ 1 thành tích **và** 1 thành tích nổi bật thì `staffProfileComplete = true`. Không backfill theo thứ tự cũ (hệ thống không tự đoán "cao nhất"); chỉ người có đúng 1 thành tích được tự gắn sao (migration + khi tạo dòng đầu + khi xoá còn 1 dòng).
3. Landing đọc `achievements[].isHighlight` từ `GET /staff/landing-profiles`; chưa có dòng nào có sao thì fallback dòng đầu.
4. Chỉ thành tích nhân sự; thành tích học sinh không có sao (`isHighlight` luôn `false` trong DTO).

## Considered options

- **Dùng `sort_order = 0` làm "nổi bật"** (sao = kéo lên đầu): không cần migration, nhưng không phân biệt được "đã chọn" với "tình cờ đứng đầu" → không gate được, và kéo-thả vô tình đổi thứ hiển thị trên website.
- **Backfill sao = dòng đầu cho mọi người**: không ai bị chặn khi deploy, nhưng giữ nguyên lỗi hiện tại (dòng đầu chưa chắc cao nhất) và gia sư không có lý do xem lại.

## Consequences

- Deploy xong, mọi gia sư có ≥ 2 thành tích bị chặn ở lần điều hướng sau cho đến khi tích sao → cần báo trước trong nhóm gia sư.
- Xoá thành tích có sao khi còn ≥ 2 dòng làm gia sư bị chặn lại tới khi chọn sao mới.
- Đổi sao của chính mình phải refresh session/full profile (đã làm trong `AchievementListEditor`) để gate client không stale.
