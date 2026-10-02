# PRD: Tích hợp Tải lên & Quản lý Video Bài học qua YouTube API

## Problem Statement

Hệ thống CRM/HRM Local cần lưu trữ video recording các buổi học (file ~1GB/buổi) để học sinh xem lại. Việc lưu trữ và phát trực tiếp từ máy chủ Local gây ra hai vấn đề:

1. **Nghẽn mạng văn phòng**: Khi nhiều học sinh cùng xem video từ server nội bộ, băng thông mạng bị bão hòa.
2. **Đầy ổ cứng**: File video 1GB × nhiều buổi × nhiều lớp = hàng trăm GB, vượt dung lượng ổ cứng máy Local.

Khách hàng cần một giải pháp tận dụng hạ tầng miễn phí (YouTube) để lưu trữ và stream video, trong khi hệ thống CRM vẫn giữ quyền quản lý danh sách bài học, phân quyền xem, và hiển thị trong giao diện hiện có.

## Solution

Tích hợp YouTube Data API v3 vào hệ thống theo mô hình "YouTube as storage layer, CRM as management layer":

- **Gia sư** upload file video lên server Local qua giao diện chunked upload (chia nhỏ 10MB/mảnh, song song 3-5 luồng). Server nhận đủ mảnh, gộp thành file hoàn chỉnh bằng stream (không nạp 1GB vào RAM), rồi đẩy job vào hàng đợi ngầm.
- **Worker ngầm** xử lý: đổi trạng thái lớp sang "updating", upload video lên YouTube (chế độ unlisted) qua OAuth 2.0, gán vào Playlist của lớp, ghi nhận vào database, đổi trạng thái về "ready", xóa file tạm trên ổ cứng.
- **Học sinh** xem danh sách bài học từ database nội bộ (0 quota YouTube), phát video qua YouTube iframe embed.

## User Stories

### Gia sư — Upload video

1. As a gia sư, I want to select a class and enter a lesson name before uploading a video file, so that the recording is correctly associated with the right class and session.
2. As a gia sư, I want to upload a video file up to 1GB, so that full session recordings can be stored.
3. As a gia sư, I want to see upload progress percentage during the upload, so that I know the file is being transferred.
4. As a gia sư, I want the upload to resume automatically if my network drops briefly, so that I don't restart a 1GB file from zero.
5. As a gia sư, I want to receive a clear message after the file finishes uploading to the server, telling me the system is processing in the background, so that I can close the browser or navigate away.
6. As a gia sư, I want to see an error message if the upload fails after maximum retries, so that I can decide to retry or contact support.
7. As a gia sư, I want to be blocked from uploading more than 100 videos per day, so that YouTube API quota is not exhausted.

### Gia sư — Quản lý bài học (CRUD)

8. As a gia sư, I want to edit the lesson name after upload, so that I can correct naming mistakes.
9. As a gia sư, I want to reorder lessons within a class, so that the playback sequence matches the teaching progression.
10. As a gia sư, I want to remove a lesson from the class playlist, so that unwanted recordings are hidden from students.
11. As a gia sư, I want the system to NOT delete the original YouTube video when I remove a lesson, so that data is not permanently lost.
12. As a gia sư, I want to see the sync status of each class (ready or updating), so that I know if background processing is still in progress.

### Học sinh — Xem bài học

13. As a học sinh, I want to see a list of lesson recordings for my class, so that I can review past sessions.
14. As a học sinh, I want the lesson list to load instantly from the local database, so that page speed is not affected by YouTube API latency.
15. As a học sinh, I want to watch a lesson video embedded in the CRM interface, so that I don't need to navigate to YouTube.
16. As a học sinh, I want to see a loading indicator when a class is in "updating" status, so that I understand why a new lesson might not appear yet.
17. As a học sinh, I want to only see lessons for classes I'm enrolled in, so that I cannot access other classes' recordings.

### Admin/Operations — Quản trị hệ thống

18. As an admin, I want to configure the YouTube OAuth credentials for the center's account, so that the system can upload videos on behalf of the center.
19. As an admin, I want to see a dashboard of upload jobs (pending, processing, completed, failed), so that I can monitor system health.
20. As an admin, I want failed upload jobs to be retryable, so that temporary YouTube API issues don't require re-uploading the entire file.
21. As an admin, I want a daily cleanup job that deletes temporary files older than 24 hours, so that the local disk doesn't fill up from failed uploads.
22. As an admin, I want to see the total number of videos uploaded per day, so that I can monitor against the YouTube quota limit.

