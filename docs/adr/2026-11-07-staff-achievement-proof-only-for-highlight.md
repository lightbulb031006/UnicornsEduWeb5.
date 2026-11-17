# ADR: Chỉ thành tích nổi bật (gắn sao) bắt buộc ảnh minh chứng

- **Status:** Superseded by `docs/adr/2026-11-11-staff-achievement-star-first.md` (gắn sao trước, minh chứng sau; người khác sửa không bị ràng buộc)
- **Date:** 2026-11-07
- **Supersedes (một phần):** `docs/adr/2026-10-01-staff-achievement-proof-required.md` — quyết định 2 ("Tạo thành tích nhân sự phải kèm ảnh… Ảnh đã có chỉ được thay, không gỡ"). Các quyết định khác không đổi.

## Context

Từ khi có thành tích nổi bật (`docs/adr/2026-11-04-staff-highlight-achievement.md`), website chỉ hiện thành tích gắn sao cạnh ảnh gia sư. Bắt mọi dòng thành tích phải kèm ảnh làm gia sư ngại khai thêm thành tích phụ (thường không còn giấy chứng nhận), trong khi Ban Đào Tạo vẫn cần các dòng đó để ghép chuyên môn. Vận hành chỉ cần minh chứng cho thành tích được đưa lên website.

## Decision

1. Ảnh minh chứng bắt buộc **chỉ với thành tích nổi bật**:
   - Tạo thành tích đầu tiên (tự gắn sao) phải kèm ảnh; thiếu ảnh → 400, không tạo dòng.
   - Tạo các thành tích sau (không sao) được bỏ trống ảnh; `POST` vẫn multipart, `image` tuỳ chọn.
   - `PUT .../:id/highlight` với dòng chưa có ảnh → 400.
   - Xoá dòng có sao, còn đúng 1 dòng: chỉ tự gắn sao nếu dòng còn lại có ảnh; không thì để trống, gia sư tải ảnh rồi gắn sao.
2. `DELETE .../:id/image` của nhân sự được phép với dòng **không sao** (gỡ cả bản gốc + bản watermark). Dòng có sao → 400 (chỉ thay ảnh, hoặc chuyển sao đi trước).
3. Dòng có sao từ trước mà chưa có ảnh (backfill/migration) vẫn giữ sao — không tự gỡ, vẫn gắn nhãn thiếu minh chứng để gia sư bổ sung.
4. UI: nút sao bị khoá trên dòng chưa có ảnh (tooltip hướng dẫn tải ảnh trước); form thêm chỉ bắt ảnh khi danh sách đang rỗng; nút gỡ ảnh hiện trên dòng không sao.

## Considered options

- **Bỏ hẳn yêu cầu ảnh:** bị loại — thành tích nổi bật hiện công khai trên website nên cần minh chứng.
- **Tự gỡ sao các dòng đang có sao mà thiếu ảnh:** bị loại — làm gia sư bị gate chặn đột ngột khi deploy.

## Consequences

- Gia sư có thể có nhiều dòng thiếu minh chứng; Ban Đào Tạo cần coi dòng không ảnh là "tự khai".
- Gia sư chưa có ảnh thì không qua gate hồ sơ được (thành tích đầu tiên bắt buộc ảnh, gắn sao bắt buộc ảnh).
