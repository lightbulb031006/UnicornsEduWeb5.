# Review: xoá Google Calendar event cũ khi đổi lịch học lớp

## Phạm vi

Rà luồng tạo/xoá lịch học định kỳ của lớp, tập trung vào việc xoá event cũ trên Google Calendar khi `Class.schedule` thay đổi hoặc bị xoá.

## Google Calendar API cần dùng

- Hệ thống đang tạo event trong một calendar đã cấu hình, không tạo calendar riêng cho từng lớp.
- Để xoá lịch học cũ, API đúng là `events.delete`: `DELETE /calendars/{calendarId}/events/{eventId}`.
- `calendars.delete` chỉ dùng khi muốn xoá cả secondary calendar. `calendarList.delete` chỉ gỡ một calendar khỏi danh sách calendar của user, không xoá event trong calendar đó.
- API xoá event cần cả `calendarId` và `eventId`. Chỉ lưu `eventId` là chưa đủ nếu event từng được tạo trên calendar khác hoặc config `GOOGLE_CALENDAR_ID` thay đổi.

Nguồn docs đã đối chiếu bằng Context7:
- Google Calendar API v3 `Events.delete`
- Google Calendar API v3 `Calendars.delete`
- Google Calendar API v3 `CalendarList.delete`
- Google Calendar API v3 `Events.list` với `privateExtendedProperty`

## Hiện trạng code

### 1) Dữ liệu lịch lớp

- `Class.schedule` là JSON trong `apps/api/prisma/schema/learning.prisma`.
- Mỗi schedule entry có thể chứa:
  - `id`
  - `dayOfWeek`
  - `from`
  - `to`
  - `teacherId`
  - `googleCalendarEventId`
  - `meetLink`
- Không có bảng riêng cho recurring schedule entry, cũng không có cột/field `googleCalendarId`.

### 2) FE sửa lịch lớp

`apps/web/components/admin/class/EditClassSchedulePopup.tsx`:

- Khi load lịch cũ, FE giữ `record.id` trong `persistedId`.
- Khi submit, FE gửi lại `id`, `dayOfWeek`, `from`, `to`, `teacherId`.
- FE không gửi `googleCalendarEventId`; backend tự preserve metadata này từ schedule JSON cũ.

Đây là hướng đúng. Event id không nên do FE quản lý.

### 3) Backend update lịch lớp

`apps/api/src/class/class.service.ts`:

- `updateClassSchedule()` đọc class hiện tại trước khi update.
- `mergeScheduleEntriesWithExisting()` preserve `googleCalendarEventId` và `meetLink` theo schedule entry `id`.
- Sau khi lưu schedule mới, service gọi:

```ts
await this.calendarService.syncScheduleWithCalendar(id, oldSchedule);
```

Nhận xét:

- Comment nói đúng ý đồ: truyền `oldSchedule` để xoá event cũ trước khi tạo event mới.
- Vì `oldSchedule` được lấy từ DB trước update, việc xoá không phụ thuộc FE có giữ id mới hay không, miễn là schedule cũ đã có `googleCalendarEventId`.

### 4) Calendar sync hiện tại

`apps/api/src/calendar/calendar.service.ts`:

- `syncScheduleWithCalendar(classId, oldSchedule?)`:
  1. Fetch class hiện tại.
  2. `entriesToDelete = oldSchedule || currentSchedule`.
  3. Với mỗi old entry có `googleCalendarEventId`, gọi `googleCalendarService.deleteCalendarEvent(...)`.
  4. Clear `googleCalendarEventId`/`meetLink` trên current entries.
  5. Tạo recurring event mới cho từng current entry.
  6. Lưu event id mới ngược lại vào `Class.schedule`.

Kết luận: happy path xoá event cũ đã có, nhưng chỉ xoá bằng danh sách event id đã lưu trong schedule JSON cũ.

### 5) GoogleCalendarService

`apps/api/src/google-calendar/google-calendar.service.ts`:

- `deleteCalendarEvent(eventId)` gọi `this.calendar!.events.delete({ calendarId: this.config.calendarId || 'primary', eventId })`.
- `createOrUpdateClassScheduleRecurringEvent(...)` tạo event recurring weekly với summary/description/start/end/recurrence/attendees.
- Recurring class event hiện chỉ ghi `Class ID` và `Schedule Entry ID` vào description, chưa ghi `extendedProperties.private`.

