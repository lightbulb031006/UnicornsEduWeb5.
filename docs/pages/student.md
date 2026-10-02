# Student – `/student`

## Route and role

- **Path:** `/student`, `/student/tuition`, `/student/classes/[id]` (và các route con)
- **Role:** linked `studentInfo.status = active` hoặc role `student` self-service; actor có nhiều workspace vẫn mở `/student` nếu session resolve `access.student.canAccess=true`. Người dùng với role `student` lấy `/student` làm trang chủ mặc định thay vì `/user-profile`.
- **Workspace/tenant:** `/student` là student workspace trong app single-tenant; scope khóa theo tài khoản hiện tại và linked `studentInfo`, không theo `tenant_id`/`workspace_id`.
- **Yêu cầu hồ sơ:** người dùng có role `student` hoặc linked `studentInfo` trạng thái **Đang học** (`active`) được điều hướng về `/student`. Nếu hồ sơ đã **Nghỉ học** (`inactive`) hoặc chưa có workspace hợp lệ thì mới điều hướng về `/user-profile`.
- **Guest redirect:** guest mở `/student` được proxy đưa về `/auth/login?next=<path+query>` để sau login quay lại đúng student route nếu session có linked `studentInfo`.
- **Workplan owner:** Minh (Frontend – UX + Assistant/Student).

## Features

- **Thương hiệu biên lai:** email (HTML/text/subject) và PDF dùng tên **Học Toán Cùng Chuyên Toán**, logo Toán do trung tâm cung cấp; cuối biên lai có dòng **Đã nhận thanh toán** thay con dấu Unicorns cũ. Mẫu backend dùng chung cho nạp ví từ admin/staff/student; số tiền, mã giao dịch và tài khoản nhận tiền vẫn lấy từ dữ liệu/cấu hình hiện có.

- **Loading:** `/student/loading.tsx` uses `StudentDashboardSkeleton`; this stays route-specific because `/student` is a single self-service dashboard rather than a broad segment with many child layouts.

- **Layout & Top Navigation (`StudentHeader`):** Giao diện dạng SPA không sidebar; trên đỉnh trang là `StudentHeader` gồm Brand lockup, các link điều hướng nhanh (`Học tập` `/student`, `Hồ sơ cá nhân` `/user-profile`), bộ chọn Theme (`SidebarThemePicker`), avatar và nút đăng xuất (học sinh không nhận thông báo hệ thống).
- **Trang chủ học sinh (`/student`):** Tinh gọn và tập trung vào trải nghiệm học tập:
  - **Tài khoản & Số dư:** Đã tách sang trang học phí riêng `/student/tuition` (component `StudentWalletSection`). Dashboard `/student` không còn thẻ ví và cũng bỏ thẻ tóm tắt **Lớp đang tham gia**; header dashboard có 2 nút: **Hồ sơ & Lịch thi** (`/user-profile`, nền `bg-secondary`) và **Học phí** (`/student/tuition`, nền `primary` + `text-inverse`).
  - **Danh sách lớp học:** Hiển thị toàn bộ các lớp học sinh đang tham gia kèm trạng thái, học phí/buổi, gói học phí và số buổi đã vào học. Mỗi lớp có thể click trực tiếp để điều hướng sang trang chi tiết lớp `/student/classes/[id]`.
  - **UNIOJ:** Khối tiến độ giải bài trực tuyến UNIOJ.
  - **Thông tin cá nhân & Lịch thi:** Quản lý tập trung tại trang Hồ sơ `/user-profile` (`StudentExamCard`, switch gửi biên lai nạp ví qua email). Trang hồ sơ **không còn** thẻ ví; thay vào đó là CTA nền `primary` dẫn sang `/student/tuition`.