### Developer — Kiến trúc & bảo trì

23. As a developer, I want the chunked upload API to be a separate module from the existing image upload, so that video logic doesn't pollute the image upload path.
24. As a developer, I want the YouTube upload worker to be a background job processor, so that the main API server is not blocked by long-running uploads.
25. As a developer, I want the database schema to cache YouTube video metadata, so that student-facing reads never consume YouTube API quota.
26. As a developer, I want frontend DTOs centralized in the DTO layer, so that pages and components don't drift in payload shape.
27. As a developer, I want tests for external behavior rather than implementation details, so that refactors don't break useful coverage.
28. As a developer, I want docs updated for schema, routes, and YouTube integration, so that future agents understand the intended model.

## Implementation Decisions

### Schema changes

- Thêm 2 trường vào model `Class`:
  - `youtubePlaylistId` (String, Nullable): mã playlist YouTube tương ứng với lớp.
  - `videoSyncStatus` (String, default `"ready"`): trạng thái đồng bộ video — `"ready"` (học sinh xem được) hoặc `"updating"` (đang xử lý ngầm).
- Thêm 1 trường vào model `Session`:
  - `youtubeVideoId` (String, Nullable): mã video YouTube của buổi học recording.
- Tạo model mới `VideoUploadJob`:
  - `id` (Primary Key)
  - `sessionId` (FK → Session): buổi học mà video thuộc về.
  - `classId` (FK → Class): lớp mà video thuộc về.
  - `uploadId` (String): mã định danh lượt upload (dùng để gộp chunk).
  - `localFilePath` (String): đường dẫn file đã gộp trên ổ cứng.
  - `status` (Enum: `pending`, `merging`, `uploading`, `completed`, `failed`).
  - `youtubeVideoId` (String, Nullable): ID video YouTube (có sau khi upload xong).
  - `errorMessage` (String, Nullable): thông báo lỗi nếu fail.
  - `retryCount` (Int): số lần đã retry.
  - `createdAt`, `updatedAt` (DateTime).

### Kiến trúc module Backend

- Tạo module `video-upload/` riêng biệt, không dùng chung với module `storage/` (vốn chỉ xử lý ảnh qua Supabase).
- Module `video-upload/` gồm:
  - **Controller**: nhận chunk (POST `/video-upload/:uploadId/chunk`), báo hoàn thành (POST `/video-upload/:uploadId/complete`), lấy danh sách job (GET `/video-upload/jobs/:classId`).
  - **Service**: quản lý chunk, gộp file bằng stream, tạo job record.
  - **Worker/Processor**: xử lý job từ queue — upload YouTube, cập nhật DB, dọn file.
- Module `class/` bổ sung endpoint quản lý playlist (tạo playlist YouTube khi cần, lấy danh sách video từ DB).

### Queue & Worker

- Sử dụng `@nestjs/bullmq` + `ioredis` làm hàng đợi.
- Redis server chạy trên máy Local (cần cài đặt).
- Queue name: `video-upload-queue`.
- Worker process: đọc job → invalidate cache (set `videoSyncStatus = "updating"`) → YouTube Resumable Upload → playlistItems.insert → renew cache (set `videoSyncStatus = "ready"`) → cleanup file.

### YouTube API Integration

- Tận dụng package `googleapis` đã cài (v171.4.0) — gọi `google.youtube('v3').videos.insert()` với Resumable Upload.
- OAuth 2.0 flow: admin ủy quyền一次, hệ thống lưu `refresh_token` vào bảng config hoặc biến môi trường.
- Privacy status: `unlisted` (video không public, chỉ ai có link mới xem được).
- Playlist: mỗi lớp ứng 1 YouTube playlist, tạo tự động khi lớp đầu tiên cần upload.

### Frontend

- Thư viện upload: **Uppy** (hoặc Resumable.js) — chia mảnh 10MB, song song 3-5 luồng, tự retry 3 lần.
- Trang upload: tích hợp vào class detail page (`admin/classes/[id]`) dưới tab mới "Video bài học".
- Trình phát video: YouTube `<iframe>` embed — không cần thư viện player.
- Danh sách bài học cho học sinh: đọc từ DB qua TanStack Query, render list + iframe khi chọn bài.
- Progress bar: dùng Uppy built-in progress UI hoặc custom component theo design tokens.

### API Contracts

