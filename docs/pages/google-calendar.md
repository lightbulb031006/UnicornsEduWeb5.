# Google Calendar Integration – Unicorns Edu (apps/api)

Tài liệu này mô tả hành vi Google Calendar hiện tại trong hệ thống Unicorns Edu.

---

## 1) Tổng quan

Google Calendar hiện gắn với:

- **lịch học định kỳ của lớp** (`Class.schedule`)
- **lịch dạy bù một lần** (`makeup_schedule_events`)
- **lịch thi của học sinh** (`student_exam_schedules`)

- Mỗi entry trong `Class.schedule` có thể được sync thành một recurring event trên Google Calendar.
- Event recurring này có thể kèm Google Meet link và được lưu ngược vào chính schedule JSON của lớp.
- Mỗi makeup event có thể được sync thành 1 event riêng trên Google Calendar, lưu `googleCalendarEventId`, `googleMeetLink`, `calendarSyncedAt`, `calendarSyncError` ngay trên record makeup.
- Mỗi exam schedule của học sinh được sync thành **all-day one-off event** trên Google Calendar theo kiểu “ngày lễ”; backend reconcile theo `studentId + examScheduleId` bằng `extendedProperties.private`, nên không cần thêm cột `googleCalendarEventId` vào bảng `student_exam_schedules`.
- Các màn `/admin/calendar` và `/staff/calendar` hiện render từ **aggregate calendar feed** ở frontend. Feed này gộp:
  - `fixed`: slot cố định expand từ `Class.schedule`
  - `makeup`: buổi bù tạo thủ công từ trang chi tiết lớp
  - `exam`: lịch thi all-day
- Trong workspace FE hiện tại, client vẫn fallback về contract schedule-only cũ nếu backend aggregate feed chưa có.
- **Session CRUD không còn sync Google Calendar.** Từ ngày **2026-04-14**, tạo/sửa/xóa `session` không được phép tạo, cập nhật, hay xóa Google Calendar event nữa.

Nói ngắn gọn: Google Calendar là tính năng của **lịch lớp theo tuần**, **buổi bù thủ công**, và **lịch thi all-day của học sinh**; nó không phải tính năng của **buổi học session**.

---

## 2) Cài đặt & Configuration

### 2.1 Dependencies

```bash
cd apps/api
pnpm add googleapis google-auth-library uuid
```

### 2.2 Google Cloud Setup

1. Tạo service account trong Google Cloud Console.
2. Tạo JSON key và lưu an toàn.
3. Nếu dùng calendar riêng, tạo calendar và copy `Calendar ID`.
4. Share calendar cho email gia sư nếu muốn họ nhận recurring invite của lịch lớp.

### 2.3 Environment Variables

```env
# Option 1: Base64 encoded service account JSON
GOOGLE_SERVICE_ACCOUNT_KEY="base64-encoded-json-content"

# Option 2: Direct file path for local dev
# GOOGLE_SERVICE_ACCOUNT_JSON_PATH="/path/to/key.json"

# Optional, defaults to the auth account's primary calendar
GOOGLE_CALENDAR_ID="your-calendar-id@group.calendar.google.com"

# Optional, defaults to Asia/Ho_Chi_Minh
GOOGLE_TIME_ZONE="Asia/Ho_Chi_Minh"
```

Ngoài service account, hệ thống vẫn hỗ trợ OAuth2 user credentials nếu cần behavior tốt hơn cho conference/invite handling:

```env
# Refresh token của tài khoản admin tạo Meet cố định cho gia sư.
# Token phải được consent với cả 2 scope:
# - https://www.googleapis.com/auth/calendar
# - https://www.googleapis.com/auth/meetings.space.settings
GOOGLE_OAUTH_CLIENT_ID="..."
GOOGLE_OAUTH_CLIENT_SECRET="..."
GOOGLE_REFRESH_TOKEN="..."
```

Hành vi runtime hiện tại:

- Nếu dùng `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN`, backend giữ `OAuth2Client` sống trong runtime để Google client library tự refresh access token khi cần; đây là cấu hình bắt buộc để cấp Meet `COHOST` cho staff qua Google Meet API.
- Nếu dùng `GOOGLE_SERVICE_ACCOUNT_KEY` hoặc `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`, backend giữ `JWT` auth client thay vì chỉ giữ access token lấy lúc boot, nên service-account access token cũng được refresh tự động.
- Nếu một request tới Google Calendar gặp lỗi auth/token hết hạn (`401`, `invalid_grant`, `invalid credentials`), service sẽ tự khởi tạo lại auth client và retry đúng 1 lần trước khi fail.