- **Trang học phí học sinh (`/student/tuition`):** Trang riêng cho việc nộp học phí, nằm trong shell `/student` (dùng `StudentAccessGate` + `StudentHeader` của `app/student/layout.tsx`).
  - **Header:** chỉ tiêu đề `h1` **Học phí** + link text **Về trang học tập** (`/student`), không dùng banner nền primary.
  - **Thẻ ví (`StudentWalletSection` + `StudentTuitionBalanceCard`):** card hero nền `panel-inverse` (token mới trong `globals.css`, luôn tối ở cả 3 theme) + chữ `panel-inverse-fg`, số dư cỡ `text-3xl/4xl` (`tabular-nums`, tint `warning` khi âm), CTA **Nạp học phí** theo token primary button của design system (`primary` + `text-inverse`, hover `primary-hover`, active `primary-active`, focus ring `border-focus` + offset trên `panel-inverse`), căn giữa dọc so với khối số dư từ `sm`, mở popup SePay static QR riêng của học sinh. Trang học sinh dùng card riêng thay vì `StudentWalletCard` của màn admin. Nút mở popup lịch sử đã bỏ vì lịch sử render inline cuối trang. Tự query `["student","self","detail"]` nên dùng chung cache với dashboard, không phát sinh request mới.
  - **Học phí theo lớp (`StudentTuitionClassList`):** mỗi lớp một card (mobile-first, `sm` mới dàn 3 cột) gồm badge nguồn học phí/trạng thái lớp, học phí mỗi buổi, gói học phí, số buổi đã vào học.
  - **Lịch sử giao dịch (`StudentTuitionHistoryCard`):** card cuối trang, đọc `GET /users/me/student-wallet-history?limit=50` với key `["student","self","wallet-history",50]`; mỗi dòng có chip loại giao dịch (`topup` / `loan` / `repayment` / `extend`), thời gian, ghi chú và số tiền (`+` cho nạp, `-` cho các loại trừ). Có skeleton, empty state và error state riêng.
  - **Helper dùng chung:** `apps/web/lib/student-tuition.helpers.ts` (`formatTuitionPerSession`, `formatTuitionPackage`, `getTuitionSourceLabel/Class`, `getClassStatusLabel`) được cả `/student` và `/student/tuition` import để format không lệch nhau.
