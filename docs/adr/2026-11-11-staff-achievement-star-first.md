# ADR: Gắn sao trước, minh chứng sau; người khác sửa thành tích không bị ràng buộc

- **Status:** Accepted
- **Date:** 2026-11-11
- **Supersedes:** `docs/adr/2026-11-07-staff-achievement-proof-only-for-highlight.md` (toàn bộ), và phần tự gắn sao của `docs/adr/2026-11-04-staff-highlight-achievement.md` (quyết định 2: "chỉ người có đúng 1 thành tích được tự gắn sao…").

## Context

ADR 2026-11-07 khoá nút sao trên dòng chưa có ảnh và bắt ảnh ở thành tích đầu tiên. Thực tế:

- Gia sư muốn chọn thành tích cao nhất trước, rồi mới đi tìm giấy chứng nhận. Thứ tự "ảnh rồi mới sao" làm họ kẹt.
- Admin không gỡ được ảnh của dòng có sao, cũng không gắn sao dòng chưa ảnh hộ gia sư. Các ràng buộc vốn dành cho chủ hồ sơ lại chặn cả người vận hành.
- Ban Đào Tạo đã xem được thành tích gia sư và được giao chỉnh lại khi ghép chuyên môn, nhưng chưa có quyền sửa.

## Decision

1. **Minh chứng là điều kiện của gate, không phải của thao tác.**
   - Tạo thành tích không bắt buộc ảnh, kể cả dòng đầu tiên.
   - Gắn sao được dòng chưa có ảnh.
   - Gate gia sư (`teacher`): ≥ 1 thành tích, có thành tích nổi bật, **và dòng nổi bật có ảnh**. API: `hasRequiredStaffAchievements`, full profile trả thêm `staffInfo.hasHighlightAchievementProof`. Web có gap `highlightProof`.
2. **Không bao giờ tự gắn sao.** Bỏ auto-star khi tạo dòng đầu và khi xoá còn 1 dòng. Landing vẫn fallback dòng đầu khi chưa có sao, và vẫn hiện tiêu đề dòng có sao kể cả khi chưa có ảnh.
3. **Chỉ chủ hồ sơ bị ràng buộc:** tự sửa hồ sơ của mình thì không gỡ được ảnh của dòng có sao, chỉ thay được. Người khác (admin, trợ lí, Ban Đào Tạo) không bị ràng buộc gì: tạo không ảnh, gắn sao dòng chưa ảnh, gỡ ảnh dòng có sao.
4. **Ban Đào Tạo sửa thành tích** qua `/training/tutors/:id/achievements` (POST, PATCH, DELETE, reorder, highlight, image). Phạm vi sửa bằng phạm vi xem: `training` thì gia sư; `training_head` (và admin) thì mọi nhân sự.
5. **Sửa hồ sơ của chính mình qua đường người khác → 403** (cả `/staff/:id/achievements` lẫn `/training/tutors/:id/achievements`). Thành tích của mình chỉ sửa ở `/users/me/staff-achievements`, nơi có ràng buộc của mục 3.
6. **Audit:** mọi thay đổi do người khác làm ghi `action_history` với `entity_type = 'staff_achievement'`:
   - Ghi: tạo, đổi tiêu đề, xoá, đổi sao, tải/thay ảnh, gỡ ảnh.
   - Không ghi: reorder, và tự sửa của chủ hồ sơ.

## Considered options

- **Giữ khoá sao tới khi có ảnh (ADR 11-07):** bị loại vì đảo ngược thứ tự tự nhiên của gia sư và chặn cả người vận hành.
- **Cho admin bỏ qua gate của gia sư:** bị loại. Gate là yêu cầu website (dòng nổi bật hiện công khai cần minh chứng), không phải quyền của người sửa.
- **Ban Đào Tạo chỉ sửa sao và tiêu đề:** bị loại vì ghép chuyên môn cần đủ thao tác, và phạm vi hẹp làm UI phân nhánh nhiều.

## Consequences

- Deploy: gia sư có dòng sao chưa có ảnh (backfill cũ) sẽ bị chặn ở trang hồ sơ cho tới khi tải ảnh cho dòng đó.
- Admin hoặc Ban Đào Tạo có thể gỡ ảnh dòng sao của gia sư. Gia sư khi đó bị gate chặn tới khi tải lại; hành động này có trong lịch sử thao tác.
- Admin, trợ lí hay Ban Đào Tạo muốn sửa thành tích của chính mình phải vào hồ sơ cá nhân. UI tắt chế độ sửa trên hồ sơ của chính người xem.
