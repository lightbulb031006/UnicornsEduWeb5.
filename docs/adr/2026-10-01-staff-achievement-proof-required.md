# ADR: Thành tích nhân sự tạo mới phải kèm ảnh; không gỡ ảnh đã có

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

`/user-profile` vẫn sửa `specialization` (markdown giải thưởng) và một URL `personal_achievement_link`, trong khi trang gia sư đã dùng danh sách `staff_achievements`. Migration `20260811100000` đã tách markdown đó thành từng dòng tiêu đề, không có ảnh. Ảnh minh chứng học sinh vẫn tuỳ chọn. Landing (`GET /staff/landing-profiles`) đã trả `achievements`, kể cả dòng không ảnh, và vẫn gửi `specialization` để CMS cũ không gãy.

## Decision

1. Mọi chỗ sửa thành tích nhân sự (hồ sơ cá nhân, tự sửa, admin) dùng danh sách thành tích. Không còn sửa markdown chuyên ngành hay link minh chứng đơn trên `/user-profile`.
2. Tạo thành tích nhân sự phải kèm ảnh trong cùng thao tác. Nếu ảnh lỗi, không để lại dòng chỉ có tiêu đề. Ảnh đã có chỉ được thay, không gỡ. Xoá cả dòng vẫn được.
3. Dòng backfill chưa có ảnh vẫn hiện, gắn nhãn thiếu minh chứng, trên hồ sơ và trên landing (tiêu đề, `imageUrl` null). Gắn ảnh hoặc xoá cả dòng. Không xoá hàng loạt.
4. Thành tích học sinh giữ ảnh tuỳ chọn, kể cả gỡ ảnh.
5. Không đổi contract landing trong slice này: `specialization` vẫn là field deprecated.

## Considered options

- **Chỉ khoá nút Thêm trên UI:** bị loại vì API vẫn tạo tiêu đề rồi upload sau, và vẫn có endpoint gỡ ảnh — một request lỗi để lại dòng không ảnh mới.
- **Ẩn hoặc xoá dòng backfill không ảnh:** bị loại vì các tiêu đề đó đã là thành tích; người dùng gắn ảnh hoặc xoá từng dòng.
- **Bỏ `specialization` khỏi payload landing ngay:** bị loại vì CMS có thể còn đọc field deprecated; site landing là repo khác.

## Consequences

- `POST` thành tích nhân sự (admin và `/users/me/achievements`) nhận multipart `title` + `image`. `DELETE .../image` của nhân sự trả 400. Học sinh không đổi.
- Cột `image_path` vẫn nullable để giữ dòng thiếu minh chứng cũ.
- `specialization` và `personal_achievement_link` không còn là ô trên `/user-profile` và không nằm trong gate hoàn thiện hồ sơ. Cột DB giữ đến migration drop sau.