- **Trang chi tiết lớp học sinh (`/student/classes/[id]`):** Một **timeline lớp** (không còn 2 tab Lịch sử / Nội dung): buổi học, báo cáo khảo sát, tiết học theo `GET /class/:id/timeline/student` (tự động kéo hết các trang cursor ngay khi mở, `sortOrder` sau khi admin/staff **Lưu thứ tự** DnD). Buổi học → dialog nhận xét/recording; khảo sát → dialog đọc đánh giá (không form gia sư); tiết lý thuyết → `/student/classes/[id]/lessons/[lessonId]`; tiết thực hành đã `isOpen` → `/student/classes/[id]/assignments/[assignmentId]`; chưa tới `openAt` thì khoá.
  - **Mục lục timeline (`StudentClassTocSidebar.tsx` + `StudentClassTimelineToc.tsx`):** sidebar trái desktop (`lg`) theo pattern sidebar workspace staff: `bg-secondary` + `border-r`, wrapper full-bleed dùng `-mt-6 sm:-mt-8` và sidebar dùng `sticky -top-6 sm:-top-8` để triệt tiêu `py-6 sm:py-8` của `main` (constraint rect của sticky là padding box của scroll container nên `top-0` sẽ pin cách mép trên đúng bằng padding-top → phải bù bằng `top` âm), sidebar sát mép trên, không hở khoảng trắng. Sidebar là **scroll area riêng**: `self-start` + cao `calc(100dvh-4rem)`, danh sách mục lục cuộn nội bộ (`overflow-y-auto`, `overscroll-contain`, scrollbar ẩn: `scrollbar-width: none` + `-ms-overflow-style: none` + `::-webkit-scrollbar { display: none }`), độc lập với scroll của `main`. Header sidebar cao `h-14` gồm icon + nhãn **Mục lục** + badge tổng số mục và nút **thu gọn/mở rộng**; thu gọn đổi width bằng CSS transition (`268px` ↔ `60px`, ease `cubic-bezier(0.22,1,0.36,1)`, tôn trọng `prefers-reduced-motion`) thành rail chỉ còn icon (tiêu đề nằm ở `title`/`aria-label`), trạng thái nhớ trong `localStorage` key `student-class-toc-collapsed` (đọc qua `useSyncExternalStore` để không lệch hydrate). Có ô **tìm trong mục lục** (lọc client, bỏ dấu tiếng Việt, nút xoá từ khoá; rỗng thì hiện “Không có mục nào khớp.”), chỉ hiện khi sidebar mở rộng. Mỗi mục hiện icon theo loại (buổi học / khảo sát / tiết lý thuyết / tiết thực hành) + số thứ tự + tiêu đề + biểu tượng khoá nếu chưa mở; mục đang xem dùng `bg-primary` + `text-inverse` (đồng bộ style active của sidebar staff). Click cuộn mượt tới row (`scroll-mt-24`); **chỉ item được bấm gần nhất** giữ highlight trong mục lục và **row tương ứng trên timeline có vòng sáng** `border-primary ring-2 ring-primary ring-offset-2`. Không còn scroll-spy `IntersectionObserver` theo khung nhìn. Vì mục lục cần biết đủ item nên list tự gọi `fetchNextPage` tới khi hết cursor thay vì chờ sentinel. Mobile (`< lg`) ẩn sidebar, giữ nút nổi **Mục lục** mở `ResponsiveDialog` (tiêu đề kèm tổng số mục, body dùng `ResponsiveDialogBody`: `flex-1 min-h-0 overflow-y-auto`, `overscroll-behavior: contain`).
  - **Nội dung từng row (`StudentTimelineCards.tsx`):** row buổi học hiện cột thời gian (thứ/ngày/giờ) + Nội dung / Bài tập / Hướng dẫn / nhận xét riêng (`MathContent`, **đầy đủ**, không cắt, không nút **Xem thêm**). Buổi có `session.recordingUrl` hiện **ảnh thumbnail tĩnh** (`loading="lazy"`, `alt` gồm ngày buổi học, poster `i.ytimg.com` khi parse được YouTube id; không nhúng `YouTubeEmbed` trên list). Buổi không có recording không hiện ô thumbnail. Bấm dòng hoặc thumbnail mở dialog buổi học kèm trình phát sẵn có. Trạng thái “có video” lấy từ `recordingUrl`, không suy từ chữ trong mô tả. Row khảo sát hiện tên bài + ngày báo cáo + nhận xét riêng của em (`survey.myAssessment`, đầy đủ). Row tiết học giữ badge loại (Tiết lý thuyết / Tiết thực hành, không viết tắt) + title.
  - **Ranh giới dữ liệu:** payload student **không** có `notes` (nhận xét Zalo cả lớp), `teacherPaymentStatus`, `coefficient`, `trainingManagerAllowanceAmount`, `attendance[]` của bạn học, `knowledgeAssessment` chung của lớp — các field đó chỉ có ở payload staff. Học sinh chỉ thấy `myAttendanceStatus` / `myAttendanceNotes` / `myAssessment` của mình.
  - Row buổi học/khảo sát dùng `div role="button"` (không phải `<button>`) vì `MathContent` có thể chứa link; bấm thumbnail tĩnh cũng mở dialog buổi học.