## Lỗ hổng chính

### Finding 1: Xoá event cũ chỉ hoạt động nếu schedule JSON cũ đã có `googleCalendarEventId`

Nếu dữ liệu được tạo trước khi sync lưu event id, hoặc từng bị overwrite bởi endpoint/logic không giữ metadata, `oldSchedule` không có `googleCalendarEventId`; sync sẽ tạo event mới nhưng không biết event cũ nào để xoá.

Tác động:

- Google Calendar còn event cũ.
- DB chỉ biết event mới, không còn pointer đến event cũ.
- Sau vài lần chỉnh, calendar có thể tích tụ nhiều recurring event trùng lớp.

### Finding 2: Không lưu `calendarId` cạnh `eventId`

Google API xoá event cần `calendarId + eventId`, nhưng hệ thống chỉ lưu `googleCalendarEventId`.

Nếu event cũ từng được tạo dưới:

- `primary`
- một `GOOGLE_CALENDAR_ID` cũ
- tài khoản OAuth/service account khác
- calendar đã chuyển ownership/quyền

thì `deleteCalendarEvent()` sẽ xoá trên calendar hiện tại và có thể không tìm thấy event cũ.

### Finding 3: Class recurring events không có `extendedProperties.private`

Student exam sync đã dùng pattern tốt:

- list event bằng `privateExtendedProperty`
- map theo schedule/item id
- delete leftover events

Class recurring event chưa có private metadata như:

- `unicornsType=classSchedule`
- `unicornsClassId=<classId>`
- `unicornsScheduleEntryId=<entryId>`

Vì vậy khi mất `googleCalendarEventId`, backend không có cách reconcile đáng tin cậy. Search bằng description hoặc summary chỉ là fallback yếu.

### Finding 4: Xoá class không cleanup Google Calendar

`ClassService.deleteClass()` chỉ xoá DB record trong transaction. Không thấy call `syncScheduleWithCalendar(id, oldSchedule)` hoặc loop xoá `googleCalendarEventId` trước khi delete.

Tác động:

- Nếu xoá lớp, recurring event của `Class.schedule` có thể còn trên Google Calendar.
- `makeup_schedule_events` có `onDelete: Cascade`, nhưng cascade DB không gọi `deleteCalendarEvent()` cho Google event liên kết.

### Finding 5: Test chưa cover path xoá old recurring event

`calendar.service.spec.ts` có test tạo mới event và lưu `googleCalendarEventId`, nhưng call `syncScheduleWithCalendar('class-1', [])`.

Thiếu test:

- `oldSchedule` có `googleCalendarEventId` thì gọi `deleteCalendarEvent`.
- xoá schedule hết entry thì delete old events và không create event mới.
- delete class cleanup recurring + makeup Google events.
- delete idempotent với Google 404.

## Hướng sửa đề xuất

### P0: làm chắc xoá theo event id hiện có

1. Thêm test cho `CalendarService.syncScheduleWithCalendar()`:
   - old schedule có `googleCalendarEventId`.
   - expect `deleteCalendarEvent(oldEventId)` được gọi trước create.
   - schedule mới rỗng thì không create event.
2. Sửa `deleteCalendarEvent()` nhận optional `{ calendarId, sendUpdates }`.
3. Handle 404 theo `error.code`/`error.response.status`, không chỉ `message.includes('not found')`.
4. Thêm `sendUpdates: 'none'` hoặc quyết định rõ policy notify attendee.

### P1: lưu đủ metadata để xoá đúng calendar

Thêm metadata cho recurring schedule entry:

```ts
googleCalendarEventId?: string;
googleCalendarId?: string;
calendarSyncedAt?: string;
calendarSyncError?: string;
```

Khi tạo event mới, lưu cả `calendarId` đang dùng. Khi xoá, dùng `entry.googleCalendarId ?? config.calendarId ?? 'primary'`.

### P2: thêm `extendedProperties.private` cho class recurring event

Khi create/update class recurring event, thêm:

