# Vé 11 — Học sinh nhìn ra buổi nào có video

**Branch:** `SunnyYeahBoiii/student-session-video-thumb` (cắt từ `dev` sau vé 08). Vé 04–11: merge thẳng vào `dev`.

## Đã làm

- Timeline học sinh (`StudentSessionTimelineCard`): buổi có `recordingUrl` hiện **ảnh thumbnail tĩnh** (poster YouTube `hqdefault`, `loading="lazy"`, `alt` = “Video buổi học ngày …”). Buổi không có recording không render ô thumbnail.
- Bấm dòng/thumbnail vẫn mở `StudentSessionDetailDialog` với `YouTubeEmbed`; list **không** import/nhúng trình phát.
- “Có video” lấy từ `session.recordingUrl` (payload `GET /class/:id/timeline/student` sẵn có), không parse chữ mô tả.
- Bỏ **Xem thêm / Thu gọn** trên row buổi học và khảo sát học sinh — nội dung, bài tập, hướng dẫn, nhận xét riêng hiện đầy đủ.
- Tách `extractYouTubeVideoId` / `youtubeThumbnailUrl` sang `apps/web/lib/youtube.ts` để list không kéo bundle iframe player.

## Verify

- `apps/web` `tsc --noEmit` — 0 lỗi.
- `vitest run lib/youtube.test.ts` — 2 passed.
- Lint các file đã sửa — sạch.
- Browser: `http://localhost:3999/student` trả Internal Server Error / không vào được timeline (không có session học sinh trong phiên này).

## Docs

- `docs/pages/student.md`, `docs/CHANGELOG.md` [Unreleased] Added.

## Không làm

- Không đổi payload API (BE đã trả `recordingUrl` cho student).
- Không đụng **Xem thêm** trên timeline staff (`SessionTimelineCard` / `SurveyTimelineCard`).
