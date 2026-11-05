# ADR: Video bảo vệ — đồng bộ qua UNIOJ, LMS tự ký token phát theo `video_id`

- **Status:** Accepted
- **Date:** 2026-10-18 (sửa 2026-10-23: chuyển từ route `/y/{youtube_id}` sang `/v/{video_id}`)

## Context

Video tiết lý thuyết (`lessons.video_url`) và recording buổi học (`sessions.recording_url`) đang nhúng YouTube, học sinh thấy được link gốc. Kho video nội bộ UniVideo phát HLS mã hoá qua Cloudflare Worker (`/t/{token}/v/{video_id}/…`). LMS gọi API `video-sync` của UNIOJ (v1.1): gửi link YouTube, nhận trạng thái và `video_id` của kho UniVideo. UNIOJ không cấp link phát.

## Decision

1. LMS gửi link qua `POST /api/video-sync/` của UNIOJ mỗi khi link được lưu/đổi; một dòng trạng thái mỗi `youtube_id` (kèm `video_id`), cron 60 giây poll các dòng chưa xong. Học sinh mở trang chỉ đọc DB.
2. LMS tự ký Playback Token đúng định dạng UniVideo (`{v: video_id, tv, exp}`, HMAC-SHA256 bằng `TOKEN_SECRET` của kho), TTL cố định 4 giờ, chỉ trong endpoint đã kiểm quyền xem tiết/buổi (nhận `classId` + `lessonId`/`sessionId`, không nhận `youtube_id`/`video_id`). Không cần Khóa API UniVideo, không gọi VPS khi phát, Worker giữ nguyên.
3. Link YouTube không bao giờ tới trình duyệt học sinh. Video chưa sẵn sàng → «Video đang xử lý», không phát dự phòng bằng YouTube. Bật ngay cho mọi dữ liệu cũ, chấp nhận gián đoạn tới khi backfill xong.
4. Player: Video.js v10 (`@videojs/react`, kế thừa Vidstack, đã có sẵn trong `apps/web`, kèm hls.js qua `HlsJsVideo`) thay vì thêm `@vidstack/react` + `hls.js`; tự xử lý `403` (xin link mới, phát tiếp đúng vị trí). Lưu ý: bản beta (`10.0.0-beta.x`).

## Considered options

- **Xin token qua API UniVideo bằng Khóa API riêng:** LMS không giữ secret của kho, khoá lộ thì xoá được ngay; nhưng thêm một phụ thuộc VPS mỗi lần cấp link. Chủ hệ thống chọn tự ký.
- **Route `/y/{youtube_id}` + `YT_TOKEN_SECRET` riêng (bản đầu của ADR này):** cần sửa Worker; bỏ khi UNIOJ trả thêm `video_id`.
- **Fallback YouTube khi chưa sẵn sàng:** không gián đoạn, nhưng phá mục tiêu giấu link.

## Consequences

- LMS giữ `TOKEN_SECRET` của kho: lộ secret phía LMS là ký được link cho **mọi** video trong kho, không riêng video của LMS. Xoay secret phải đổi cùng lúc ở VPS, Worker và LMS.
- `tv` trong token cố định bằng 1 (giá trị mọi Video mới nhận). Nếu UNIOJ thu hồi token của một Video (`token_version` tăng), link LMS cấp cho video đó bị 403 tới khi LMS đổi cách đọc `token_version`.
- Không thu hồi tức thì: gỡ/đổi link chỉ ngừng cấp link mới; ai đang cầm link phát tiếp tối đa 4 giờ.
- Video là của UNIOJ trong kho chung; UNIOJ cam kết không xoá video gửi qua API.
- Link YouTube trong text tự do (nội dung tiết, tutorial buổi, BTVN) không được bảo vệ.
- Worker đang để `CORS_ORIGIN=*`; nếu sau này giới hạn thì phải thêm domain LMS.