```ts
extendedProperties: {
  private: {
    unicornsType: 'classSchedule',
    unicornsClassId: classId,
    unicornsScheduleEntryId: entryId,
  },
}
```

Sau đó thêm helper reconcile:

- list event theo `unicornsType=classSchedule` và `unicornsClassId=<classId>`
- map theo `unicornsScheduleEntryId`
- delete event không còn trong schedule hiện tại
- update/create event còn lại

Đây là pattern nên copy từ `syncStudentExamScheduleEvents()`.

### P3: cleanup khi xoá lớp

Trước khi xoá class:

1. Read `Class.schedule` + `makeupScheduleEvents.googleCalendarEventId`.
2. Best-effort delete Google events.
3. Sau đó delete DB class.

Không nên để DB cascade makeup event trước khi lấy event ids.

## Update triển khai 2026-05-19

Đã triển khai phần bảo đảm xoá cho recurring class schedule:

- `GoogleCalendarService.createOrUpdateClassScheduleRecurringEvent()` gắn `extendedProperties.private` cho recurring event mới.
- `GoogleCalendarService.listClassScheduleRecurringEvents()` list event theo private metadata và fallback các event legacy có `Class ID: <classId>` trong description.
- `CalendarService.syncScheduleWithCalendar()` xoá cả event id lưu trong schedule cũ và event tìm lại được trên Google trước khi tạo recurring event mới.
- `GoogleCalendarService.deleteCalendarEvent()` gọi delete với `sendUpdates=none` và xem 404/not found là idempotent success.
- `ClassService.updateClassSchedule()` không còn nuốt lỗi sync Calendar; lỗi xoá/sync sẽ làm API trả lỗi để người dùng không thấy trạng thái lưu thành công giả.

Giới hạn còn lại: Google API chỉ xoá được event mà backend có thể định danh qua `eventId`, private metadata, hoặc legacy description có `Class ID`. Event đã bị sửa tay xoá mất mọi marker này thì không thể chứng minh thuộc class schedule nào bằng API.

## Kết luận

Code ban đầu không phải hoàn toàn chưa có xoá. Nó có xoá trong happy path, nhưng phụ thuộc vào pointer `googleCalendarEventId` trong JSON schedule cũ. Patch 2026-05-19 đã thêm metadata + reconcile để tìm/xoá cả event legacy tìm được theo `Class ID`. Việc lưu riêng `calendarId` cạnh từng schedule entry và cleanup khi xoá cả class vẫn là hardening tiếp theo.

## Update triển khai 2026-08-18

Nguyên nhân Cloudflare 502 khi tạo/xoá khung giờ học: `google.calendar({...})` client (`GoogleCalendarService`) không set `timeout`, nên khi Google API/network treo, `executeCalendarRequest()` chờ vô hạn → request Nest treo → Cloudflare gateway timeout. Ngoài ra, vòng lặp xoá recurring event cũ trong `resyncClassScheduleWithGoogleCalendarInternal()` (`CalendarService`) từng `throw` ngay khi gặp lỗi generic (không phải quota), làm mất luôn bước `prisma.class.update()` writeback cuối cùng — kể cả `googleCalendarEventId` của các event vừa tạo/cập nhật thành công trong CÙNG lần sync cũng bị mất, khiến lần sync sau tạo trùng event trên Google Calendar.

Đã fix:

- **Timeout cho Google API** (`google-calendar.service.ts`): set `timeout: GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS` (20s production, 50ms khi test) một lần lúc khởi tạo `google.calendar({...})` — áp dụng cho mọi call qua client đó. Thêm `GoogleCalendarTimeoutError` (`errors/google-calendar.errors.ts`, HTTP 504) và `isTimeoutError()` nhận diện lỗi gaxios abort (`error.code === 'TimeoutError'`) là guard đầu tiên trong `executeCalendarRequest()`'s catch — timeout fail nhanh, không bị nhầm retry như lỗi auth/quota.
  - **Lưu ý về phạm vi quan sát được của `GoogleCalendarTimeoutError`**: các method nghiệp vụ gọi `executeCalendarRequest` (`createOrUpdateClassScheduleRecurringEvent`, `deleteCalendarEvent`, ...) có `catch` ngoài bọc lại MỌI lỗi (kể cả `GoogleCalendarError` đã có type) thành `GoogleCalendarApiError` chung — hành vi này có từ trước, không thuộc phạm vi fix lần này. Do đó ở tầng `CalendarService`/HTTP response, timeout hiện lộ ra dưới dạng `GoogleCalendarApiError` (không phải HTTP 504) — status 504 trên class `GoogleCalendarTimeoutError` chỉ có ý nghĩa nếu code gọi trực tiếp `executeCalendarRequest`, và hiện không có exception filter nào đọc status này. Giá trị thực của thay đổi là **fail nhanh + không retry khi timeout**, không phải mã lỗi HTTP riêng biệt cho client.