- `POST /video-upload/:uploadId/chunk` — nhận chunk file (multipart), trả về `{ received: number, total: number }`.
- `POST /video-upload/:uploadId/complete` — báo hoàn thành, trigger merge + queue job. Body: `{ sessionId, classId, title, totalChunks }`.
- `GET /video-upload/jobs/:classId` — lấy danh sách job + trạng thái cho class.
- `GET /classes/:classId/lessons` — lấy danh sách bài học (đọc từ DB, không gọi YouTube).
- `PATCH /classes/:classId/lessons/:sessionId` — sửa tên, đổi thứ tự.
- `DELETE /classes/:classId/lessons/:sessionId` — gỡ khỏi playlist (chỉ xóa DB, không xóa YouTube).

### Cron Job

- `@nestjs/schedule` — cron chạy 2h sáng hàng ngày.
- Quét thư mục temp, xóa file tồn tại > 24 giờ.
- Đánh dấu job tương ứng là `failed` nếu chưa hoàn thành.

## Testing Decisions

- Good tests cover externally visible behavior: accepted/rejected payloads, persisted state, queue job lifecycle, YouTube API interaction outcomes, and cleanup side effects. Do not test private implementation details.
- Backend unit tests:
  - Module `video-upload/`: chunk validation, merge stream correctness, job state transitions, retry logic, cleanup behavior.
  - YouTube service (mocked): upload payload, playlist insertion, error handling, quota exceeded scenario.
- Integration tests:
  - Full upload flow: chunk → merge → queue → worker → DB update → cleanup.
  - Resume flow: interrupt chunk upload → resume → complete.
- Frontend tests:
  - Upload progress display, error states, sync status indicator.
  - Lesson list rendering from mock data, iframe embed correctness.
- Prior art: existing tests in `session/` module (state transitions, validation), `storage/` module (file handling).

## Out of Scope

- **Transcoding / video processing**: không cắt, ghép, nén, hay chuyển đổi định dạng video. File upload nguyên bản lên YouTube.
- **Video analytics**: không lấy số lượt xem, thời gian xem, hay báo cáo từ YouTube Analytics API.
- **Subtitles / captions**: không xử lý phụ đề tự động hay thủ công.
- **Live streaming**: không tích hợp YouTube Live. Chỉ hỗ trợ recording upload sau buổi học.
- **Multiple language support**: giao diện và thông báo chỉ tiếng Việt.
- **Mobile app**: tính năng chỉ dành cho web CRM. Học sinh xem trên mobile qua responsive web.
- **Video compression before upload**: không nén file trước khi upload. Gia sư upload file gốc.
- **YouTube channel management**: không tạo/quản lý channel. Chỉ upload vào channel của trung tâm đã ủy quyền.

## Further Notes

### YouTube API Quota

- Mặc định 10,000 units/ngày. Upload video tốn 1,600 units → tối đa ~6 video/ngày.
- PRD gốc ghi "100 video/ngày" là không khả thi với quota mặc định. Cần submit quota increase request lên Google, hoặc giới hạn thực tế ở mức 6 video/ngày.
- Giải pháp thay thế: xin quota increase hoặc dùng nhiều API key/project (không khuyến khích vì phức tạp).

### OAuth 2.0 Setup

- Cần 1 lần ủy quyền từ tài khoản YouTube của trung tâm.
- Refresh token có thể hết hạn sau 7 ngày nếu app ở chế độ "testing". Cần submit app cho Google verification để dùng production token.
- Alternative: dùng Service Account (không cần refresh token) nhưng cần YouTube channel liên kết với Google Workspace.

### Redis Dependency

- Hệ thống hiện tại chưa có Redis. Cần cài Redis server trên máy Local khách hàng.
- Alternative: dùng BullMQ với SQLite backend (không cần Redis) — giảm phức tạp triển khai nhưng kém hiệu năng hơn.

### Storage Consideration

- File 1GB tạm trên ổ cứng trong thời gian xử lý. Nếu ổ cứng đầy, job fail.
- Cần monitor disk space và alert khi còn < 10GB.
- Cron cleanup là safety net, không phải giải pháp chính.

### Estimate Revision

- PRD gốc ước tính 3-5 ngày, 3-5 triệu VND.
- Thực tế: cần thêm Redis setup, YouTube OAuth flow, queue system — ước tính **5-7 ngày** cho developer quen codebase.
- Chi phí hạ tầng phát sinh: Redis server (nếu dùng cloud), YouTube API quota (nếu cần tăng).