- **Trang chi tiết tiết lý thuyết (`/student/classes/[id]/lessons/[lessonId]`):** Video/nội dung/quiz trên chính tiết. Href trang (`studentLessonHref`, `studentClassLessonsHref`) nằm trong `apps/web/lib/course-content-routes.ts`; endpoint học sinh (`/users/me/student-classes/:classId/lessons/...`) nằm trong `apps/web/lib/content-api-paths.ts`. Sau khi tải được tiết lý thuyết, FE gọi `POST /users/me/student-classes/:classId/lessons/:lessonId/view` để ghi marker đã xem trong phạm vi lớp; lỗi tracking không chặn đọc nội dung. Nếu tiết `kind=practice` thì redirect sang trang lần giao.
- **Làm bài luyện tập (màn 14):** `/student/classes/[id]/assignments/[assignmentId]` (lobby, làm lại nhiều lượt) và `/.../attempts/[attemptId]`. Đồng hồ từ `startedAt` của học sinh; hết giờ chốt + chấm MCQ, không huỷ. Lúc `start` snapshot đề + thang 100/N; đề 0 câu → lỗi *Đề chưa có câu hỏi, không thể bắt đầu làm bài.* Autosave `PATCH .../answers` hiện trạng thái **Đang lưu…** / **Đã lưu lúc hh:mm** / **Lưu lỗi — thử lại** (Sonner khi fail); payload gồm `choiceIndex`/`essayAnswer` và `markedForReview` (đánh dấu quay lại). `essayAnswer` tối đa 20.000 ký tự — vượt thì hiện lỗi trên ô trả lời, không gọi API. **Lưới câu hỏi** (`StudentAttemptQuestionGrid`, sticky dưới đồng hồ): trắng = chưa làm, xanh primary = đã làm, vàng warning = đánh dấu quay lại; bấm ô cuộn tới câu. Mỗi câu có nút bookmark đánh dấu quay lại (autosave BE). **Nộp bài:** flush save trước → chế độ **xem lại readonly** (cùng layout, câu hỏi disabled, tóm tắt đã làm/chưa làm/quay lại) → **Quay lại làm bài** hoặc **Xác nhận nộp bài**; `beforeunload` khi còn thay đổi chưa lưu. Hết giờ vẫn nộp thẳng (không bước xem lại), finalize server-side. `StudentAttemptTimer`: `sticky top-0` trong vùng scroll của `main` (student layout `h-dvh` + `main overflow-y-auto`) để đồng hồ luôn hiển thị khi cuộn câu hỏi; hiển thị mm:ss mượt (tick 250ms); `aria-live="polite"` chỉ đổi theo phút (và "Hết giờ") để screen reader không đọc mỗi giây.
- **Bảo mật Video YouTube (`YouTubeEmbed`):** Tích hợp đa tầng bảo vệ: vô hiệu hóa context menu, chặn phím tắt DevTools/xem mã nguồn (`F12`, `Ctrl+Shift+I/J/C`, `Cmd+Opt+I/J/C/U`), lớp màng chắn trong suốt che title & logo YouTube để chống bấm link ra ngoài, mã hóa/giải mã video ID runtime, và tự động phát hiện DevTools để làm mờ nội dung.

## UI-Schema tokens and components

- **Sidebar:** `bg-secondary`, `border-default`; active route `bg-primary` + `text-inverse`.
- **Cards (schedule, document, payment row):** `bg-surface`, `text-primary`, `border-default`; hover `bg-secondary` or `bg-elevated`.
- **Tables / lists:** Header `bg-secondary`; row `bg-surface`; `border-default`; row hover `bg-secondary`.
- **Buttons:** Primary = `primary` + `text-inverse`; Secondary = `secondary` + `border-default`.
- **Inputs (profile):** `bg-surface`, `text-primary`, `border-default`; focus `border-focus`.
- **Badges (payment status):** Same status tints as other routes; icon + label.
- **Tags (e.g. document type):** `bg-secondary`, `text-secondary`, `border-subtle`; selected `primary` + `text-inverse`.

## Data and API