- **Wall-clock budget cho cả lần resync** (`calendar.service.ts`): `RESYNC_WALL_CLOCK_BUDGET_MS` (45s production, 200ms khi test) giới hạn tổng thời gian cả 2 vòng lặp create/update + delete cộng dồn (per-call timeout không đủ vì các call chạy tuần tự có delay giữa các lần ghi). Vượt budget thì dừng ghi thêm (tái dùng cờ `stopRecurringWrites`), push warning `resync_deadline_exceeded`. Deadline chỉ được check ở ranh giới mỗi iteration, nên worst-case thực tế là budget + 1 call đang chạy dở ở `GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS` (20s) = **~65s**, vẫn dưới ngưỡng gateway timeout mặc định 100s của Cloudflare.
- **Sửa bug mất-state ở delete-loop**: nhánh lỗi generic trong vòng lặp xoá không còn `throw` — nhất quán với vòng lặp create/update, log + push warning `recurring_event_delete_failed` + `continue`. Bước `prisma.class.update()` writeback cuối giờ luôn chạy (trừ khi class không tồn tại, throw sớm trước mọi write — không đổi).
- **Giữ nguyên chủ đích rethrow lỗi thật ra HTTP response** (dòng 211 phía trên): `resyncClassScheduleWithGoogleCalendarInternal()` (lớp trong) không còn throw giữa chừng, nhưng `syncScheduleWithCalendar()` (lớp ngoài, dùng bởi `ClassService.updateClassSchedule()` và `updateClassSchedulePattern()`) sau khi nhận `summary` sẽ throw `GoogleCalendarApiError` tổng hợp nếu có warning thuộc nhóm lỗi thật (`recurring_event_delete_failed`, `recurring_event_sync_failed`, `resync_deadline_exceeded`). Kết quả: lỗi Google Calendar thật vẫn làm API trả lỗi (không có "lưu thành công giả"), nhưng nay trả **nhanh và không mất state** thay vì treo tới 502. Hai route resync công khai (`resyncClassScheduleWithGoogleCalendar`, `...ForTeacher`) gọi thẳng lớp trong, không đổi hành vi (vẫn 200 + summary/warnings).
  - **Thay đổi hành vi cần lưu ý**: `recurring_event_sync_failed` (từ vòng lặp create/update) đã tồn tại từ trước, và trước fix này KHÔNG làm `syncScheduleWithCalendar()` throw (nó chỉ log + push warning, request vẫn 200). Từ fix này, warning đó cũng nằm trong nhóm khiến `syncScheduleWithCalendar()` throw — tức 1 khung giờ lỗi tạo/cập nhật (trong khi các khung giờ khác thành công) giờ làm cả request `PATCH /class/:id/schedule` trả lỗi thay vì 200 kèm warning. Đây là quyết định thiết kế chủ đích (nhất quán với việc lỗi xoá cũng throw), không phải tác dụng phụ ngoài ý muốn.

Ngoài phạm vi: `oauth2Client.request()` trong flow Google Meet co-host (`grantMeetCoHostRole`/`setMeetSpaceOpenAccess`) không liên quan khung giờ học cố định, chưa được thêm timeout.

Test coverage: `google-calendar.service.spec.ts` (timeout → `GoogleCalendarTimeoutError`, không retry) và `calendar.service.spec.ts` (delete-loop resilience, writeback giữ đúng `googleCalendarEventId` mới tạo dù có delete fail, quota path trong delete-loop không đổi, `syncScheduleWithCalendar` rethrow sau khi đã writeback, deadline-exceeded dừng sớm nhưng vẫn writeback).