### 2.4 Module Registration

`GoogleCalendarModule` được import bởi `CalendarModule` và `StudentModule` để phục vụ sync recurring event của `Class.schedule`, event one-off của `makeup_schedule_events`, và all-day exam event của `student_exam_schedules`.

---

## 3) Runtime API

> Route note: business routes của Nest runtime không dùng global `/api` prefix. Swagger UI vẫn ở `/api`, còn route runtime dùng trực tiếp `/admin/calendar/...` và `/calendar/...`.

### 3.1 Các endpoint đang dùng thật

| Method   | Path                                            | Mô tả                                                                                                                                              |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/admin/calendar/events`                        | Aggregate calendar feed cho admin; hỗ trợ `startDate`, `endDate`, `teacherId`, `studentId`; trả event types `fixed` / `makeup` / `exam`            |
| `GET`    | `/admin/calendar/class-schedule`                | Contract cũ chỉ chứa fixed occurrence từ `Class.schedule`; FE dùng làm fallback tương thích                                                        |
| `GET`    | `/admin/calendar/classes/:classId/schedule`     | Lấy raw weekly schedule pattern của một lớp                                                                                                        |
| `PUT`    | `/admin/calendar/classes/:classId/schedule`     | Cập nhật weekly schedule pattern của lớp và sync recurring event lên Google Calendar                                                               |
| `GET`    | `/class/:classId/makeup-events`                 | Admin-like class workspace đọc danh sách buổi bù của lớp theo khoảng ngày                                                                          |
| `POST`   | `/class/:classId/makeup-events`                 | Admin hoặc assistant tạo buổi bù từ trang chi tiết lớp                                                                                             |
| `PATCH`  | `/class/:classId/makeup-events/:id`             | Admin hoặc assistant chỉnh sửa buổi bù từ trang chi tiết lớp                                                                                       |
| `DELETE` | `/class/:classId/makeup-events/:id`             | Admin hoặc assistant xoá buổi bù từ trang chi tiết lớp                                                                                             |
| `POST`   | `/class/:classId/schedule/google-calendar/resync` | Admin đầy đủ resync toàn bộ recurring Google Calendar event của lớp từ `Class.schedule` hiện tại                                                   |
| `POST`   | `/class/:classId/makeup-events/:id/google-calendar/resync` | Admin đầy đủ resync một buổi bù từ record `makeup_schedule_events` hiện tại                                                                        |
| `GET`    | `/staff-ops/classes/:classId/makeup-events`     | Staff workspace đọc danh sách buổi bù của lớp theo khoảng ngày                                                                                     |
| `POST`   | `/staff-ops/classes/:classId/makeup-events`     | Teacher được phân công lớp tạo buổi bù với chính mình là người phụ trách; admin cũng tạo được qua route này                                        |
| `PATCH`  | `/staff-ops/classes/:classId/makeup-events/:id` | Chỉ admin chỉnh sửa buổi bù trong staff workspace                                                                                                  |
| `DELETE` | `/staff-ops/classes/:classId/makeup-events/:id` | Chỉ admin xoá buổi bù trong staff workspace                                                                                                        |
| `POST`   | `/staff-ops/classes/:classId/schedule/google-calendar/resync` | Admin trong staff shell resync toàn lớp; staff thường chỉ resync các slot `Class.schedule` có `teacherId` là chính mình                             |
| `POST`   | `/staff-ops/classes/:classId/makeup-events/:id/google-calendar/resync` | Admin trong staff shell resync mọi buổi bù; staff thường chỉ resync buổi bù có `teacherId` là chính mình                                           |
| `GET`    | `/calendar/staff/events`                        | Staff calendar aggregate feed read-only của chính staff (teacher role); `exam` chỉ gồm học sinh đang thuộc lớp running do teacher đó phụ trách     |
| `GET`    | `/calendar/classes`                             | Danh sách lớp running cho filter; staff chỉ dùng được khi có role `teacher`, nếu không sẽ nhận `403`                                               |
| `GET`    | `/calendar/teachers`                            | Danh sách gia sư active cho filter                                                                                                                 |
| `GET`    | `/calendar/students`                            | Danh sách học sinh còn gắn với lớp đang chạy cho filter calendar; staff chỉ thấy học sinh thuộc lớp mình phụ trách và staff non-teacher nhận `403` |
| `POST`   | `/staff/:id/regenerate-meet-link`               | Tạo Meet link mới cho gia sư và lưu vào `staff_info.google_meet_link`; mọi `admin` hoặc `staff` role đều gọi được                                  |

### 3.2 Các endpoint đã retire

Các route session-oriented như `/admin/calendar/events/*` và `/calendar/events/*` không còn là contract runtime của feature calendar.

- Không dùng để tạo event cho session.
- Không dùng để resync session.
- Không dùng để xóa event khi xóa session.

### 3.3 Admin Calendar (`/admin/calendar`)

Trang `/admin/calendar` ưu tiên dùng `GET /admin/calendar/events` làm source of truth cho feed tổng hợp.

- Route mở cho `admin` và `staff.assistant`.
- FE hiện ưu tiên aggregate feed `/admin/calendar/events`, chỉ fallback về `/admin/calendar/class-schedule` để tương thích contract cũ khi cần.
- Có toggle **Tuần này / Tuần sau**, luôn giữ khung **Chủ Nhật đến Thứ Bảy**.
- Filter gồm multi-select lớp (client-side), `teacherId`, và `studentId`; riêng `teacherId` / `studentId` được gửi thẳng lên aggregate API.
- UI có 2 mode:
  - `Calendar`: week-view kiểu Google Calendar, bật all-day row để render `exam`
  - `Schedule`: list theo ngày, chỉ hiển thị ngày có event
- `exam` render all-day trong calendar/list/popup, theo ngữ nghĩa kiểu ngày lễ: card/list hiển thị lớp liên quan và popup không hiện CTA Google Meet.
- `/admin/calendar` chỉ còn vai trò read-only: popup event không còn CTA CRUD cho `makeup`.
- CRUD buổi bù đã chuyển sang card **Lịch dạy bù** trong trang chi tiết lớp.
- Popup event vẫn hiển thị `meetLink` nếu có, với CTA mở link và icon copy nhanh.

### 3.3.1 Makeup event sync

- Service dùng: `GoogleCalendarService.createOrUpdateMakeupScheduleEvent()`
- Khi tạo/sửa `makeup_schedule_events`, backend sẽ:
  1. validate `teacherId` thuộc lớp tương ứng
  2. lưu record makeup event
  3. resolve Meet link từ `staff_info.google_meet_link` của gia sư (auto-create nếu thiếu)
  4. sync một event one-off lên Google Calendar
  5. lưu lại `googleCalendarEventId`, `googleMeetLink` (ưu tiên link từ `staff_info`), `calendarSyncedAt`, `calendarSyncError`
- Khi xoá makeup event, backend sẽ cố xóa luôn Google Calendar event liên kết nếu có `googleCalendarEventId`.
- Manual resync chỉ xử lý từng buổi bù riêng lẻ. Nếu `googleCalendarEventId` đang lưu đã bị xoá bên Google, backend tạo event thay thế từ record DB hiện tại rồi cập nhật lại id mới.

### 3.4 Staff Calendar (`/staff/calendar`)

Staff có role `teacher` có thể xem lịch dạy cá nhân tại `/staff/calendar`.

- Backend tự resolve staff ID từ JWT.
- Staff page dùng cùng aggregate feed read-only và cùng toggle **Tuần này / Tuần sau**.
- Chỉ hiển thị những class mà staff đó phụ trách.
- `exam` chỉ hiện khi học sinh đang thuộc ít nhất một lớp `running` có `class_teachers.teacher_id = currentStaffId`; class context trên event cũng chỉ chứa các lớp khớp teacher hiện tại.
- Staff vẫn read-only: không có CTA tạo/sửa/xoá buổi bù.
- Popup vẫn cho mở và sao chép `meetLink` khi event có link họp; riêng `exam` hiển thị như event all-day và không có CTA Meet.

---

## 4) Sync Event Cho Calendar

### 4.1 Google Meet link theo gia sư (authoritative source)

Kể từ 2026-05-07, **nguồn authoritative cho Google Meet link là `staff_info.google_meet_link`** của gia sư phụ trách buổi học — không còn là link per-session hay per-entry.

**Quy tắc:**

- Khi gia sư đã có `google_meet_link` trong `staff_info`, link đó được tái sử dụng cho mọi lịch học và buổi bù mà gia sư phụ trách.
- Khi gia sư chưa có `google_meet_link`, backend tự tạo link thật qua Google Calendar API (helper `GoogleCalendarService.generateTutorMeetLink()`) và lưu link mới vào `staff_info.google_meet_link`. Link này được reuse cho tất cả các buổi sau.
- Regenerate thủ công: gọi `POST /staff/:id/regenerate-meet-link` (mọi staff role đều được phép). Backend tạo link mới, cập nhật `staff_info.google_meet_link`, rồi backfill link vào các `Class.schedule` entry và `makeup_schedule_events` mà gia sư đó phụ trách.
- Chiến lược tương thích: aggregate calendar feed ưu tiên `staff_info.google_meet_link` của gia sư phụ trách trước `entry.meetLink`, nên dữ liệu cũ sẽ hiển thị link cố định của staff ngay khi staff đã có link.

**Luồng auto-create và nhúng vào Google Calendar event:**

1. `CalendarService.syncScheduleWithCalendar()` gọi `StaffService.ensureTutorMeetLink(teacherId)`.
2. Nếu `staff_info.google_meet_link` đã có → trả về ngay.
3. Nếu chưa có → gọi `GoogleCalendarService.generateTutorMeetLink()` (tạo setup event riêng lấy Meet URL), persist vào `staff_info`, backfill lịch liên quan của gia sư, rồi trả về link.
4. Link này được truyền vào `GoogleCalendarService.createOrUpdateClassScheduleRecurringEvent({ meetLink })`:
   - Khi `meetLink` được cung cấp: link được ghi vào **mô tả** của Google Calendar event (`Google Meet: <url>`); `conferenceData.createRequest` bị bỏ qua (không tạo Meet room mới).
   - Khi không có `meetLink` (fallback hiếm gặp): dùng `conferenceData.createRequest` để Google tự tạo conference.
5. `entry.meetLink` trong JSON schedule cũng được set về link lấy từ `staff_info` (backward-compat FE đọc), kể cả khi Google Calendar trả về một link per-event khác.
6. Tương tự, `syncMakeupScheduleEventWithCalendar()` gọi `ensureTutorMeetLink()` và truyền link vào `createOrUpdateMakeupScheduleEvent({ meetLink })` — link xuất hiện trong description của event buổi bù.
7. Setup event tạo link cho gia sư sẽ **không bị auto-delete**. Sau khi lấy được Meet URL, backend gọi Google Meet API `v2/spaces/{meetingCode}` rồi `PATCH v2/{space.name}?updateMask=config.accessType` để set `config.accessType = OPEN`, giúp ai có link vào được mà không cần knock. Nếu bước này bị Google policy/scope chặn, backend vẫn giữ và lưu link vào `staff_info`, chỉ log warning.
8. Backend tiếp tục gọi Google Meet API `v2beta/spaces/{space}/members` để tạo member role `COHOST` cho staff ở dạng best-effort. Role này cho staff quyền quản lý meeting như host, bao gồm duyệt người vào khi người tham gia phải knock. Nếu bước cấp `COHOST` lỗi do scope/quyền Google Workspace, backend vẫn giữ setup event và vẫn lưu link vào `staff_info`; log `[TutorMeet]` sẽ ghi warning để sửa cấu hình Google mà không làm mất link của staff.

### 4.2 Recurring event cho `Class.schedule`

Mỗi schedule entry trong `Class.schedule` có thể được đồng bộ thành một recurring weekly event:

- Service dùng: `GoogleCalendarService.createOrUpdateClassScheduleRecurringEvent()`
- Recurrence: `RRULE:FREQ=WEEKLY;BYDAY=...`
- Thời điểm bắt đầu: occurrence gần nhất khớp `dayOfWeek`
- Attendees: ưu tiên tutor phụ trách của từng slot; chỉ fallback sang danh sách tutor của lớp cho các row legacy cũ chưa có `teacherId`. Quyền co-host nằm ở fixed Meet link của tutor (`staff_info.google_meet_link`), không nằm trên recurring Calendar event.
- Recurring event mới luôn gắn `extendedProperties.private` gồm `unicornsType=classSchedule`, `unicornsClassId`, `unicornsScheduleEntryId` để backend tìm lại và xoá/reconcile kể cả khi JSON schedule cũ thiếu `googleCalendarEventId`.

Khi gọi `PUT /admin/calendar/classes/:classId/schedule`, hệ thống sẽ:

1. Lưu schedule pattern mới xuống DB và giữ lại `googleCalendarEventId`/`meetLink` theo `scheduleEntryId` nếu slot vẫn tồn tại.
2. List Google Calendar theo private metadata và fallback `Class ID` trong description để tìm recurring event hiện có của lớp.
3. Với từng entry hiện tại, ưu tiên `events.update` trên event id đang lưu; nếu id cũ đã bị xoá bên Google (`404`) thì backend tạo event thay thế hoặc update event cùng `unicornsScheduleEntryId` đã discover được.
4. Resolve Meet link từ `staff_info` của gia sư phụ trách (auto-create nếu thiếu).
5. Sau khi các target entry đã sync xong, backend mới xoá orphan/duplicate Google event không còn thuộc schedule hiện tại; delete dùng `sendUpdates=none` và 404 được xem là idempotent success.
6. Lưu `googleCalendarEventId` và `meetLink` (lấy từ `staff_info`) ngược lại vào JSON `Class.schedule`.

Nếu bước xoá/sync Google Calendar lỗi, API cập nhật lịch học trả lỗi thay vì báo lưu thành công, để tránh trạng thái “lịch app đã đổi nhưng Calendar cũ vẫn còn” bị che khuất.

`CalendarService.enrichEventsWithMeetLinks()` chỉ đọc `meetLink` từ schedule entry đã sync để đổ vào `ClassScheduleEventDto`.

Khi gọi `PATCH /class/:classId/teachers` và một gia sư bị gỡ khỏi lớp, `ClassService.updateClassTeachers()` xoá toàn bộ entry trong `Class.schedule` có `teacherId` là gia sư bị gỡ. Sau khi DB prune schedule, backend gọi `CalendarService.syncScheduleWithCalendar(classId, oldSchedule)` để Google Calendar xoá recurring event của các slot cố định đã bị loại bỏ. Đây là guard backend bắt buộc; FE cũng xoá các slot đó ngay trong popup sửa lớp để người dùng thấy trước thay đổi.

Manual resync dùng cùng nguyên tắc **system schedule là source of truth, Google Calendar là projection**:

- Admin đầy đủ gọi `/class/:classId/schedule/google-calendar/resync` để update/recreate recurring Google event từ `Class.schedule` hiện tại rồi dọn orphan/duplicate sau cùng.
- Staff route `/staff-ops/classes/:classId/schedule/google-calendar/resync` giữ scope chặt hơn: `roleType=admin` resync toàn lớp, còn staff thường chỉ resync slot có `teacherId` là staff hiện tại.
- Staff-scoped resync không xoá slot không có `teacherId` và không xoá legacy Google event không có `unicornsScheduleEntryId`, vì backend không thể chứng minh event đó thuộc staff nào; response trả warning `ambiguous_legacy_event` để admin xử lý bằng full resync nếu cần.
- Response trả summary số event đã xoá/tạo/update, số stale id đã recover, trạng thái `quotaLimited`, số slot bị bỏ qua và danh sách warning để FE hiển thị toast/cache refresh đúng sau resync.
- Khi Google trả `quotaExceeded`, `rateLimitExceeded`, `userRateLimitExceeded` hoặc HTTP `429`, Google service retry bằng exponential backoff ngắn; nếu vẫn lỗi, resync đánh dấu `quotaLimited=true`, log `state=quota_limited`, dừng các write còn lại và giữ Google event hiện tại để lần sau retry tiếp.

---

### 4.2 One-off event cho `makeup_schedule_events`

- Mỗi makeup event là **một buổi độc lập, không lặp lại**.
- Record makeup không sinh `session` tự động; nó chỉ là nguồn event cho in-app calendar và Google Calendar.
- FE aggregate feed map record này thành event type `makeup`.

### 4.3 All-day event cho `student_exam_schedules`

- Mỗi lịch thi của học sinh được sync thành **all-day event** trên Google Calendar, hiển thị như một entry kiểu “ngày lễ”.
- Event dùng `start.date = examDate` và `end.date = examDate + 1 day`, không có giờ bắt đầu/kết thúc, không tạo Google Meet.
- Backend không lưu `googleCalendarEventId` cho lịch thi; thay vào đó, event được gắn `extendedProperties.private` với:
  - `unicornsType=studentExam`
  - `unicornsStudentId=<studentId>`
  - `unicornsStudentExamScheduleId=<examScheduleId>`
- Khi replace-all lịch thi của học sinh:
  1. backend cập nhật DB authoritative trước
  2. list toàn bộ Google event exam hiện có của học sinh theo marker ở trên
  3. create/update các exam row còn tồn tại
  4. xoá các Google event exam không còn trong danh sách mới

## 5) Session Và Google Calendar

### 5.1 Hành vi hiện tại

Session không còn là nguồn sync Google Calendar.

- `SessionCreateService.createSession()` không gọi Google Calendar.
- `SessionUpdateService.updateSession()` không gọi Google Calendar.
- `SessionDeleteService.deleteSession()` không gọi Google Calendar.

Điều này áp dụng cho cả luồng admin và luồng teacher/staff-ops.

### 5.2 Các field Google trên bảng `sessions`

Các field:

- `google_meet_link`
- `google_calendar_event_id`
- `calendar_synced_at`
- `calendar_sync_error`

vẫn còn trong schema để giữ backward compatibility với dữ liệu cũ, nhưng **không còn được auto-populate bởi session workflow hiện tại**.

Nếu có session lịch sử đã từng sync trước ngày 2026-04-14 thì dữ liệu cũ vẫn có thể còn tồn tại trong DB; hệ thống không tự dọn/xóa chúng trong thay đổi này.

---

### 5.3 Google Calendar Usage Limits

Theo Google Calendar API docs, lỗi `Calendar usage limits exceeded.` thường đi kèm reason `quotaExceeded`; rate limit có thể là `rateLimitExceeded`, `userRateLimitExceeded`, HTTP `403` hoặc `429`. Các giới hạn này áp theo authenticated user/calendar/project usage pattern; dùng secondary calendar hoặc tài khoản Google AI Pro không làm event writes miễn nhiễm với giới hạn Calendar API.

Runtime hiện tại xử lý theo hướng giảm write burst:

- Resync recurring update event hiện có trước, chỉ insert khi event id thiếu/stale.
- Các write trong recurring resync có khoảng nghỉ ngắn giữa request.
- Google service retry usage/rate limit bằng exponential backoff ngắn.
- Nếu vẫn bị limit, backend trả summary `quotaLimited=true`, warning `google_calendar_quota_limited`, dừng write còn lại và giữ projection hiện có để retry sau.

---

## 6) Debug Logging

Các log còn ý nghĩa cho feature này:

| Prefix Log               | Khi nào xuất hiện                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `[Calendar Startup]`     | Khi app khởi động và khởi tạo Google Calendar client                                 |
| `[Calendar Auth]`        | Khi request bị lỗi auth/token, service tự re-init client và retry một lần            |
| `[ClassService]`         | Khi cập nhật schedule lớp qua class workflow rồi gọi sync recurring event            |
| `[Calendar CRUD:GET]`    | Khi đọc occurrence của class schedule                                                |
| `[Calendar Resync:Recurring]` | Orchestration log cho resync recurring event từ `Class.schedule`; có `state=started/discovered/delete_candidates/existing_event_adopted/create_started/update_started/create_succeeded/update_succeeded/stale_event_detected/sync_failed/quota_limited/delete_started/delete_succeeded/delete_failed/skipped/summary` |
| `[Calendar Limit]`     | Khi Google Calendar trả usage/rate limit; service lên lịch retry bằng backoff trước khi trả lỗi về orchestration nếu vẫn fail |
| `[Calendar Resync:Makeup]` | Orchestration log cho sync/resync một `makeup_schedule_events`; có `state=started/sync_started/stale_event_detected/recreate_started/sync_succeeded/sync_failed/summary` |
| `[Calendar CRUD:sync]`   | Log legacy còn lại khi xóa/tạo recurring event cho `Class.schedule`                  |
| `[Calendar CRUD:DELETE]` | Google Calendar API delete event; có `state=started/succeeded/not_found/failed`      |
| `[Calendar Recurring]`   | Google Calendar API create/update recurring event; có `state=create_started/update_started/create_succeeded/update_succeeded/failed` |
| `[Calendar Makeup]`      | Google Calendar API create/update makeup event; có `state=create_started/update_started/create_succeeded/update_succeeded/create_failed/update_failed` |
| `[Calendar]`             | Các log nội bộ còn lại từ recurring-event sync và meet-link enrichment               |
| `[TutorMeet]`            | Khi tạo link Meet mới cho gia sư qua `GoogleCalendarService.generateTutorMeetLink()` |
| `[StaffService]`         | Khi auto-create hoặc regenerate Meet link cho gia sư qua `StaffService`              |

Session CRUD không còn log vòng đời sync Google Calendar nữa.

---

## 7) Kiểm thử nhanh

1. **Meet link theo gia sư (luồng mới):**
   - Xóa (hoặc null) `staff_info.google_meet_link` của một gia sư test.
   - Cập nhật schedule lớp có gia sư đó qua `PUT /admin/calendar/classes/:classId/schedule`.
   - Xác nhận `staff_info.google_meet_link` đã được populate tự động.
   - Xác nhận `entry.meetLink` trong `Class.schedule` trả về đúng link gia sư.
2. **Tái sử dụng link cũ:**
   - Gán lại gia sư đó vào một lịch khác; xác nhận link cũ được giữ nguyên (`staff_info.google_meet_link` không đổi).
3. **Regenerate thủ công:**
   - Gọi `POST /staff/:id/regenerate-meet-link`.
   - Xác nhận `staff_info.google_meet_link` được cập nhật link mới.
   - Sync lại schedule → `entry.meetLink` dùng link mới.
4. **Makeup event:**
   - Tạo/sửa một makeup event từ trang chi tiết lớp.
   - Xác nhận `makeup_schedule_events.google_meet_link` khớp với `staff_info.google_meet_link` của gia sư phụ trách.
5. **Backward compat:**
   - Xác nhận các entry cũ không bị tự động cập nhật link nếu không có sync mới.
6. **Không có session side effect:**
   - Tạo/sửa/xóa một session; xác nhận không có log Google Calendar nào được gọi.

---

## 8) Troubleshooting

| Vấn đề                                      | Kiểm tra                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Không sync được recurring event             | Kiểm tra `GOOGLE_SERVICE_ACCOUNT_KEY` hoặc `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`                                                                                                                                                |
| Token/access token bị expire                | Hệ thống sẽ tự refresh và retry 1 lần; nếu vẫn lỗi, kiểm tra `GOOGLE_REFRESH_TOKEN` hoặc quyền service account/key hiện tại còn hợp lệ                                                                                       |
| Không có Meet link                          | Kiểm tra auth method Google (phải là OAuth2), quyền conference/invite, và log response của Google API                                                                                                                        |
| Auto-create Meet link thất bại              | Kiểm tra OAuth2 credentials (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`); service account không hỗ trợ tạo conference data                                                               |
| Link vẫn yêu cầu knock dù đã tạo mới        | Kiểm tra refresh token admin có scope `https://www.googleapis.com/auth/meetings.space.settings`, Google Workspace/admin policy có cho phép `accessType=OPEN`, và log `[TutorMeet] ... setting accessType=OPEN failed`        |
| Gia sư không duyệt được người vào Meet      | Refresh token admin phải có scope `https://www.googleapis.com/auth/meetings.space.settings`; Google Meet API member role `COHOST` đang là Developer Preview nên project/domain Google Workspace cần được bật quyền tương ứng |
| Gia sư không nhận invite recurring event    | Kiểm tra email tutor đúng, calendar được share đúng, và slot có `teacherId` hợp lệ                                                                                                                                           |
| Muốn đổi Meet link của gia sư               | Gọi `POST /staff/:id/regenerate-meet-link`; link mới sẽ được dùng từ lần sync tiếp theo                                                                                                                                      |
| Tạo session nhưng Google Calendar không đổi | Đây là hành vi đúng từ 2026-04-14; session không còn sync calendar                                                                                                                                                           |