- **Backend domain:** `student_info`, `student_classes`, `wallet_transactions_history`, `student_wallet_sepay_orders`, `topics`.
- **API (real):**
  - `GET /users/me/student-detail`
  - `PATCH /users/me/student`
  - `GET /users/me/student-classes`
  - `GET /users/me/student-classes/:classId/sessions`
  - `GET /users/me/student-classes/:classId/surveys`
  - `GET /users/me/student-classes/:classId/lessons`
  - `GET /users/me/student-classes/:classId/lessons/:lessonId` — chỉ trả tiết đã giao cho lớp (`class_content_items`) **và chưa ẩn**. Tiết thực hành trước `openAt` → `403` `Chưa tới thời điểm mở bài`. Item đã ẩn → `404`.
  - `POST /users/me/student-classes/:classId/lessons/:lessonId/view` — upsert `class_theory_lesson_views` cho học sinh hiện tại khi mở tiết lý thuyết; không áp dụng tiết thực hành.
  - `GET /class/:id/timeline/student?cursor=&limit=` — timeline lớp (`limit` bị chặn tối đa 50; FE kéo hết trang để dựng mục lục); thứ tự `sortOrder` do admin/staff. **Không gồm** item `hiddenAt` (nội dung lớp đã ẩn). Payload gọn theo audience: `session` chỉ có `myAttendanceStatus`/`myAttendanceNotes` của chính học sinh, `survey` có `myAssessment` (`class_survey_student_assessments.comment` lọc theo `studentId`); toàn bộ field vận hành/nhận xét cả lớp chỉ trả cho staff.
  - `GET /class/:id/content/student` — danh sách nội dung lớp chưa ẩn; luyện tập khoá cho tới `openAt` (`isOpen=false`).
  - `GET /users/me/student-classes/:classId/assignments/:assignmentId` — lobby lần giao luyện tập + danh sách Attempt của HS.
  - `POST /users/me/student-classes/:classId/assignments/:assignmentId/attempts` — bắt đầu (hoặc resume `in_progress`). Snapshot đề + 100/N vào `attempt_answers`. N = 0 → 400. Attempt.assignmentId = `class_content_items.id`.
  - `GET /users/me/student-classes/:classId/attempts/:attemptId` — chi tiết; hết giờ thì chốt + chấm MCQ (`timed_out`).
  - `PATCH /users/me/student-classes/:classId/attempts/:attemptId/answers` — autosave câu trả lời và `markedForReview`. `essayAnswer` tối đa 20.000 ký tự (`@MaxLength`); vượt → 400. FE chặn trước và hiện lỗi.
  - `POST /users/me/student-classes/:classId/attempts/:attemptId/submit` — nộp; hết giờ → `timed_out`, không huỷ.
  - **Cron finalize Attempt hết giờ (ticket #107):** mỗi phút job `AttemptExpiryJob` (`@Cron(EVERY_MINUTE)`) tìm Attempt `in_progress` có `startedAt + durationMinutes < now` và finalize cùng `gradeAndClose` (status `timed_out`, chấm MCQ, tự luận vào hàng đợi, thống kê đếm là đã nộp). Idempotent với nút Nộp (transaction + `status = in_progress`). Không phải HTTP endpoint — chạy trong process API.
  - `GET /users/me/student-classes/:classId/lessons/:lessonId/quizzes` (enrollment-checked via `validateStudentClassAccess`; đây là route quiz duy nhất cho học sinh — `GET /lessons/:lessonId/quizzes` là admin/staff soạn nội dung, không mở `UserRole.student`)
  - `POST /users/me/student-classes/:classId/lessons/:lessonId/quizzes/answers`
  - `GET /users/me/student-classes/:classId/lessons/:lessonId/quizzes/answers`
  - `GET /users/me/student-wallet-history?limit=`
  - `GET /users/me/student-wallet-sepay-static-qr` (SePay QR tĩnh, nội dung `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-[0-9a-f]{10}`, không chứa số tiền/class id/tên lớp; response vẫn trả thêm `classIds` để tương thích)
  - `POST /users/me/student-wallet-sepay-topup-order` body `{ amount }` — legacy/dynamic order endpoint còn tồn tại để tương thích, UI chính không gọi.
  - `PATCH /users/me/student-account-balance` body `{ amount }` — legacy endpoint còn tồn tại để tương thích route cũ nhưng backend luôn trả 400 và yêu cầu dùng SePay QR.
  - `POST /webhook/sepay` — SePay gọi khi có giao dịch ngân hàng; API xác thực HMAC `X-SePay-Signature` + `X-SePay-Timestamp` bằng `SEPAY_WEBHOOK_SECRET` trên chuỗi `{timestamp}.{raw_body}` (raw body đúng byte SePay gửi, không serialize lại từ `req.body`), từ chối timestamp quá `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` giây (mặc định `300`), chỉ nhận fallback `X-Secret-Key` khi `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY=1`, reconcile theo mã đơn/nội dung CK, khóa QR tĩnh theo `SEPAY_TRANSFER_ACCOUNT_NUMBER`, nhận diện student token trực tiếp, format cũ có marker `NAPVI`/`NAP VI`, và token ngân hàng đã strip dấu như `UNIST<10hex>`/`UNICL<10hex>`, trả `{ "success": true }` khi nhận hợp lệ.
  - `GET /users/me/student-exam-schedules`
  - `PUT /users/me/student-exam-schedules` body `{ items: [{ id?, examDate, note? }] }`
  - `GET /unioj/report?name=&days=` — JSON tiến độ học tập UNIOJ.
  - `GET /unioj/report/pdf?name=&days=` — backend proxy PDF; UI học sinh gọi endpoint này bằng Axios `responseType: "blob"`, sau đó preview/download bằng object URL nội bộ.
- **Self-edit scope:** Chỉ cho cập nhật thông tin cơ bản như họ tên, email liên hệ, trường, tỉnh/thành, năm sinh, liên hệ phụ huynh (`parent_name`, `parent_phone`, `parent_email`, `parent_receipt_email_enabled`), giới tính, mục tiêu; không cho tự chỉnh học phí, trạng thái hoặc phân lớp.
- **Balance semantics:** self-service chỉ hiển thị QR tĩnh, sau đó webhook mới cộng ví và ghi `wallet_transactions_history`. Học sinh không được gửi `amount` dương hoặc âm qua `PATCH /users/me/student-account-balance` để thay đổi số dư trực tiếp.
- **Frontend data layer:** TanStack Query + `apps/web/lib/apis/auth.api.ts`; DTO student self-service nằm trong `apps/web/dtos/student.dto.ts`.
- **Exam schedule persistence:** Lịch thi ở `/student` lưu authoritative ở backend qua `student_exam_schedules`; admin/student cùng đọc một nguồn dữ liệu và calendar aggregate có thể render `exam` event trực tiếp từ đó.

## Runtime status

- Route `/student` đã có file runtime thật tại `apps/web/app/student/page.tsx`.
- Shell route dùng `apps/web/app/student/layout.tsx` + `StudentAccessGate`; proxy cũng chặn `/student/**` bằng session nhẹ trước khi vào shell.
- `StudentAccessGate` dùng `GET /auth/session` qua `useAuth()` và chỉ mở khi actor có `access.student.canAccess` từ linked `studentInfo.status = active`; không phụ thuộc duy nhất vào `users.role_type`.
- Layout: `StudentSidebar` + vùng main (`#student-main-content`), skip link “Bỏ qua điều hướng”; không còn `Navbar` trong shell học sinh.
- Nội dung trang bám admin student detail nhưng đổi CTA và copy về hướng self-service.

## Mobile responsive notes

- Student shell uses sidebar + main content like other protected workspaces; mobile controls should maintain at least 44px touch targets.
- Student class cards wrap long class/package names and stack label/value rows below narrow-phone width.
- The current runtime includes self-profile, wallet, linked classes, and exam schedule data. A full student timetable/session schedule remains a planned surface and should reuse existing class/session/calendar data instead of calculating authoritative facts in the frontend.
- `StudentSidebar` still links account management to shared `/user-profile`; if a dedicated `/student/profile` route is introduced, keep nav context inside the student shell.

## DoD and week

- **Tuần 5:** Student sees only own data; basic self-profile editing and SePay QR wallet top-up available for own account only; tuition on linked classes is visible in read-only mode; frontend `/student` connected to real API.

## Accessibility

- Tables/lists with clear structure; status and links not by color only.
- Focus and contrast AA per UI-Schema.

## Archived context (for implementation)

See [ARCHIVED-UI-CONTEXT.md](ARCHIVED-UI-CONTEXT.md) for full mapping.

- **Own profile / read-only scope:** `archived/.../pages/StudentDetail.tsx` — when viewer is student and `user.linkId === id`: profile view/edit, no admin actions (canManageStudentRecord false, canTopUp false); accountIconMode `'self'` for login info.
- **Timetable / schedule:** `pages/Schedule.tsx` — weekly calendar, fetchSessions by date range; in 5.0 scope to current student’s classes/sessions only.
- **Payment history (read-only):** Reuse list/table pattern from `pages/Payments.tsx` but no create/update/delete; fetchPayments or equivalent filtered by current student.
- **Documents:** If present in archived (documentsService), reuse for “tài liệu” under student scope.
- **Layout:** Student uses top nav (no sidebar); same Layout pattern as teacher in archived.
