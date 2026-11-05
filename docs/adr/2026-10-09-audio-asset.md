# ADR: Audio tư liệu là asset bất biến trong bucket private, đọc qua signed URL

- **Status:** Accepted — sửa bởi `2026-10-09-question-set.md` (bỏ audio riêng từng câu; mỗi asset thuộc đúng một bộ)
- **Date:** 2026-10-09
- **Ticket:** #200 (chuẩn bị cho #201 giới hạn lượt nghe)

## Context

Đề JP có phần nghe hiểu: một bài nghe cho cả nhóm câu (gắn vào Tư liệu dùng chung) hoặc audio riêng cho một câu. Bài làm snapshot đề lúc start; nếu người soạn thay audio giữa chừng, học sinh đang làm phải nghe đúng bản lúc bắt đầu. Audio là nội dung đề — không được lộ công khai trước giờ làm, và #201 cần server kiểm soát việc phát.

## Decision

1. Bảng `audio_assets` thuộc **khoá học**: `storage_path`, `mime_type`, `size_bytes`, `original_name`. Câu và tư liệu tham chiếu qua `audio_id` (tối đa một mỗi nơi, `ON DELETE SET NULL`).
2. **Bất biến:** không có endpoint sửa/xoá asset. Thay audio = tải asset mới và đổi `audio_id`. File cũ giữ lại; snapshot `attempt_answers.audio_id` / `shared_material_audio_id` (không FK) vẫn phát được.
3. Upload qua API (`POST /audio-assets`, multipart, ≤ 20MB, MP3/M4A/AAC/WAV — phát được trên iOS Safari) vào bucket **private** `question-audio`.
4. Đọc qua **signed URL 6 giờ**, ký theo lô (`createSignedUrls`) chỉ trong các endpoint đã kiểm quyền xem câu (ngân hàng câu hỏi, bài làm, ôn nhẹ). Không trả `storage_path`. Tải lại trang = URL mới.

## Considered options

- **Bucket public / URL cố định:** đơn giản, cache tốt, nhưng ai có link nghe được đề trước giờ làm và #201 không thể chặn phát.
- **Audio nhúng trong HTML TipTap:** không snapshot được file, không áp giới hạn lượt nghe.
- **Asset sửa được (upsert cùng path):** bài làm đang chạy đổi audio giữa chừng; phá snapshot.

## Consequences

- File không còn được tham chiếu vẫn nằm trong bucket (chấp nhận; dọn rác nếu cần sẽ là job riêng, kiểm cả snapshot).
- #201 thêm giới hạn lượt nghe trên từng asset (`max_plays`, `allow_seek` — ngoại lệ duy nhất của tính bất biến: chỉ cấu hình phát, không đổi file; đọc live nên áp cả lượt đang làm). URL của audio bị giới hạn cấp qua `POST .../attempts/:attemptId/audio/:audioId/play` (đếm lượt trong `attempt_audio_plays`) thay vì trả sẵn trong bài làm. Signed URL vẫn dùng được tới khi hết hạn — giới hạn chặn ở mức giao diện + cấp URL, không chặn người tự lưu link.
