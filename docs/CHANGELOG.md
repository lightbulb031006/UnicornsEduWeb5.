# Changelog / Lịch sử thay đổi

Mọi thay đổi đáng kể của dự án được ghi lại tại file này.

**Quy ước:** Trước khi commit và push lên git, bắt buộc ghi lại các thay đổi vào file này (theo format bên dưới).

---

## Ghi chú cho Cursor (AI)

**Bạn (Cursor) cần tuân thủ rule sau:** Luôn ghi lại log thay đổi vào file `docs/CHANGELOG.md` trước khi đẩy code lên git (trước khi commit/push). Rule tương ứng nằm tại `.cursor/rules/changelog-before-push.mdc`. Mỗi khi chuẩn bị commit hoặc push, hãy cập nhật phần **[Unreleased]** bên dưới với các mục đã thay đổi, rồi mới thực hiện commit/push.

---

## Format

- Mỗi phiên bản có ngày và các mục: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, v.v.
- Phần **[Unreleased]** dùng cho các thay đổi chưa release; trước khi commit/push thì ghi vào đây, sau đó có thể chuyển thành version có ngày.

---

## [Unreleased]

### Changed — Math upstream sync 2026-10-02

- Triển khai bản đồng bộ theo yêu cầu: pipeline kiểm tra ID sửa dữ liệu Tin, sao lưu schema public tại VPS và chạy thử migration trên PostgreSQL riêng trước khi cập nhật database thật. Dừng triển khai nếu lỗi, số bản ghi chính hoặc tổng ví thay đổi; nginx hiện tại tiếp tục phục vụ trong bước kiểm tra.
- Đồng bộ repo Tin tới 451f60d: khoá học/chuyên đề/tiết học, bài làm trực tuyến, khảo sát, thiết bị đăng nhập, lịch hiệu lực, dashboard, học phí theo block và lương cứng. Giữ quyền admin tạo buổi ngoài lịch, biên lai/logo Toán, popup thống kê và cấu hình deploy Math.
- Watermark public mới dùng logo Toán; nguồn khách đổi nhãn sang Toán, giữ enum gốc. Nhận xét điểm danh vẫn giới hạn 500 ký tự văn bản thuần.
- Sửa import PrismaService trùng trong UNIOJ spec để API typecheck pass. Chưa chạy migration hoặc cập nhật website live; hướng dẫn database và khôi phục tại docs/ops/upstream-sync-math-2026-10-02.md.


### Changed

- Biên lai nạp ví (email HTML, nội dung text và PDF): dùng thương hiệu **Học Toán Cùng Chuyên Toán**, một logo Toán của trung tâm (`logo_math_sm.png`), thay con dấu Unicorns cũ bằng dòng **Đã nhận thanh toán**. Thông tin học sinh, giao dịch và tài khoản nhận tiền tiếp tục lấy từ dữ liệu/cấu hình hiện có.

### Fixed

- CD deploy: job VPS dùng `github.token` tạm thời với quyền `packages: read` thay cho PAT `GHCR_TOKEN` lâu dài, tránh deploy thất bại khi PAT hết hạn và GHCR trả `denied`.

- BE tạo buổi học: tài khoản `admin` được bỏ qua kiểm tra ngày/giờ phải khớp lịch cố định hoặc lịch bù; assistant, gia sư và mọi tài khoản khác vẫn bị kiểm tra như cũ.

### Added

- **Dashboard — bấm KPI Lớp học xem phân loại:** `GET /dashboard/active-class-breakdown` nhóm lớp `running` theo khoá học, mỗi dòng có số lớp và số học sinh active của khoá đó. Popup trên `/admin/dashboard` hiện số loại lớp, tổng lớp (khớp card) và tổng học sinh không trùng. Snapshot, không theo tháng đang chọn.
- **Nguồn khách trên hồ sơ học sinh:**
  - Trường `customer_source` (Tiktok, Fanpage Học Tin Cùng Chuyên Tin, Fanpage Luyện Tin THPT, Giới thiệu từ người quen của khách, Nguồn riêng của bản thân, Khác) và `customer_source_note` khi chọn Khác. Tạo mới bắt buộc chọn nguồn.
  - Dashboard admin có bảng số học sinh, học phí đã học và tỷ trọng theo kỳ; bấm một dòng mở chi tiết cùng cột với Học phí đã học (dòng Khác thêm chú thích). Đổi nguồn thì các kỳ đã qua tính lại theo giá trị hiện tại.
  - **Migration:** `20260929140000_student_customer_source` thêm cột; `20260929220000_backfill_student_customer_source` gán hồ sơ còn trống thành Khác với chú thích `Nguồn cũ`.
  - Docs: `CONTEXT.md`, `docs/Database Schema.md`, `docs/pages/admin.md`, `docs/pages/staff.md`, ADR `docs/adr/2026-09-29-customer-source-follows-current-value.md`.
- **Timeline lớp admin ẩn tiết học mặc định (vé 10):** `/admin/classes/[id]` truyền `lessonVisibility="opt-in"` vào `ClassTimelineManager` — mặc định chỉ buổi học + khảo sát; switch **Hiện tiết học** (dễ bấm trên điện thoại) mới hiện tiết lý thuyết/thực hành. Staff không truyền prop (mặc định `always`), UI giữ nguyên. Component không đoán role. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`.
- **Thumbnail video buổi học trên timeline học sinh (vé 11):** Row buổi học có `recordingUrl` hiện ảnh poster YouTube tĩnh (lazy, `alt` theo ngày buổi), không nhúng trình phát cho tới khi bấm mở dialog. Buổi không có recording không chừa ô trống. Nội dung / bài tập / hướng dẫn / nhận xét riêng hiện đầy đủ, bỏ **Xem thêm**. Helper `apps/web/lib/youtube.ts`. Docs: `docs/pages/student.md`.
- **Lớp không điểm danh (`noAttendance`) — Tự động điểm danh present khi tạo buổi học:**
  - Thêm boolean `noAttendance` trên `Class` (default `false`); admin/assistant có thể bật/tắt qua `PATCH /class/:id/basic-info`.
  - Khi `noAttendance = true`, tạo buổi học tự động tạo `Attendance.present` cho toàn bộ học sinh active, bỏ qua form điểm danh.
  - Session snapshot giá trị `noAttendance` thành `snapshotNoAttendance` (không đọc lại từ Class sau khi tạo). Payload tạo/sửa buổi **không** nhận `noAttendance`.
  - Tuition/allowance vẫn tính đúng — `tuitionFee` = tổng `present`/`excused` × học phí mỗi học sinh.
  - **Migration:** `20260905100000_add_class_no_attendance` — thêm `no_attendance` vào `classes`, `snapshot_no_attendance` vào `sessions`.
- **Lưu vai trò và lương cứng một lần bấm (hotfix):**
  - Dialog **Chỉnh sửa thông tin nhân sự** đổi chip vai trò thành danh sách; bật một vai trò thì bung ô lương cứng và % vận hành của đúng vai trò đó. Để trống = mặc định vai trò; `0` / `0%` = cố ý loại.
  - `PATCH /staff/:id/with-fixed-salary-overrides` ghi hồ sơ + `roles` + `roleFixedSalaryOverrides` trong một transaction (role trước, override sau) nên thêm vai trò mới kèm mức đè lần đầu không còn 400. Lỗi ở bất kỳ bước nào rollback hết. PUT từng trục `/fixed-salary-settings/staff-overrides/*` giữ nguyên.
  - Card **Mức đè lương cứng theo nhân sự** gỡ khỏi `/admin/staffs/[id]` (mirror staff). Toast Sonner; invalidate cache staff + overrides.
- **Tắt vai trò thì xóa mức đè, có cảnh báo (hotfix):**
  - Trước khi lưu, tắt vai trò đang có mức đè mở `ConfirmDialog` (component xác nhận dùng chung, không overlay mới) nêu đúng số hai trục (ví dụ `12.000.000đ` và `15%`) và *Lương các tháng đã chốt không thay đổi*.
  - Xác nhận → xóa vai trò + cả hai row override trong cùng transaction với lần lưu; hủy → không ghi gì, vai trò trở lại bật. Tắt vai trò không có mức đè thì không hỏi.
  - `action_history` ghi `Xóa mức đè … vì tắt vai trò {role}`. Không đụng `staff_fixed_salary_payables`.

### Changed

- **Nghiệm thu đổi tên ba cấp (vé 08):** Toàn bộ đợt 05–07 nói Chuyên đề (`modules`) / Tiết học (`lessons`). Glossary ghi cặp dễ nhầm Tiết học vs Buổi học (cấm viết tắt) và danh sách tên đã khai tử. Hai ADR: mỗi Bài học cũ = một tiết (số mục lớp nhân lên) `docs/adr/2026-09-16-one-lecture-becomes-one-lesson.md`; tiết riêng lớp XOR chuyên đề `docs/adr/2026-09-16-class-owned-lesson-xor.md`. Docs schema/API/trang khớp code. Không sửa migration đã có.
- **UI/URL nội dung ba cấp (vé 07):** Admin/staff/học sinh nhìn **Chuyên đề** và **Tiết học**; không còn chương/chủ đề/bài học/chuyên đề lý thuyết/chuyên đề luyện tập trên màn hình. Href `/courses/:id/modules/:moduleId/lessons/*`, học sinh `/student/classes/:id/lessons/:lessonId`. Timeline: Buổi học (CalendarDays + success) vs Tiết học (BookOpen + primary), nhãn đủ chữ; tiết lý thuyết/thực hành khác màu trong danh sách. Flatten lecture editor vào chính tiết (`PATCH /class/:id/lessons/:lessonId`). Docs: `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/pages/student.md`, `docs/pages/README.md`. Nghiệm thu typecheck/test: vé 08.
- **Buổi học không điểm danh (`noAttendance`) — backend guard khi cập nhật session:**
  - `PUT /sessions/:id` và `PUT /staff-ops/sessions/:id`: Khi session có `snapshotNoAttendance = true`, field `attendance` trong payload bị bỏ qua (silent ignore) — buổi học tự quản danh sách điểm danh, không cho phép cập nhật từ bên ngoài.
  - Tính năng này đã có ở `POST /sessions` (tự tạo `Attendance.present` cho toàn bộ học sinh active), nay được mở rộng sang cả luồng cập nhật.
  - ADR `docs/adr/2026-09-05-class-without-attendance-still-charges.md`.
- **Cài đặt lương cứng gọn hơn + cron không chốt lại tháng đã chốt sớm:**
  - Tab **Lương cứng**: mô tả khối chính sách / chốt tháng rút còn một câu; gợi ý “trống khác 0” nằm dưới ô nhập. Một nút **Lưu chính sách** gọi lần lượt hai PUT; toast không báo đủ khi mới lưu một nửa, draft trục lỗi được giữ.
  - Cron 01:00 ngày 28 bỏ qua cả tháng nếu `staff_fixed_salary_payables` tháng hiện tại đã có dòng. Nút **Chốt lương tháng này** vẫn chạy `closeMonth` (có thể sinh thêm nhân sự/role mới). Không migration; không đụng dữ liệu khoản đã chốt.
- **Lương cứng một dòng + bỏ lương cứng giáo viên:**
  - Dialog **Chỉnh sửa thông tin nhân sự**: mỗi vai trò ăn lương cứng hiện **lương cứng và % vận hành trên một dòng ngang**; dòng chữ dưới ô ghi mức đang áp dụng và nguồn (mặc định vai trò / mức đè / cố ý loại / cố ý 0%). Hẹp thì xuống dòng có kiểm soát, ô % giữ bề rộng cố định.
  - Vai trò **giáo viên** không còn ô lương cứng / % vận hành (popup sửa nhân sự và tab Cài đặt hệ thống). Chốt tháng **không sinh** khoản lương cứng cho `teacher`. Trợ cấp buổi học không đổi.
  - Nguồn sự thật dùng chung: `FIXED_SALARY_STAFF_ROLES` (FE DTO + API `fixed-salary-staff-roles.ts`) cho lúc đọc cấu hình và lúc chốt lương.
  - Migration mới `20260916100000_remove_teacher_fixed_salary_config` xoá dòng `teacher` ở `role_fixed_salary_defaults` và `staff_fixed_salary_overrides` (no-op nếu trống). **Không** đụng `staff_fixed_salary_payables`.


### Fixed

- **Email học sinh trên production trỏ localhost:** Magic link đăng nhập, email xác thực và đặt lại mật khẩu không còn fallback `http://localhost:3000` khi `NODE_ENV=production`. Origin lấy từ `FRONTEND_URL` HTTPS public, rồi `VPS_PUBLIC_HOST`, rồi `BACKEND_URL` (bỏ `/api`), rồi host `*.uniedu.vn` hoặc `*.unicornsedu.com` của request qua Nginx. Host lạ bị từ chối.

- **Tạo chuyên đề 400 `courseId must be a string`:** `POST /course/:courseId/modules` nhận body `{ title }` — `courseId` lấy từ path. `ModuleCreateDto.courseId` thành optional để ValidationPipe không từ chối trước khi controller gán param.

- **CI web build fail trên `main`:** `toStaffCreateSessionPayload` còn map `noAttendance` dù `SessionCreatePayload` không còn field đó (Lớp không điểm danh luôn lấy từ Class). Gỡ dòng — Next typecheck `/staff/classes/[id]` pass.

- **`migrate deploy` vỡ trên snapshot production vì thiếu bảng schema-only:** `user_devices` / `login_requests` và `questions` có model Prisma nhưng không có `CREATE TABLE`. Thêm `20260905120000_create_user_devices_and_login_requests` (trước ALTER `activate_secret_hash`) và `20260912500000_create_questions` (trước FK `attempt_answers` → `questions`; cột `chapter_id` để `20260921` rename thành `module_id`).

- **`YouTubeEmbed` crash `playVideo is not a function`:** `new YT.Player()` trả stub trước `onReady`; lớp click shield gọi play/pause lúc đó. Chỉ gọi API player khi `playVideo` đã là function. Dialog recording học sinh không còn TypeError khi bấm phát sớm.

- **QR thanh toán nhân sự luôn sinh từ link, bỏ nhúng ảnh (ticket 15):**
  - Ô QR (`StaffQrCard` trên `/admin/staffs/:id` và mirror `/staff/staffs/:id` / `/staff/profile`) luôn xin mã `api.qrserver.com` mã hoá nguyên văn `bank_qr_link` — Drive / imgur / `.png` / link thanh toán đều là payload, không còn `<img>` trỏ máy chủ ảnh ngoài.
  - Xoá helper Drive (`extractGoogleDriveFileId`, `toGoogleDriveDirectImageUrl`, `resolveStaffQrImageSrc`) khỏi `apps/web/lib/staff-qr-image.ts`. Overlay `ResponsiveDialog` vẫn xin 512px (không kéo giãn thumbnail); nút **Mở link gốc** giữ tab mới. Thông báo lỗi không còn nhắc chia sẻ công khai file Drive.
  - Không đụng backend / schema / lương cứng. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`.

- **QR thanh toán nhân sự vỡ ảnh Drive + không quét được (ticket 14):**
  - Ô QR (`StaffQrCard`, `size="minimal"` trên `/admin/staffs/:id` và mirror `/staff/staffs/:id` / `/staff/profile`) không còn nhét URL HTML Drive `/file/d/<ID>/view` vào `<img>`. Helper thuần `apps/web/lib/staff-qr-image.ts` bóc ID (`/view`, `/edit`, `open?id=`, `uc?id=`) rồi dựng `https://drive.google.com/uc?export=view&id=<ID>`.
  - Bấm ô QR mở `ResponsiveDialog` với mã đủ lớn để quét điện thoại: ảnh upload phóng to; link không phải ảnh thì xin mã `api.qrserver.com` 512px (không kéo giãn thumbnail 64px). Nút **Mở link gốc** giữ tab mới. Ảnh 403/hỏng hiện thông báo, không để ô trống.
  - Không đụng backend / schema / lương cứng. Giữ `unoptimized` trên Next `<Image>`. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`.
  - **Bị thay bởi ticket 15:** không nhúng ảnh Drive được vì CORP; hành vi hiện tại luôn sinh mã từ link.

- **Typecheck `apps/api` vỡ sau khi bump axios 1.20:** `unioj.service.ts` đọc `pdfResponse.headers['content-type']` rồi gọi `.includes()` — axios 1.20 nới kiểu giá trị header thành `string | number | boolean | string[] | AxiosHeaders` nên `TS2339: Property 'includes' does not exist on type 'number'`. Bọc `String(... ?? '')` trước khi so khớp. `tsc --noEmit` sạch 0 lỗi.
- **Lớp tính theo block 30 phút bị khoá không sửa được gì (hotfix):**
  - **Triệu chứng:** lớp đang ở `pricing_mode = per_block` mà lịch cố định có các khung giờ lệch thời lượng thì **mọi** thao tác lưu trên popup **Thông tin lớp** đều bị chặn — đổi học phí, sĩ số tối đa, tên lớp, trạng thái — đều hiện cùng toast *"…các khung giờ không cùng một thời lượng chuẩn."* Phát hiện trên `UNICL-37f607c5df` (CN 2h, T7 4h, T4 1h).
  - **Nguyên nhân 1 — ràng buộc quá chặt:** `standardBlockCountFromSlots` yêu cầu **mọi** khung giờ active cùng thời lượng, lệch một chút là trả `null`. Ràng buộc này không cần thiết: tiền thật lấy từ cột per-block × `sessions.snapshot_block_count` của **từng buổi**, nên lịch lệch vẫn tính đúng. Số block chuẩn chỉ là đơn vị quy đổi hiển thị, và vòng FE nhân K / BE chia K là bất biến với mọi `K > 0`.
  - **Nguyên nhân 2 — guard đặt sai chỗ:** `EditClassBasicInfoPopup.handleSubmit` kiểm tra `pricingMode === "per_block"` (trạng thái form) thay vì "đang đổi sang per_block" (hành động), nên lớp đã ở chế độ block thì lần nào submit cũng bị chặn, không có đường thoát. Backend không hề chặn — `updateClassBasicInfo` không gọi `assertCanEnableBlockPricing`.
  - **Sửa:** `standardBlockCountFromSlots` (cả `apps/api/src/common/block-pricing.util.ts` và `apps/web/lib/class-pricing-mode.ts`) lấy **GCD** số block của các khung giờ active thay vì đòi bằng nhau; chỉ còn trả `null` khi không có lịch active hoặc có khung giờ không chia hết 30 phút. Lịch đồng nhất ra kết quả **y hệt trước** (GCD của các số bằng nhau là chính nó) → không lớp nào đổi số tiền. Guard trong `EditClassBasicInfoPopup` chỉ chạy khi `pricingMode` thực sự đổi.
  - **Copy:** bỏ thông báo *"không cùng một thời lượng chuẩn"*; `MISSING_STANDARD_BLOCKS_FALLBACK` và `assertCanEnableBlockPricing` đổi sang *"chưa có lịch cố định, hoặc có khung giờ với thời lượng không phải bội số 30 phút"*; `ClassPricingModeField` nói rõ các khung giờ không cần dài bằng nhau; "buổi chuẩn" → "mốc quy đổi" kèm ghi chú mỗi buổi tính theo block thực tế.
  - **Verify:** `UNICL-37f607c5df` block counts `4, 8, 2, 4, 8` → số block chuẩn `2` (trước: `null`), đúng bằng K cũ (`225000 / 112500`) nên dữ liệu hiện có khớp liền, không cần backfill; round-trip `112500 → 225000 → 112500` bất biến; mỗi khung giờ vẫn ra `snapshot_block_count` riêng `4 / 8 / 2`. Toàn DB chỉ 1 lớp dính. Test: 233 backend + 97 frontend pass.
  - Docs: `docs/adr/2026-09-09-expand-block-pricing.md`, `docs/pages/admin.md`, `docs/Database Schema.md`.

### Changed

- **Chi tiết học sinh (admin/staff): ưu tiên ví và lịch thi.** Trang `/admin/students/[id]` (mirror `/staff/students/[id]`) xếp **Tài khoản hiện tại** rồi **Lịch thi** lên đầu, sau đó **Thông tin cơ bản** → **Liên hệ phụ huynh** (thu gọn sẵn, mở bằng `Collapsible` shadcn, nhớ `localStorage`) → Thành tích → Feedback → danh sách lớp. Mobile 1 cột, từ `sm` 2 cột. Không đổi nhãn hai khối hồ sơ.
- **API nội dung ba cấp (vé 06):** Nest `CourseContentModule` (`apps/api/src/course-content/`) thay `topic/`. HTTP: `/course/:id/modules`, `/course/:id/modules/:moduleId/lessons`, `/lessons/:id/quizzes|questions`, `/class/:id/lessons`, học sinh `/users/me/student-classes/:classId/lessons/:lessonId`. DTO/Swagger `LessonKind` lý thuyết|thực hành; tiết thực hành kèm video/nội dung → 400; xoá chuyên đề/tiết còn lớp tham chiếu (kể cả ẩn) → 409 kèm tên lớp. Không alias path cũ. Seed question-bank dùng `prisma.module`/`prisma.lesson`. `tsc` web còn đỏ (vé 07). Docs: `docs/api/courses.md`, `docs/Database Schema.md`.
- **Schema nội dung ba cấp (vé 05):** `chapters` → `modules` (Chuyên đề), mỗi `lectures` cũ → một `lessons` lý thuyết riêng, `topics` practice → tiết thực hành, DROP `topics`/`lectures`. XOR tiết thuộc chuyên đề hoặc lớp (`lessons_owner_check`); tiết thực hành không có video/content. Lớp gán chuyên đề N bài có N mục nội dung + N mục timeline (ẩn copy nguyên); lượt xem lý thuyết cũ gắn tiết đầu. Migration mới `20260921000000_rename_three_level_content` — không sửa migration đã deploy. Call site web/API cố ý còn đỏ (vé 06–07). Docs: ADR `docs/adr/2026-09-15-three-level-content-model.md`, `docs/Database Schema.md`, `CONTEXT.md`.
- **Prefactor đường dẫn cây nội dung:** mọi href trang (admin/staff/học sinh) đi qua `apps/web/lib/course-content-routes.ts`; mọi URL Axios chứa `/chapters` `/topics` `/lectures` đi qua `apps/web/lib/content-api-paths.ts`. Điều hướng và endpoint giữ nguyên; dọn đường cho đợt đổi tên module/lesson. Docs: ADR `docs/adr/2026-09-10-course-content-drill-down.md`, `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/pages/student.md`, `docs/Cách làm việc.md`.
- **Đợt tối ưu theo `react-doctor` (2026-09-11):** ADR `docs/adr/2026-09-11-frontend-perf-a11y-conventions.md`.
  - `apps/web/lib/formatters.ts` mới: gom toàn bộ `Intl.NumberFormat` / `Intl.DateTimeFormat` về module scope (126 warning `intl-*`), component không tự dựng `Intl` trong render nữa.
  - **22 trang** dùng `useSearchParams()` được bọc `<Suspense>` (24 → 0 cảnh báo `nextjs-no-use-search-params-without-suspense`); thiếu boundary thì Next.js bỏ static render cả route.
  - Reset state theo prop chuyển từ `useEffect` sang so sánh prev-prop **trong render** (`SortableOrderList`, `tabs/SettingsTab`, `FinancialDetailModal`, `UserManageModal`) — hết frame nhấp nháy dữ liệu item trước.
  - `Array.includes` trong vòng lặp → `Set` ở 15 chỗ (web + api); `Object.values(StaffRole)` trong `filter` hoist thành `STAFF_ROLE_VALUES` ở module scope của `user.service.ts`.
  - `apps/api`: 8 chỗ `[...arr].sort(...)` → `arr.toSorted(...)` (target đã là ES2023).
  - Accessibility: `<label htmlFor>` + `useId()` cho control native, `<label>` không bọc control đổi thành `<span>`/`<div>` + `ariaLabel` cho editor, `role="group"`/`role="button"`/`role="slider"` + `onKeyDown` cho phần tử tự chế, 22 field chỉ có placeholder được thêm `aria-label`.
  - Key list dùng index → key theo dữ liệu ở `StaffCombinedList`, `OjProgressSection` (list có sort/filter nên index xê dịch).

### Security

- **`next` 16.1.6 → 16.2.6** — vá CVE-2026-23870 (RSC DoS, high).
- **`axios` `^1.13.6` → `^1.20.0`** ở cả `apps/web` và `apps/api` — bản cũ bị Socket chấm 25/100 trục vulnerability (có advisory). axios 1.20 siết kiểu header value thành `string | number | boolean | string[] | AxiosHeaders`, nên `apps/api/src/unioj/unioj.service.ts` phải bọc `String(headers['content-type'] ?? '')`.
- Hai bump trên cần dựng lại `node_modules` root (`ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`). Sau khi `pnpm install` lại, pnpm 10 bỏ qua toàn bộ postinstall → thêm `pnpm.onlyBuiltDependencies` vào root `package.json` (`bcrypt`, `sharp`, `prisma`, `@prisma/engines`, `esbuild`, `@nestjs/core`, `unrs-resolver`); thiếu khai báo này thì native binding của bcrypt/sharp không build và API chạy sẽ lỗi.
- Kết quả `react-doctor`: score 42 → **55**, Security **2 error → 0**, issues 765 → 686.

### Fixed

- **`POST/PATCH /questions` và `POST /questions/bulk`:** `options` của câu trắc nghiệm là `string[]` nhưng DTO gắn `@ValidateNested` (chỉ nhận object/array), nên lưu MCQ từ chuyên đề luyện tập / ngân hàng / nhập AI trả 400 `each value in nested property options must be either object or array`. Đổi sang `@IsString({ each: true })`.

### Changed

- **Workspace khoá học — tab Nội dung:** list chỉ chủ đề (kéo-thả + Lưu thứ tự); bấm row → `?chapter=` danh sách chuyên đề (cùng DnD). Trang riêng tạo/sửa chuyên đề `/courses/:id/chapters/:chapterId/topics/new|[topicId]` (admin + staff). Bài học trên trang chuyên đề lý thuyết (`?lecture=`). Bỏ tab **Đề thi**; `?tab=de-thi` về `noi-dung`. `lesson_plan` soạn được cây nội dung. PATCH/DELETE chuyên đề cấp khoá trên `CourseTopicController`. ADR: `docs/adr/2026-09-10-course-content-drill-down.md`.
- **Cây tri thức:** bỏ kéo-thả Chủ đề / Chuyên đề / Bài học trên tab Nội dung khoá.
- **Tab Đề thi:** thay nút lên/xuống bằng kéo-thả; thứ tự chỉ lưu khi bấm **Lưu thứ tự** (Hủy bỏ draft). Cùng UI trên `/admin/courses/:id` và `/staff/courses/:id`.
- **Thang mức độ khó:** thay nút ↑↓ bằng kéo-thả; thứ tự chỉ lưu khi bấm **Lưu thứ tự** (Hủy bỏ draft). Tạo/sửa tên/bật-tắt/xoá vẫn ghi API ngay.

### Added

- **Workspace khoá học (`/admin/courses`, `/staff/courses`):** gộp danh sách + chi tiết một khoá vào một trang bốn tab (`noi-dung` · `cau-hoi` · `de-thi` · `cai-dat`), UI dùng chung `apps/web/components/course-workspace/`. Admin/assistant vào `/admin/courses*`; `lesson_plan` / `lesson_plan_head` vào `/staff/courses*` (cùng component, `routeBase` chỉ dựng href). `GET /courses` lọc server-side bằng `resolveListableCourseIds` (tách khỏi `resolveViewableCourseIds`). `lesson_plan_head` được `POST`/`PATCH`/`DELETE /courses` và CRUD cây Chương/Chuyên đề/Bài học. ADR: `docs/adr/2026-09-10-course-workspace.md`.

### Removed

- Route admin rời `/admin/question-bank`, `/admin/exam-library`, `/admin/classes/courses`, `/admin/classes/courses/[id]` — **xoá thẳng, không redirect.** Bookmark cũ 404; ngân hàng câu hỏi = tab **Câu hỏi**, thư viện đề = tab **Đề thi**, cài đặt khoá = tab **Cài đặt**.

### Changed

- **Hợp nhất `main` vào `dev` (merge, không rebase):** `dev` đã publish 53 commit lên `origin/dev` và 4 nhánh feature (`feat/07-redo`, `feat/09-question-bank`, `feat/54-lesson-content`, `feat/55-practice-topic-set`) đang fork từ `origin/dev`, nên rebase sẽ buộc force-push nhánh chung và vỡ base của cả 4 nhánh. Chọn merge: giải conflict một lần trên 14 file thay vì replay 68 commit. Hoà tính năng đụng nhau giữa **block pricing** (main) và **noAttendance** (dev): `session-create.service.ts` giữ wrapper `resolvedAttendanceInput` của dev (auto điểm danh khi bỏ điểm danh) và bổ sung `pricingMode` / `customTuitionPerBlock` / `classTuitionPerBlock` / `blockCount` của main vào `resolveDefaultStudentTuitionPerSession`; `AddSessionPopup` cho nhánh `skipAttendance` dùng `previewAttendanceItems` (đã quy giá theo block) thay vì `attendanceItems` thô, để lớp `per_block` bật "bỏ điểm danh" vẫn tính đúng học phí; `EditClassBasicInfoPopup` gửi `no_attendance` cùng `toPerSessionAmountForApi` / `toPerSessionMaxAllowanceForApi`. `apps/web/dtos/class.dto.ts` giữ rename `ClassCategory` → `Course` của dev và thêm `ClassPricingMode` của main.
- **`@nestjs/schedule` 6.1.3 → 12.0.1 kéo theo cấu hình Jest:** bản 12 là ESM-only (`"type": "module"`), trong khi API build CJS. Runtime vẫn chạy nhờ Node 24 hỗ trợ `require(ESM)`, nhưng Jest bỏ qua `node_modules` khi transform nên `attempt-expiry.job.spec.ts` vỡ với `SyntaxError: Unexpected token 'export'`. Thêm vào `apps/api/package.json`: `transformIgnorePatterns: ["node_modules/(?!.*@nestjs[+/]schedule)"]` và `ts-jest` với `tsconfig.allowJs = true` để transform riêng package này. Lỗi chỉ xuất hiện sau merge vì `main` bump dep còn `dev` mới là nhánh thêm spec dùng nó.

- **Lương cứng trên hồ sơ thu nhập:** card **Lương cứng** trên `/admin/staffs/:id` và `/staff/profile` không còn dòng tổng theo role (`Lương cứng · Giáo án` / `fixedSalaryRoleSummaries`). Chỉ còn từng khoản đã chốt (`fixedSalaryPayables`). API vẫn trả `fixedSalaryRoleSummaries` cho tổng thu nhập.

- **Lương cứng — gộp bảng role + chuyển mức đè sang trang nhân sự (2026-09-10):**
  - Tab **Lương cứng** (`/admin/system-settings?tab=fixed-salary`, mirror `/staff/...`): hai bảng role gộp thành **một bảng 3 cột** (Role / Số tiền lương cứng / % khấu trừ vận hành lương cứng). Vẫn **hai nút lưu độc lập** (`Lưu mức lương`, `Lưu % vận hành`) gọi hai API riêng — lưu trục này không đụng trục kia. Mobile giữ layout card theo role, mỗi card 2 ô.
  - Khối **Mức đè theo nhân sự** đã **gỡ khỏi tab Lương cứng** và chuyển sang trang chi tiết nhân sự `/admin/staffs/[id]` (mirror `/staff/staffs/[id]`) dưới dạng card **Mức đè lương cứng theo nhân sự** (`StaffFixedSalaryOverrideCard`), lấy dữ liệu bằng `GET /fixed-salary-settings/staff-overrides?staffId=` thay cho tìm kiếm toàn danh sách. Nghiệp vụ 2 trục / Lưu–Gỡ mức đè / nhãn nguồn giữ nguyên; card chỉ hiện với admin + assistant và ẩn khi nhân sự tự xem hồ sơ mình trên staff shell.
  - Không đổi backend. FE: xoá `StaffFixedSalaryOverridesPanel.tsx`, thêm `apps/web/lib/fixed-salary-settings.helpers.ts` (class input + parse lỗi API dùng chung), `RolePolicySettingsCard` nhận nhiều nút lưu qua prop `actions`.
  - Docs: `docs/pages/admin.md`, ADR `docs/adr/2026-09-09-role-default-fixed-salary.md`.

### Added

- **Seed ngân hàng câu hỏi & đề luyện tập:** `apps/api/scripts/seed-question-bank.ts` + dữ liệu `apps/api/scripts/seed-data/` (pack `algorithms` cho VIP/Basic/Advance/Hardcore, pack `math-thpt` cho THPT Basic/Advanced/Luyện Đề). Mỗi khoá được seed 4 mức độ khó, 6 chương, 30 câu (25 trắc nghiệm + 5 tự luận, HTML TipTap + LaTeX `$…$`) và 12 đề `topics(kind=practice)` kèm 83 `question_links` (5 đề theo chương, giữa khoá, cuối khoá, khởi động, cụm 2, nâng cao, tự luận, cuối khoá đề 2). Đề khai báo theo blueprint độ khó; `SeedExam.rotate` xoay nguồn câu (offset = `rotate × số câu mức đó`) để hai đề cùng blueprint không lấy trùng câu. Lệnh `pnpm seed:question-bank` (dry-run mặc định, `--apply` mới ghi; hỗ trợ `--course`, `--pack`, `--reset`). Id sinh tất định bằng `sha1` → UUID v5 nên chạy lại là upsert, không nhân bản. Script không đụng lớp / học sinh / `attempts`. Thêm devDependency `tsx` cho `apps/api`. Docs: `docs/Seed Question Bank.md`.

### Fixed

- **`UpgradedSelect` menu mất nền khi truyền `menuClassName`:** `menuClassName` trước đây *thay thế* class mặc định (`??`), nên tab Cài đặt khoá (`Đội giáo án`, `menuClassName="max-h-72"`) bung listbox không có `bg-bg-surface`/viền/shadow. Giờ merge bằng `twMerge` giống `buttonClassName`; nền menu đặc `bg-bg-surface` (bỏ `/95` + `backdrop-blur`).
- **Header lớp phía staff tham chiếu biến đã bị gỡ:** `/staff/classes/[id]` còn sót `{sessions.length}` trong dải thống kê header sau khi refactor timeline gỡ query `sessions` (trang admin tương đương đã bỏ chỉ số này). Gỡ nốt chỉ số cho khớp trang admin. Lỗi có sẵn trên `dev`, chỉ lộ khi chạy `tsc` sau merge.
- **`AddSessionPopup` còn nhánh bắt buộc `recordingUrl`:** biến `isRecordingRequired` đã bị `main` gỡ ở hotfix "bỏ bắt buộc recordingUrl khi tạo/sửa buổi học (#95)" nhưng dev vẫn còn nhánh dùng nó. Theo main: `recordingUrl` không bắt buộc, chỉ validate định dạng YouTube khi có nhập.
- **Mock Prisma thiếu `classScheduleEntry` trong `session-create.service.spec.ts`:** 5 test `noAttendance` của dev vỡ vì code block pricing của main đọc `tx.classScheduleEntry.findMany`. Thêm mock mặc định vào helper `baseTx` thay vì vá từng test.
- **Đồng hồ làm bài luyện tập không dính khi cuộn:** Student layout dùng `h-dvh` + `main min-h-0 overflow-y-auto` để scroll nằm trong `main` (không scroll document); `StudentAttemptTimer` giữ `sticky top-0` với nền mờ (`backdrop-blur`) để luôn hiển thị thời gian còn lại khi cuộn câu hỏi.
- **Đáp án đúng sau nộp bài không render KaTeX:** `StudentAttemptQuestion` (và màn ôn nhẹ topic) dùng `MathContent` cho text đáp án đúng thay vì plain text.
- **Thư viện đề thi không dùng được (`/admin/exam-library`):** `ExamLibraryService` xây trên giả định "đề thi là topic cấp khoá nằm *ngoài* Chủ đề" (`chapterId: null` ở cả query, create, assert, reorder), trong khi CHECK constraint `topics_owner_check` (migration `20260907100000`) bắt buộc topic cấp khoá phải có `chapter_id`. Hệ quả: danh sách đề luôn rỗng và tạo đề luôn fail `23514 topics_owner_check`. Chốt lại theo constraint — **đề thi thuộc một Chủ đề của khoá**, thư viện gom đề của mọi Chủ đề lại một chỗ:
  - `GET /course/:courseId/exam-library` bỏ điều kiện `chapter_id IS NULL`, trả kèm `chapter` (id/title/sortOrder) và `questionCount`, sắp theo `chapter.sortOrder → order → title`, nhận thêm query `chapterId` để lọc.
  - `POST` bắt buộc `chapterId` và kiểm Chủ đề thuộc đúng khoá (400 nếu sai).
  - `PATCH` / `DELETE` kiểm `topic.courseId` khớp `:courseId` — trước đây controller nhận `_courseId` rồi bỏ đi, nên route của khoá A sửa/xoá được đề của khoá B.
  - Kiểm quyền `assertCanManageCourseContent` chạy trước khi soi payload, để người ngoài đội giáo án nhận 403 thay vì 400.
  - Web: form tạo có chọn Chủ đề (bắt buộc), thanh lọc theo Chủ đề, mỗi dòng đề hiện badge Chủ đề + số câu.
- **`/admin/question-bank` — responsive & khoảng cách:** card thêm `gap-4` (header / bộ lọc / danh sách trước đó dính sát nhau); nút hành động chia đôi hàng + cao 44px trên mobile; ô tìm kiếm full-width rồi `md:w-64`, cụm dropdown 1→2→4 cột; danh sách chuyển sang card trên mobile (bảng cũ ẩn cả cột *Nội dung* dưới `md`, chỉ còn Loại + Thao tác) và giữ bảng từ `md` trở lên; empty-state khung viền đứt nét; nút Xoá dùng token `text-error` thay `text-red-600`.
- **`UpgradedSelect` — polish trigger + mở rộng search:** `buttonClassName` giờ *đè* lên surface mặc định bằng `twMerge` thay vì thay thế nó, nên các call site chỉ truyền chiều rộng (`/admin/exam-library`, `/admin/dashboard/statistics`, `PracticeTopicQuestionsCard`, `ClassPracticeQuestionComposer`, …) không còn mất viền/padding/shadow. Trigger `searchable` được bọc trong khung có viền + chevron giống trigger dạng button, bấm vào khung là focus ô nhập, mở menu khi bấm lại lúc đang đóng, giữ nhãn đang chọn làm placeholder khi gõ tìm, và không tự bật lại menu ngay sau khi chọn. Thêm dependency `tailwind-merge` (apps/web). Bật `searchable` cho lọc chương ở `/admin/exam-library` và lọc khoá học / chủ đề ở `/admin/question-bank`.
- **Xem & sửa câu hỏi ngay trong dialog đề thi:** `PracticeTopicQuestionsCard` hiện đầy đủ nội dung câu hỏi (bỏ `line-clamp-2`), danh sách phương án với đáp án đúng được đánh dấu, và `<details>` lời giải / barem. Thêm nút *Sửa câu hỏi trong ngân hàng* mở `QuestionFormDialog` với `lockedCourseId`; đề đã giao cho lớp phải xác nhận trước vì sửa là sửa bản gốc dùng chung (bài đã nộp giữ nguyên nhờ snapshot `attempt_answers`). Form soạn câu hỏi được tách khỏi `app/admin/question-bank/page.tsx` thành component dùng chung `components/admin/question/QuestionFormDialog.tsx`; thêm type `QuestionFormInitial` trong `dtos/question.dto.ts` và siết `QuestionLinkQuestion.type` / `.options` trong `dtos/topic.dto.ts`.
- **Thư viện đề thi — mở đề bằng dialog:** bấm dòng đề mở `ResponsiveDialog` (size `5xl`) chứa `PracticeTopicQuestionsCard`, thay accordion mở rộng tại chỗ. Dialog giữ `openedExamId` thay vì cả object nên số câu ở tiêu đề bám theo cache list.
- **Schema drift — 3 bảng thiếu migration:** `question_links`, `lecture_quizzes`, `lecture_quiz_answers` đã có model trong `prisma/schema/learning.prisma` và được mô tả trong `docs/Database Schema.md`, nhưng chưa migration nào tạo chúng — mọi truy vấn chạm các bảng này fail runtime `P2021` dù đã apply đủ 131 migration. Bổ sung `20260919000000_question_links_lecture_quizzes` (CREATE TABLE + index + FK, `onDelete: Restrict` với `questions` để giữ lịch sử làm bài). Không đụng bảng nào khác.

### Changed

- **`/admin/question-bank` — gọn danh sách:** bỏ cột *Phương án* và *Đáp án* trên bảng desktop; card mobile cũng không còn hiện số phương án / đáp án đúng (chi tiết vẫn xem khi Sửa hoặc trong dialog đề thi).
- **`/admin/question-bank` — tương tác danh sách:** bấm dòng/card mở `QuestionFormDialog` (bỏ nút Sửa); xoá bằng icon thùng rác (hover trên bảng desktop, luôn hiện trên card mobile vì không có hover).
- **Ticket #114 — Tách `topic.controller` / `topic.service` theo resource:** `apps/api/src/topic/` không còn god-file. Bảy controller theo `@ApiTags` (`course-chapters`, `course-topics`, `class-topics`, `topic-lectures`, `class-content`, `practice-topic-questions`, `exam-library`) và service tương ứng (`CourseChapterService`, `CourseTopicService`, `LectureService`, `ClassContentService`, `PracticeQuestionLinkService`, `ExamLibraryService`) + helper `TopicSupportService`. `TopicModule` wire lại; route path, contract API, Swagger tag không đổi. `TopicService` còn là aggregator 3-arg cho unit test hiện có và `Attempt`/`UserProfile`. Docs: `docs/Cách làm việc.md`, `docs/pages/admin.md`, `docs/Database Schema.md`.

### Added

- **Ticket #113 — ResponsiveDialog + ConfirmDialog:** Overlay form/nội dung dùng `ResponsiveDialog` (role=dialog, focus trap, Escape, khoá scroll nền, padding mép mobile). Xác nhận xoá/huỷ dùng `ConfirmDialog` (shadcn AlertDialog, biến thể destructive) thay `window.confirm` và modal `<div className="fixed inset-0">` trong phạm vi review: `AiImportModal`, `KnowledgeTreeCard`, `PracticeTopicQuestionsCard`, ngân hàng câu hỏi (xoá + form), `ClassContentManager`, thư viện đề thi, cài đặt khoá. Backdrop/Escape khi form dirty hỏi trước khi bỏ thay đổi. Icon-only close có `aria-label`. Mục luyện tập chưa mở trên danh sách học sinh là `<button disabled>`.

### Fixed

- **Ticket #112 — Dọn TanStack Query:**
  - `/auth/verify-login` dùng `useQuery` (`authKeys.verifyLogin`); lỗi mạng/hệ thống hiện message riêng, không gộp vào "liên kết không hợp lệ". `retry: false`, `staleTime: Infinity` vì GET có side-effect.
  - Hook chung `useCourseChapters` / `useCourseDifficultyLevels`; BankPicker, composer, `PracticeTopicQuestionsCard`, `AiImportModal`, `question-bank` không còn copy-paste `useQuery`.
  - `KnowledgeTreeCard` truyền `courseId` vào `getQuestions` — quiz dialog chỉ câu của khoá đang xem.
  - Search BankPicker / dialog thêm câu / thư viện đề debounce 300ms.
  - Mutation invalidate theo `courseId`: `questionKeys.course`, `examLibraryKeys.course`, `courseKeys.chapters` / `difficultyLevelsPrefix` — không `*.all` khi đã biết phạm vi.
- **Ticket #111 — Timeline transaction + DTO @MaxLength + reorder validate:**
  - `createClassContentItem` (tạo mới / nhập chuyên đề vào lớp) chạy trong một `$transaction`: tạo topic (nếu có) + `class_content_items` + dòng timeline + `syncClassTimelineSortByTime` đều dùng client `tx`. Lỗi giữa chừng rollback sạch, không content item mồ côi / `sortOrder` trùng.
  - `updateClassContentSchedule` cũng bọc update lần giao + resync sort trong cùng tx.
  - `POST /class/:id/timeline/reorder`: phát hiện id trùng (`[A,A,B]`), id lạ, hoặc thiếu item của lớp → HTTP 400; payload đủ & duy nhất mới persist.
  - DTO: `essayAnswer` 20.000, `feedback` 4.000, nội dung lý thuyết bài học 100.000, nhận xét buổi học (lessonContent/homework/tutorial) 20.000, URL 2.048 (`@IsUrl` + `@MaxLength`), ghi chú điểm danh 500. FE hiện lỗi (inline + Sonner) khi vượt.
- **Ticket #110 — DTO/Enums FE + skeleton + double-submit + toast có điều kiện:**
  - `Course` / `Chapter` / `CourseDifficultyLevel` (và `KnowledgeTreeNode` / `KnowledgeTreeTopicNode`) chỉ còn trong `apps/web/dtos/`; page/component import, không khai báo DTO cục bộ.
  - List trong phạm vi (`question-bank`, `exam-library`, `KnowledgeTreeCard`, `PracticeTopicQuestionsCard`, BankPicker) hiện shadcn `Skeleton` khi `isLoading`; empty-state chỉ sau khi load xong.
  - Mutation create/update/delete đề thi, gán đội giáo án, thêm câu hỏi: disable `isPending` + nhãn **Đang lưu…**. Nút **Nhập từ AI** disable + tooltip khi chưa chọn khoá.
  - `AiImportModal.handleCopy` await clipboard try/catch; CSV export và login chỉ toast success sau thao tác thật sự thành công.

### Security

- **Ticket #106 — Authorization theo khoá cho CRUD cây Kiến thức / Lecture / đọc câu hỏi topic:** `TopicService` gọi `CourseAccessService.assertCanManageCourse` trước ghi Chapter, Topic nhánh khoá, Lecture, Thư viện đề thi (kể cả reorder) và trước GET trả `correctIndex`/`explanation`/`answerGuide` cấp khoá. Gia sư `teacher` dạy lớp thuộc khoá X nhưng không trong đội giáo án → HTTP 403, không rò đáp án. `lesson_plan` chưa gán khoá Y không đọc được câu hỏi topic khoá Y. Thành viên đội giáo án hợp lệ vẫn CRUD bình thường. Swagger `@ApiResponse(403)`. Docs: ma trận dạy lớp ≠ soạn giáo án trong `docs/pages/admin.md`.

### Fixed

- **Ticket #102 — Cổng review bắt buộc khi nhập câu hỏi từ AI:** `AiImportModal` không còn bật Lưu ngay khi có câu hợp lệ. Sau parse, UI soát tuần tự từng câu (Trước/Sau, câu X/N, thanh tiến độ, tổng quan đã xem). Nút **Lưu vào ngân hàng** disabled tới khi mọi câu đã được xem; nhắc `Còn k câu chưa review`. Lỗi parse/item báo rõ câu số và trường. Invalidate `questionKeys.course(courseId)`. Docs: `docs/AI Question Import.md`.
- **Ticket #109 — Drag-drop rollback, touch, keyboard:**
  - `ClassTimelineManager`: lưu thứ tự lỗi rollback `localItems` về server, clear `orderDirty`, toast, kéo lại được. Drag handle thêm `touch-none`.
  - `KnowledgeTreeCard`: reorder optimistic qua query cache, revert khi API fail; handle spread `{...attributes}` + `{...listeners}` + `KeyboardSensor`/`sortableKeyboardCoordinates`; kéo chuyên đề sang chủ đề khác toast `"Không thể chuyển chương ở đây"`.
  - Drag handle các list còn lại (`ClassContentManager` đã có; gallery, thành tích) thêm `touch-none`.
- **Ticket #107 — Cron finalize Attempt hết giờ:**
  - Job `@Cron(EVERY_MINUTE)` (`AttemptExpiryJob`) quét Attempt `in_progress` đã quá `startedAt + durationMinutes` và gọi cùng `gradeAndClose` với nộp/GET. Status `timed_out`, chấm MCQ, câu tự luận vào hàng đợi gia sư, thống kê đếm là đã nộp.
  - Idempotent: `updateMany` `WHERE id AND status = in_progress` trong transaction — job trùng nút Nộp không double-grade. Log số lượt đã chốt; 0 bản ghi không nổ. `ScheduleModule.forRoot` (cron tắt khi `NODE_ENV=test`).
- **Ticket #108 — `openAt` tuỳ chọn + không floor phút + chặn duration 0:**
  - `POST /class/:id/content` luyện tập: thiếu `openAt` thì backend ghi thời điểm tạo lần giao (server). `parsePracticeSchedule(required=false)` trên create; PATCH vẫn `required=true`. `durationMinutes` 1–720; duration 0 bị chặn.
  - FE `AssignmentScheduleFields`: Ngày/Giờ mở bài không bắt buộc khi tạo; helper “để trống = mở ngay khi thêm vào lớp”. `fromOpenAtIso` giữ đúng phút (10:07 không thành 10:00). `EditScheduleDialog` disable Lưu khi duration rỗng/≤0.
  - `TimeInput` thêm `prefillEmpty` (mặc định true, giữ ADR session); form lần giao tạo mới tắt prefill để có thể để trống.

### Added

- **Ticket #99 — Ẩn mềm nội dung lớp & chặn xoá cây Kiến thức đang dùng:**
  - Prisma: `class_content_items` + `class_timeline_items` thêm `hidden_at` / `hidden_by_staff_id`. FK `class_content_items.topic_id` và `attempts.assignment_id` đổi `Cascade` → `Restrict`. Migration `20260918000000_soft_hide_class_content` (rollback trong ADR).
  - `DELETE /class/:id/content/:itemId` ẩn (không xoá Attempt); `POST .../restore` hiện lại. Học sinh GET nội dung/timeline/topic/quiz/attempt không thấy item đã ẩn.
  - Xóa Chủ đề / Chuyên đề / Bài học / đề thư viện khi còn `ClassContentItem` (kể cả ẩn) → HTTP 409 tiếng Việt `"… đang được N lớp sử dụng"`.
  - FE: `ClassContentManager` nút **Ẩn** / **Khôi phục** + badge; timeline staff hiện badge **Đã ẩn**. Sonner toast.
  - ADR `docs/adr/2026-09-07-class-content-soft-hide-restrict-knowledge-tree.md`.

### Security

- **Ticket #101 — Thu hồi phiên đăng nhập tức thời:** access/refresh JWT mang `deviceId` (`UserDevice.id`). `JwtStrategy` (APP_GUARD) và `jwt-refresh.strategy` đối chiếu thiết bị còn sống + `token_hash` refresh. Logout / đổi-reset mật khẩu / force-logout xóa device → request kế 401, không chờ access hết hạn. `last_active_at` throttle 1 phút. Không bảng/Redis mới. ADR `docs/adr/2026-09-07-immediate-device-revocation.md`.

### Added

- **Ticket #100 — Snapshot đề + thang 100 khi start Attempt:**
  - Prisma: `attempt_answers` thêm snapshot `type`/`content`/`options`/`correct_index`/`explanation`/`answer_guide`/`difficulty_label`. `points_possible` = Hamilton 100/N lúc start (không dùng `question_links.points`). Migration `20260918000000_attempt_answer_exam_snapshot`. ADR `docs/adr/2026-09-07-attempt-exam-snapshot.md`.
  - API: `start` N=0 → 400 tiếng Việt, không tạo Attempt. `gradeAndClose` + chấm tự luận đọc snapshot, không join `Question` live. Thống kê / hàng đợi / DTO `scoreMax` theo thang 100.
  - FE: `PracticeStatsView` và màn chấm tự luận hiện `/100`; ô điểm tự luận vẫn chặn `[0, pointsPossible]`.

### Changed

- **Lớp không điểm danh (local merge, không lấy #104 điểm danh theo buổi):** `Class.noAttendance` luôn cho buổi mới; payload tạo/sửa buổi không nhận `noAttendance`; form buổi chỉ banner. Snapshot `sessions.snapshot_no_attendance` lúc tạo. ADR `docs/adr/2026-09-05-class-without-attendance-still-charges.md` (Accepted); không giữ ADR 2026-09-07.
- **Timeline lớp (admin/staff):** bấm từng dòng `ClassTimelineManager` mở dialog chi tiết (buổi / khảo sát / chuyên đề). Kéo-thả chỉ đổi thứ tự trên client; **Lưu thứ tự** mới gọi `POST /class/:id/timeline/reorder`.

### Fixed

- **Ticket #105 — Polish nhỏ (review):**
  - `StudentDevicePopup`: nút buộc đăng xuất dùng token `error` (nhìn thấy rõ) + `window.confirm` (TODO #11).
  - `PracticeStatsView`: sort thật theo Điểm / Trạng thái; hàng chưa làm `bg-error/10` (bỏ opacity `/8` `/12`).
  - Thư viện đề thi: Escape huỷ sửa tên inline, không để `onBlur` lưu.
  - `EssayGradeCard`: Save disabled luôn hiện lý do (**Chưa nhập điểm** / **Điểm vượt thang**).
  - Soạn câu trắc nghiệm: chọn đáp án A/B/C/D (`UpgradedSelect`), vẫn lưu index 0-based.
  - `MathRichTextEditor`: toolbar đậm/nghiêng/list + chèn công thức LaTeX (inline/khối). Giữ rich text, không đổi nhãn thành "plain LaTeX".
  - `AiImportModal`: xoá dead code (`difficultyLevelId` ternary vô nghĩa, re-validate lệch); toàn bộ chuỗi tiếng Việt đủ dấu (kể cả typo "Qua nhau cau hoi").
  - `StudentAttemptTimer`: `aria-live` theo phút; đồng hồ visual vẫn tick 250ms.

- **Ticket #103 — 3 lỗi mất dữ liệu UI:**
  - **Sửa Bài học:** dialog `KnowledgeTreeCard` seed lại quiz đã gán mỗi lần mở (kể cả cùng lecture); gỡ quiz hiện `window.confirm` trước khi unlink.
  - **Hàng đợi chấm:** giữ snapshot list + tăng cursor; không `invalidateQueries` giữa các câu (tránh bỏ sót). Hết cursor → màn đã chấm xong; refetch khi chấm lại câu bỏ qua.
  - **Autosave bài thi:** `onError` + Sonner, chỉ báo Đang lưu / Đã lưu lúc hh:mm / Lưu lỗi — thử lại; Nộp flush save rồi dialog xác nhận (kèm số câu chưa trả lời); `beforeunload` khi còn thay đổi chưa lưu. Timer hết giờ vẫn nộp thẳng.

- **Timeline lớp — dialog buổi học:** lần bấm đầu vào dòng buổi không mở dialog vì `SessionHistoryTable` auto-open chạy khi list tháng còn rỗng (query lazy), rồi không chạy lại khi data về. Effect chờ `sessions` và chỉ mở một lần theo `autoOpenToken`.

### Added

- **Timeline lớp:** bảng `class_timeline_items` (migration `20260915000000_add_class_timeline_items`), API `GET/POST /class/:id/timeline` + `GET .../timeline/student`. Mặc định **mới nhất trên, cũ nhất dưới** (trộn buổi/khảo sát/chuyên đề); DnD lần đầu set `classes.timeline_custom_order`. Migrations `20260916000000`, `20260917000000`, `20260917120000` (reset cờ lock + xếp DESC). ADR `docs/adr/2026-09-07-class-timeline-join-table.md`.
- **Ticket #64 — Thống kê lần giao luyện tập (Màn 12):**
  - API: `GET /staff-ops/classes/:classId/assignments/:assignmentId/stats` (cùng access #63: `admin`/`teacher` phụ trách lớp). Điểm = lượt `hasUngradedEssay=false` cao điểm nhất (MCQ `autoGradedScore` + tổng `pointsAwarded` essay). Lượt chờ chấm không vào điểm / trung bình / tỉ lệ đúng. Tỉ lệ từng câu chỉ trên lượt tốt nhất đã chấm xong; essay “đúng” khi `pointsAwarded === pointsPossible`. Lọc theo `assignmentId` + `classId` (không gộp lớp dùng chung đề).
  - FE: `/staff/classes/[id]/practice/[cid]/stats` — 3 KPI, progress tỉ lệ đúng (câu dưới 50% tô error), bảng HS cuộn ngang, hàng Chưa làm nền đỏ nhạt, CSV “Xuất Excel”. Nút **Thống kê** cạnh Chấm tự luận trong `ClassContentManager`. TanStack Query + Sonner.

- **Ticket #63 — Chấm tự luận (hàng đợi lượt mới nhất):**
  - Prisma: `attempt_answers.feedback` (`TEXT?`) — nhận xét gia sư cho từng câu tự luận. Migration `20260914000000_add_attempt_answer_feedback`.
  - API (`apps/api/src/attempt`): `GET /staff-ops/classes/:classId/assignments/:assignmentId/grading-queue` trả hàng đợi (chỉ câu tự luận chưa chấm của **lượt mới nhất** mỗi học sinh — `distinct studentId` + `orderBy startedAt desc`; ôn nhẹ không tạo Attempt nên tự động không xuất hiện). `PATCH .../grading-queue/:attemptAnswerId` chấm 1 câu: `pointsAwarded` (0..`pointsPossible` snapshot), `feedback?`. Chấm lượt cũ (không phải mới nhất) trả 404. Hết câu tự luận chờ → `has_ungraded_essay = false`. `is_correct` giữ null cho tự luận. Không đụng `auto_graded_score/max` (chỉ MCQ). Access: `StaffOperationsAccessService`, chỉ mode `admin` hoặc `teacher` phụ trách lớp.
  - FE: `/staff/classes/[id]/grading/[assignmentId]` — Màn 11 mobile-first (banner "lượt mới nhất của {HS}", card 1 câu/lúc, pill độ khó + "Tối đa X điểm", box câu trả lời, xem barem `answerGuide` nếu có, input điểm `/max` + textarea nhận xét, "Bỏ qua" / "Lưu & chấm bài tiếp theo"). TanStack Query + Sonner. Entry point: nút "Chấm tự luận" ở mỗi mục luyện tập trong tab Nội dung của lớp.

- **Ticket #62 — Học sinh làm bài (Attempt + đồng hồ riêng):**
  - Prisma: `attempts` + `attempt_answers`; `assignment_id` → `class_content_items.id`. Snapshot `duration_minutes` / `points_possible`. Partial unique một `in_progress` / (assignment, student).
  - API: lobby/start/get/save/submit dưới `/users/me/student-classes/:classId/...`. Reuse `getPracticeAssignmentForStudent` (`openAt` #59 + hết hạn xem #49). Hết giờ chốt + chấm MCQ (`timed_out`), không huỷ. Tự luận để chờ chấm.
  - FE: tab Nội dung phân lý thuyết/luyện tập; `/student/classes/[id]/assignments/[assignmentId]` + trang làm bài mobile-first, timer sticky, TanStack Query, Sonner.

### Security

- **Ticket #86:** `GET /topics/:topicId/lectures/:lectureId/quizzes` chỉ còn `@Roles(admin)` (+ staff soạn nội dung). Học sinh phải dùng `GET /users/me/student-classes/:classId/topics/:topicId/lectures/:lectureId/quizzes` (có `validateStudentClassAccess`) để tránh IDOR nội dung câu hỏi ôn nhẹ theo `lectureId`.

### Added

- **Màn 09b: Lần giao — thời điểm mở và thời lượng riêng lớp (#59):**
  - Prisma: `class_content_items.open_at` + `duration_minutes` (lần giao cấp lớp). Không thêm cột lịch lên `topics` (đề dùng chung).
  - API: `POST /class/:id/content` nhận `openAt`/`durationMinutes` khi giao luyện tập; `PATCH /class/:id/content/:itemId` chỉ sửa lịch lần giao. Học sinh `GET .../topics/:topicId` và danh sách student content bị chặn/`isOpen=false` trước `openAt`.
  - FE: bước **Đặt lần giao** sau khi chọn đề luyện tập (DateInput + TimeInput 24h + UpgradedSelect thời lượng); sửa lịch từng lớp độc lập; student list khoá mục chưa mở. Toast Sonner.

- **Chuyên đề riêng lớp + gia sư tự soạn/nhập AI — Ticket #60 (màn 09c):**
  - Backend: `createClassContentItem` (tạo mới) uỷ quyền `createTopic` (`classId` có, `courseId` null). Chuyên đề luyện tập riêng lớp resolve khoá từ `Class.courseId` khi gắn `QuestionLink` (không nhân bản CRUD #55). Gia sư chỉ `POST/PATCH /questions` và `POST /questions/bulk` vào ngân hàng khoá của lớp đang dạy (`CourseAccessService.assertCanWriteCourseQuestions`); đội giáo án vẫn sửa/xoá.
  - Frontend: panel Thêm chuyên đề — hai banner riêng, composer chọn ngân hàng / soạn mới / `AiImportModal` inline; nhãn nguồn trên từng dòng; TanStack Query + Sonner.

- **Thư viện đề thi — Ticket #56:**
  - Backend: CRUD đề thi cấp khoá (`Topic.kind = practice`, `chapterId = null`) qua `GET/POST/PATCH/DELETE /course/:courseId/exam-library` và `POST /course/:courseId/exam-library/reorder`.
  - Frontend: `/admin/exam-library` quản lý đề thi theo khoá; soạn câu hỏi tái sử dụng `PracticeTopicQuestionsCard` và API `/topics/:topicId/questions` của ticket #55 (không nhân bản QuestionLink).

- **Soạn Chuyên đề luyện tập (đề) — Ticket #55:**
  - Backend: CRUD API cho quản lý câu hỏi trong chuyên đề luyện tập (`QuestionLink`):
    - `GET /topics/:topicId/questions` — Danh sách câu hỏi của đề
    - `POST /topics/:topicId/questions` — Thêm câu hỏi vào đề
    - `PATCH /topics/:topicId/questions/:linkId` — Cập nhật thứ tự/điểm
    - `DELETE /topics/:topicId/questions/:linkId` — Xóa câu hỏi khỏi đề
    - `POST /topics/:topicId/questions/reorder` — Sắp xếp lại thứ tự
    - `GET /topics/:topicId/questions/summary` — Tổng số câu hỏi và tổng điểm
    - `GET /topics/:topicId/questions/is-assigned` — Kiểm tra đề đã được giao cho lớp
  - Frontend: `PracticeTopicQuestionsCard` component — UI quản lý câu hỏi trong chuyên đề luyện tập trên Cây tri thức (`KnowledgeTreeCard`), bao gồm: thêm câu hỏi từ ngân hàng (lọc theo chủ đề/mức khó/tìm kiếm), chỉnh điểm từng câu, xóa câu hỏi, hiển thị tổng điểm.
  - Frontend: API functions, DTOs, query keys mới cho `QuestionLink`.
- **Màn 09a: Thêm chuyên đề — chọn từ khoá (#58):** Nút "Thêm chuyên đề" trong tab Nội dung mở panel chọn chuyên đề từ khoá học của lớp. Panel hiển thị danh sách chuyên đề theo chủ đề (chapter), có tìm kiếm, chọn đúng 1 mục mỗi lần thêm. Chuyên đề đã có trong lớp hiện trạng thái "Đã thêm" và bị khoá. Backend endpoint `GET /class/:id/content/course-topics` trả danh sách chuyên đề khoá kèm `alreadyAdded`. Toast Sonner thành công/thất bại. Mobile-first.

### Changed

- **Panel Thêm chuyên đề — default tab + cây (#87):** Mở **Thêm chuyên đề** mặc định tab **Thêm từ khoá** khi khoá học của lớp còn chuyên đề; fallback **Tạo mới cho lớp** nếu không có topic để chọn. `CourseTopicPicker` đổi từ list phẳng nhóm `chapterTitle` sang cây Chủ đề → Chuyên đề có expand/collapse (mobile-first). Không đổi API/schema.

- **Buổi học không điểm danh (`noAttendance`) — backend guard khi cập nhật session:**
  - `PUT /sessions/:id` và `PUT /staff-ops/sessions/:id`: Khi session có `snapshotNoAttendance = true`, field `attendance` trong payload bị bỏ qua (silent ignore) — buổi học tự quản danh sách điểm danh, không cho phép cập nhật từ bên ngoài.
  - Tính năng này đã có ở `POST /sessions` (tự tạo `Attendance.present` cho toàn bộ học sinh active), nay được mở rộng sang cả luồng cập nhật.
  - Rebellion `docs/adr/2026-09-05-class-without-attendance-still-charges.md`.

### Added

- **Xác minh magic link học sinh — phân biệt trạng thái link (ticket #66, bổ sung trên nền #65):**
  - `GET /auth/verify-login` trả `{ status, message, verified }` với `status: verified | used | expired | invalid` thay vì chỉ `{ message, verified }`.
  - Máy bấm link lần đầu hợp lệ → `verified`; link đã được bấm trước đó (yêu cầu đã xác minh) → `used`; quá hạn 10 phút → `expired`; token sai/thiếu/không tồn tại → `invalid`. Không set cookie/kích hoạt phiên trên máy bấm link — thiết bị được kích hoạt vẫn là máy khởi tạo.
  - Frontend `/auth/verify-login` hiển thị thông báo riêng cho từng trạng thái (Screen 17), đáp ứng AC "link hết hạn / đã dùng / sai có thông báo riêng".

- **Cài đặt khoá — thời hạn, thang độ khó, đội giáo án (ticket #48):**
  - Prisma: thêm model + bảng `course_lesson_plan_members` (quan hệ `Course`–`StaffInfo`, unique `(course_id, staff_id)`, cascade xoá). Migration `20260907000000_add_course_lesson_plan_members`.
  - API `/courses`: `POST/PATCH` nhận và lưu `default_duration_days` (để trống/null = vô hạn); `GET /courses/:id` trả chi tiết kèm `difficultyLevels`, `lessonPlanMembers`, `_count.classes`; `GET /courses` trả `_count`.
  - API `/courses/:id/difficulty-levels`: GET (lọc `includeInactive`), POST, PATCH theo id, PATCH `/reorder`, DELETE.
  - API `/courses/:id/lesson-plan-members`: GET danh sách, PUT thay toàn bộ đội giáo án (chỉ nhân sự active có role `lesson_plan`/`lesson_plan_head`); `GET /courses/lesson-plan-staff` để fill picker.
  - `CourseAccessService` — guard phân quyền nội dung khoá tái sử dụng: admin/trợ lí/`lesson_plan_head` quản lý mọi khoá; thành viên `lesson_plan` chỉ khoá được gán; gia sư dạy lớp thuộc khoá X không tự động sửa được nội dung cấp khoá X. Unit tests `course-access.service.spec.ts`.
  - Frontend `/admin/classes/courses` (Màn 01) hiển thị thời hạn + số lượng, thêm/sửa `default_duration_days` trong `CourseFormPopup`; trang mới `/admin/classes/courses/:id` (Màn 08) quản lý thang độ khó và đội giáo án bằng TanStack Query + `UpgradedSelect` + `runBackgroundSave`/Sonner.
  - Khi sửa khoá đã tồn tại, `CourseFormPopup` hiện banner cảnh báo (style `Alert variant="warning"`) cạnh thời hạn mặc định: "Chỉ áp dụng cho lớp tạo mới — Lớp đang chạy giữ nguyên hạn đã đặt. Đổi hạn từng lớp ở trang lớp." (`default_duration_days` không hồi tố cho lớp đã tạo).
  - Đội giáo án (Màn 08): `lesson_plan_head` không cần gán nên không hiện trong picker để thêm; nếu có trong danh sách member thì hiện pill **Mặc định** và không có nút Gỡ.

- **Lớp không điểm danh (`noAttendance`) — Tự động điểm danh present khi tạo buổi học:**
  - Thêm boolean `noAttendance` trên `Class` (default `false`); admin/assistant có thể bật/tắt qua `PATCH /class/:id/basic-info`.
  - Khi `noAttendance = true`, tạo buổi học tự động tạo `Attendance.present` cho toàn bộ học sinh active, bỏ qua form điểm danh.
  - Session snapshot giá trị `noAttendance` thành `snapshotNoAttendance` (không đọc lại từ Class sau khi tạo).
  - Tuition/allowance vẫn tính đúng — `tuitionFee` = tổng `present`/`excused` × học phí mỗi học sinh.
  - **Migration:** `20260905100000_add_class_no_attendance` — thêm `no_attendance` vào `classes`, `snapshot_no_attendance` vào `sessions`.

- **Student single-device login (ticket #65):**
  - Thêm bảng `user_devices` và `login_requests` trong Prisma schema.
  - Luật một thiết bị tại một thời điểm cho tài khoản học sinh: khi đăng nhập ở máy thứ hai khi máy cũ còn hiệu lực → bị chặn, hiện màn hình lỗi rõ lý do và cách gỡ.
  - Flow đăng nhập học sinh mới: nhập credentials → gửi magic link email → poll chờ xác minh → activate device + cấp JWT tokens.
  - `StudentDeviceGuard` trên `POST /auth/refresh`: kiểm tra student có device active không trước khi cấp token mới.
  - Endpoint `POST /auth/admin/students/:id/force-logout`: admin/CSKH/assistant buộc đăng xuất học sinh, ghi audit trail.
  - Lazy cleanup: xóa login requests hết hạn và devices inactive > 60 ngày khi tạo login request mới.
  - Frontend: login page xử lý cả student và staff/admin flow; màn hình "Check your email" với polling; màn hình blocked device (Screen 18).
  - Frontend: `verify-login` page cho magic link.
  - Student sidebar/header dùng `POST /auth/student/logout` để cleanup device khi đăng xuất.
  - `POST /auth/student/login/poll` đổi từ GET sang POST, requestId đưa vào body thay vì URL path để tránh leak trong access logs.
  - Activate endpoint yêu cầu `activateSecret` (one-time secret trả về từ bước login init) kèm `requestId`, không còn dựa vào requestId UUID làm secret duy nhất.
  - Device check cho student được áp dụng trên mỗi access token validation (`JwtStrategy.validate`), không chỉ ở refresh. Kết quả cache trong `AuthIdentityCacheService` (TTL 5s), invalidate khi force-logout/xóa device.
  - `touchDevice` gọi trên mỗi refresh để rule inactive 60 ngày hoạt động đúng.
  - `studentLoginInit` trả `error: NOT_STUDENT_ACCOUNT` hoặc `error: EMAIL_NOT_VERIFIED` riêng biệt; FE chỉ fallback sang staff login khi gặp `NOT_STUDENT_ACCOUNT`.
  - Kiểm tra roleType chuyển xuống sau bcrypt.compare để tránh account enumeration.

- **Lương cứng trên dashboard và thống kê tháng (ticket 06):**
  - Chỉ số **Trợ cấp chờ thanh toán** (`pendingPayrollTotal` / `pendingPayrollBreakdown`) cộng lương cứng `pending` all-time (gross), không lọc theo kỳ dashboard. Popup chi tiết có nguồn **Lương cứng chưa thanh toán**.
  - `GET /dashboard/monthly-statistics` (+ PDF) thêm cấu phần `fixedSalaryCost` tách khỏi trợ cấp/thưởng; `expense` / chi phí nhân sự cộng lương cứng. Tháng chưa chốt không có payable → 0, layout giữ nguyên.
  - Cùng quy tắc che số liệu tài chính: `accountant_income` không thấy lương trên lớp/session; `accountant_expense` thấy lương cứng như các khoản chi khác trên dashboard chi.

- **Cài đặt hệ thống (ticket 01):**
  - Sidebar admin và staff (assistant) có mục **Cài đặt hệ thống** tại `/admin/system-settings` và `/staff/system-settings`. Tab đang chọn nằm trong URL (`?tab=deductions` hoặc `?tab=fixed-salary`). Tab **Khấu trừ** là màn khấu trừ cũ (role defaults, TanStack Query, UpgradedSelect, Sonner) không đổi nghiệp vụ.
  - Bookmark `/admin/deductions` và `/staff/deductions` redirect vào tab Khấu trừ. Mục sidebar **Khấu trừ** đã gỡ. Quyền giữ như màn cũ: admin + assistant; kế toán không mở.

- **Lương cứng mặc định theo role (ticket 02 / 02b):**
  - Tab **Lương cứng** trên Cài đặt hệ thống: hai nhóm độc lập — **mức lương cứng theo role** và **% vận hành lương cứng theo role** — mỗi nhóm một nút lưu. Trống = chưa cấu hình, khác 0đ / 0%.
  - `GET/PUT /fixed-salary-settings/role-defaults` (amount) và `GET/PUT /fixed-salary-settings/role-operating-rates` (percent). Swagger, admin + assistant. Validate số âm và % ngoài 0–100 ở FE + BE. Mỗi thay đổi ghi `action_history` (`role_fixed_salary_default` / `role_fixed_salary_operating_rate_default`). Bảng `role_fixed_salary_defaults` + `role_fixed_salary_operating_rate_defaults` — không tái dùng `extra_allowances`, không gộp hai cột trên một row.
  - % vận hành lương cứng không đọc/ghi `% vận hành` theo lớp; test khẳng định trợ cấp buổi học không đổi số tiền. Thuế tái dùng tab Khấu trừ.
  - Docs: `CONTEXT.md`, `docs/Database Schema.md`, ADR `docs/adr/2026-09-09-role-default-fixed-salary.md`.

- **Đè lương cứng theo nhân sự (ticket 03):**
  - Tab **Lương cứng** thêm danh sách nhân sự tìm kiếm được; mỗi (nhân sự, role đang mang) một dòng độc lập. Hai trục đè tách: lương (`staff_fixed_salary_overrides`) và % vận hành (`staff_fixed_salary_operating_rate_overrides`). Có row = đè (kể cả 0); không row = mặc định role. Đè một trục không chốt cứng trục kia.
  - API: `GET /fixed-salary-settings/staff-overrides`, `PUT .../staff-overrides/amount`, `PUT .../staff-overrides/operating-rate`. Audit `staff_fixed_salary_override` / `staff_fixed_salary_operating_rate_override`. Admin + assistant. TanStack Query, Sonner, mobile-first.

- **Chốt lương cứng tháng (ticket 04):**
  - Cùng hàm cho cron 01:00 ngày 28 (timezone `Asia/Ho_Chi_Minh`) và nút **Chốt lương tháng này** trên tab Lương cứng. Sinh một khoản `staff_fixed_salary_payables` / (nhân sự `active`, role đang mang, tháng hiện tại) khi mức resolve > 0; snapshot gộp, % vận hành, % thuế, khấu trừ từng loại, thực nhận. Unique `(staff_id, role_type, month)` ở DB; lần hai không tạo thêm và không sửa khoản cũ. Công thức `calculateDeductionAmounts` (vận hành trên gộp, thuế trên phần còn lại).
  - `POST /fixed-salary-settings/close-month`, `GET /fixed-salary-settings/payables?month=YYYY-MM`. Toast báo số khoản đã sinh / bỏ qua vì đã tồn tại; danh sách tháng hiện tại hiện ngay trên tab. Admin + assistant. Chưa nối vào màn payroll khác.

- **Lương cứng trên hồ sơ thu nhập (ticket 05):**
  - Card **Lương cứng** trên `/admin/staffs/:id` (mirror `/staff/staffs/:id`) và `/staff/profile`: dòng riêng theo role (gộp, KH VH, thuế, thực nhận, chưa nhận/đã nhận). Không gộp vào Công việc khác / thưởng / trợ cấp thêm.
  - `GET /staff/:id/income-summary` và `GET /users/me/staff-income-summary` thêm `fixedSalaryRoleSummaries` + `fixedSalaryPayables`; tổng tháng/năm, snapshot chưa nhận gồm lương cứng. `PATCH /staff/:id/payment-status/pay-all` và `pay-selected` nhận `sourceType=fixed_salary` (giữ % đóng băng). `PATCH /staff/:id/fixed-salary-payables/:payableId` sửa số gộp/ghi chú khi pending; không có API xóa; paid không sửa. Audit `staff_fixed_salary_payable`. Cột `note` trên `staff_fixed_salary_payables`.
  - FE: TanStack Query, Sonner, mobile-first. Nhân sự tự xem trên profile (không sửa). Admin / assistant / kế toán chi sửa khoản pending.

- **Preview học phí theo 30 phút trong popup Thêm buổi học:**
  - Popup **Thêm buổi học** tính lại học phí mặc định từng học sinh theo khung giờ đang nhập khi lớp bật `pricing_mode = per_block`: `custom_tuition_per_block` → `student_tuition_per_block`, nhân số block của buổi. Header **Học phí**, dòng **Mặc định / Đang áp dụng** và gợi ý học phí từng học sinh đều dùng số này thay vì học phí / buổi.
  - Số block preview bám backend: lấy từ giờ bắt đầu–kết thúc, nếu không chia hết 30 phút thì rơi về số block của buổi chuẩn theo lịch cố định. Thiếu cả hai thì hiện nhắc nhập giờ kết thúc và giữ học phí / buổi.
  - Lớp theo buổi không đổi hiển thị. Helper dùng chung `apps/web/lib/session-tuition.helpers.ts` (mirror `resolveSessionChargeTuitionFee` phía API) + unit test.

- **Ô nhập Học phí / HV / 30 phút trên form lớp (#141):**
  - Form thêm/sửa lớp khi bật chế độ theo block hiện ô **Học phí / HV / 30 phút** cạnh trợ cấp (MoneyInput, số block chuẩn, quy đổi buổi chuẩn). Prefill từ gói hoặc `student_tuition_per_block` đang lưu; số nhập tay được ghi thẳng vào cột lớp và không bị dual-write từ học phí mỗi buổi. Để trống thì vẫn suy `ROUND(per-session ÷ số block chuẩn)`.
  - **Tổng gói** / **Số buổi** không đổi. Ô mới không ghi `student_tuition_per_session` (gói trống vẫn `null` / UI `—`). Lớp theo buổi không thấy ô này.
  - API: `POST /class`, `PATCH /class`, `PATCH /class/:id/basic-info` nhận `student_tuition_per_block` (nullable). Swagger mô tả field. Đổi lịch cố định không còn ghi đè đơn giá học phí / 30 phút đã nhập tay.
  - Docs: `CONTEXT.md` mục Chế độ tính tiền của lớp, `docs/pages/admin.md`.

- **Trợ cấp gia sư theo block 30 phút, opt-in theo lớp (#135):**
  - Lớp `pricing_mode = per_block`: `allowance_amount` = `đơn_giá_block/HS × sĩ số present/excused × snapshot_block_count + scale_amount` (`scale_amount` không nhân block). `class_teachers.custom_allowance` hiểu là VNĐ / HS / 30 phút. Trần payroll = `max_allowance_per_block × snapshot_block_count`.
  - Lớp theo buổi (mặc định): giữ nguyên `computeDefaultSessionAllowanceAmountVnd` và trần `max_allowance_per_session` — regression test chứng minh số tiền y hệt trước.
  - Payroll/dashboard/reporting đọc snapshot buổi, không suy lại từ giờ. Trợ cấp quản lý lớp / CSKH / trợ lý / hoa hồng giáo án vẫn theo `tuition_fee`, không cộng `scale_amount` lần hai.
  - Docs: `CONTEXT.md`, `docs/Database Schema.md`, `docs/pages/admin.md`, ADR expand-block-pricing.

- **UI admin — chọn chế độ tính tiền và đơn giá / 30 phút (#137):**
  - Form thêm/sửa lớp: switch **Chế độ tính tiền** phản ánh `pricing_mode`; nhãn trợ cấp đổi **/ buổi** ↔ **/ 30 phút**.
  - Chế độ theo block hiện số block chuẩn từ lịch và số tiền quy đổi một buổi chuẩn. Confirm trước khi đổi trên lớp đã có (unpaid tính lại; paid/cọc giữ nguyên).
  - Chặn bật block khi thiếu số block chuẩn, toast lý do cụ thể (Sonner). Payload API vẫn `*_per_session`.
  - Docs: `docs/pages/admin.md`, `CONTEXT.md`. Test FE `class-pricing-mode.test.ts` + regression charge `per_session` y hệt công thức cũ.

- **Chế độ tính tiền theo lớp — bật/tắt block 30 phút, mặc định tắt (#139):**
  - Enum `ClassPricingMode` (`per_session` / `per_block`) trên `classes.pricing_mode`, NOT NULL, mặc định theo buổi. Migration `20260909100000_class_pricing_mode` backfill mọi lớp hiện có.
  - `resolveSessionChargeTuitionFee` và giờ buổi bắt buộc (`assertRequiredSessionTimes`) gated theo cờ. `sessions.snapshot_block_count` chỉ ghi khi lớp theo block. Gói riêng luôn theo buổi.
  - `PATCH /class/:id/pricing-mode` đổi chế độ, tính lại buổi unpaid (học phí, trợ cấp, snapshot); buổi paid/deposit/cọc không đổi. Từ chối bật block nếu không có số block chuẩn.
  - UI: switch **Chế độ tính tiền** trên thêm/sửa lớp; form buổi không bắt buộc giờ khi lớp theo buổi.
  - Docs: `CONTEXT.md`, `docs/Database Schema.md`, ADR expand-block-pricing (contract #138 huỷ).

- **Giáo án — bậc độ khó + tick hạng mục, tiền tự tính (`#132`):**
  - `lesson_outputs` thêm `difficulty_band` (enum 5 bậc, nullable) và `includes_test` / `includes_solution` / `includes_lecture_video` (mặc định `false`). Migration `20260909090000_lesson_output_difficulty_pricing`.
  - Backend bỏ qua `cost` client gửi lên; tạo/sửa có bậc thì `cost` = tổng bảng giá hằng số theo tick (không tick → `0`). Output chưa có bậc giữ nguyên `cost` cũ khi sửa các field khác.
  - Form tạo/sửa output (full + popup nhanh): dropdown **Độ khó** kèm gợi ý rating, 3 checkbox hạng mục, ô **Chi phí** read-only với mọi vai trò. `level` vẫn dùng để lọc tab Bài tập, không liên quan tới tiền.

### Changed

- **Học phí lớp theo block: đơn giá / 30 phút thắng gói (#140):**
  - `resolveSessionChargeTuitionFee` khi `pricing_mode = per_block`: `custom_tuition_per_block` → `student_tuition_per_block` → gói riêng → gói lớp. Charge = đơn giá block × `sessions.snapshot_block_count` (cùng số block với trợ cấp gia sư). Gói chỉ còn fallback khi thiếu đơn giá / 30 phút hoặc thiếu số block — khi đó vẫn tính theo buổi.
  - Lớp theo buổi (`per_session`): không đổi; không đọc cột per-block. Test khoá hành vi cho cả hai chế độ.
  - Docs: `CONTEXT.md` (bỏ “gói riêng luôn tính theo buổi” ở mục chế độ tính tiền).

- **Học phí học sinh theo block 30 phút là opt-in theo lớp (#139, sửa #136):**
  - Học sinh **không gói** chỉ charge `đơn_giá_block × snapshot_block_count` khi lớp `pricing_mode = per_block`. Lớp theo buổi (mặc định, mọi lớp cũ) dùng chuỗi `custom_tuition_per_session` → gói hiệu lực → `student_tuition_per_session`, kể cả khi cột block đã có giá trị.
  - Học sinh **có gói** luôn theo buổi ở cả hai chế độ.
  - Cột `*_per_session` không bị xoá (#138 huỷ).

- **Học phí học sinh theo block 30 phút, gói là ngoại lệ (#136):**
  - Học sinh **không gói**: `attendance.tuition_fee` mặc định = (`custom_tuition_per_block` hoặc `classes.student_tuition_per_block`) × `sessions.snapshot_block_count` (cùng số block với trợ cấp gia sư). Thiếu per-block hoặc số block → fallback cột per-session.
  - Học sinh **có gói** (gói lớp khi charge đang đi nhánh gói, hoặc gói riêng): **không đổi** công thức theo buổi.
  - Trợ cấp quản lý lớp / CSKH / trợ lý 3% / hoa hồng giáo án vẫn đọc `tuition_fee` đã chốt. Buổi tạo trước không bị backfill lại học phí.
  - Docs: `CONTEXT.md`, `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md`.
- **Buổi học — bắt buộc giờ bắt đầu/kết thúc (#133):**
  - **Backend:** `POST /sessions` và `POST /staff-ops/classes/:classId/sessions` từ chối payload thiếu `startTime`/`endTime`; giờ kết thúc phải sau giờ bắt đầu. `PUT` buổi: nếu client gửi giờ thì cả hai phải hợp lệ; buổi `paid`/`deposit` từ chối đổi giờ. Script chỉ-đọc `pnpm --filter api sessions:list-missing-time` liệt kê buổi thiếu giờ (id, lớp, ngày). Cột DB vẫn nullable cho dữ liệu cũ.
  - **Frontend:** Form tạo/sửa buổi validate giờ trước khi gửi, báo lỗi bằng Sonner. Ô giờ disabled khi buổi `paid`/`deposit` (cùng cơ chế khóa card Trợ cấp buổi).

- **Hotfix — Link video YouTube (recording) không còn bắt buộc khi tạo/sửa buổi học:**
  - **Backend:** `SessionCreateService` và `SessionUpdateService` bỏ validation bắt buộc `recordingUrl` khi lớp có $\ge 2$ học sinh. `recordingUrl` luôn optional cho mọi lớp/mọi actor; format YouTube vẫn chưa được validate ở backend (chỉ validate ở frontend, không đổi trong hotfix này).
  - **Frontend:** `AddSessionPopup` (tạo buổi học) và `SessionHistoryTable` (sửa buổi học) bỏ dấu bắt buộc và chặn submit khi thiếu `recordingUrl`; vẫn giữ validate định dạng YouTube (`extractYouTubeVideoId`) khi người dùng có nhập link.

### Added

- **Expand đơn giá theo block 30 phút (#134):**
  - Migration `20260909090000_expand_block_pricing` thêm `classes.allowance_per_block_per_student`, `max_allowance_per_block`, `student_tuition_per_block`, `student_classes.custom_tuition_per_block`, `sessions.snapshot_block_count` (không xóa cột cũ). Backfill `ROUND(giá_cũ / số_block_chuẩn)` từ lịch cố định; lớp không suy được số block để `null`. `class_teachers.custom_allowance` backfill cùng quy tắc (API vẫn nhận/trả theo buổi).
  - Dual-write trên tạo/sửa lớp, roster gia sư, học phí riêng học sinh, đổi lịch cố định. Tạo buổi ghi `snapshot_block_count`.
  - `GET /class/missing-standard-blocks` và script `apps/api/scripts/list-classes-missing-standard-blocks.ts` xuất lớp thiếu số block chuẩn.
  - ADR: `docs/adr/2026-09-09-expand-block-pricing.md`. Payroll/gói/`scale_amount`/`coefficient` không đổi công thức trong bước này.
- **Migration — Backfill hồ sơ `student_info` cho toàn bộ tài khoản `users` có role `student`:**
  - Tạo migration `20260904090000_backfill_student_info_for_student_users` tự động đồng bộ hồ sơ `student_info` cho các tài khoản người dùng có role `student` nhưng chưa có profile (như tài khoản `hocsinh1` và các tài khoản test/legacy khác).
  - Quy trình xử lý 2 bước: (1) Tự động liên kết các bản ghi `student_info` mồ côi nếu trùng email với tài khoản học sinh; (2) Tự động sinh ID chuẩn `UNIST-[0-9a-f]{10}` và chèn hồ sơ `student_info` mới (họ tên lấy theo `last_name + first_name` hoặc `account_handle`, trạng thái `active`, số dư ví `0 đ`, quyền nhận biên lai email) cho tất cả các tài khoản học sinh còn lại.
- **Điều hướng & Trang chủ (`/`) — Định nghĩa trang chủ là Workspace của người dùng thay vì `/user-profile`:**
  - Khắc phục triệt để lỗi tài khoản học sinh bị kẹt ở `/user-profile`. Khi truy cập `/` hoặc đăng nhập thành công, hệ thống điều hướng trực tiếp vào workspace mặc định của tài khoản (`/student` đối với học sinh, `/staff` đối với nhân sự/gia sư, `/admin/dashboard` đối với quản trị viên). Chỉ các tài khoản chưa có workspace khả dụng mới chuyển về `/user-profile`.
  - Nút quay lại "← Trang chủ" tại `/user-profile` và các link trang chủ trên thanh điều hướng được cập nhật động theo workspace của người dùng (`getUserWorkspaceHref`).
  - Đồng bộ logic giữa `apps/web/proxy.ts`, `apps/web/lib/auth-redirect.ts`, `apps/web/components/student/StudentAccessGate.tsx`, `apps/web/app/page.tsx`, `apps/web/components/student/StudentSidebar.tsx` và backend `AuthAccessService` (`resolveDefaultWorkspace`, `resolvePreferredRedirect`, `canAccessStudentWorkspace`).
- **Chi tiết lớp học — Tách nút (+) dropdown thành 2 nút độc lập "Tạo buổi học" và "Tạo khảo sát":**
  - Cập nhật cả 2 màn hình quản lý chi tiết lớp học (`/admin/classes/[id]` và `/staff/classes/[id]`), loại bỏ menu dropdown trung gian khi bấm nút tròn (+).
  - Bổ sung 2 nút bấm riêng biệt: **Tạo buổi học** (mở dialog `AddSessionPopup`) và **Tạo khảo sát** (kích hoạt dialog tạo khảo sát của `ClassSurveyPanel`) giúp thao tác nhanh và trực quan.
- **Lớp học — Bắt buộc nhập Link video YouTube (recording) đối với lớp có $\ge 2$ học sinh:**
  - **Frontend:** Tại popup tạo buổi học (`AddSessionPopup`) và popup chỉnh sửa buổi học (`SessionHistoryTable`), tự động hiển thị dấu sao đỏ `<RequiredMark />` cùng ghi chú `(Bắt buộc đối với lớp từ 2 học sinh)` nếu số học sinh trong lớp/buổi học $\ge 2$; form validation chặn lưu và thông báo lỗi rõ ràng nếu trường link YouTube bị để trống.
  - **Backend:** `SessionCreateService` và `SessionUpdateService` bổ sung validation nghiệp vụ: từ chối tạo hoặc cập nhật buổi học nếu có từ 2 học sinh trở lên mà `recordingUrl` rỗng hoặc null, trả về lỗi `BadRequestException` với thông báo tương ứng.
- **Admin Dashboard — Cảnh báo lớp chưa nộp báo cáo khảo sát theo từng Bài khảo sát:** Thay thế cảnh báo khảo sát theo số lần đơn lẻ cố định bằng cơ chế cảnh báo theo danh sách các Bài khảo sát thực tế đang mở (`startDate <= hôm nay`). Với mỗi bài khảo sát đang mở, hệ thống tự động quét toàn bộ các lớp `running` (không nằm trong danh sách loại trừ của bài khảo sát đó) và chưa nộp báo cáo để đưa vào nhóm cảnh báo `Lớp chưa báo cáo khảo sát` trên Admin Dashboard kèm tên bài khảo sát, gia sư phụ trách, thời hạn và link mở chi tiết.
- **Trang Khảo sát — Xem danh sách lớp Đã báo cáo / Chưa báo cáo khi bấm vào số liệu:** Trên bảng danh sách và card bài khảo sát (`SurveysManager`), các con số tại cột "Đã báo cáo" và "Chưa báo cáo" được nâng cấp thành nút bấm tương tác (có hiệu ứng hover/badge). Khi bấm vào, hệ thống mở modal `SurveyClassesDialog` phân tab Đã báo cáo / Chưa báo cáo, hỗ trợ tìm kiếm lớp & gia sư, xem chi tiết ngày nộp/người nộp/nhận xét đánh giá kiến thức, và click điều hướng trực tiếp vào trang chi tiết lớp học (`/admin/classes/:id` hoặc `/staff/classes/:id`). Backend bổ sung endpoint `GET /surveys/:id/reported-classes`.
- **Học sinh — Gỡ bỏ hoàn toàn tính năng nhận thông báo:** Gỡ bỏ chuông thông báo (`SidebarNotificationTray`) khỏi giao diện học sinh (`StudentSidebar`, `StudentHeader`), ngắt kết nối realtime notification websocket cho role học sinh (`NotificationSocketBridge` trong `apps/web/app/providers.tsx`). Backend thu hẹp quyền feed thông báo (`GET /notifications/feed`, `PATCH /notifications/feed/:id/read`, socket gateway `/notifications`) chỉ cho `admin` và `staff`, đồng thời loại bỏ học sinh khỏi danh sách người nhận / đối tượng mục tiêu thông báo hệ thống.
- **Điều hướng Trang chủ (`/`) — Thay thế Landing page bằng Workspace của người dùng:** Gỡ bỏ hoàn toàn trang giới thiệu landing page ở root `/`. Khi người dùng truy cập trang chủ, hệ thống (`proxy.ts` và `app/page.tsx`) sẽ tự động nhận diện tài khoản và điều hướng ngay lập tức tới workspace tương ứng (`/admin`, `/staff`, `/student`, hoặc `/user-profile` nếu chưa phân workspace, và `/auth/login` nếu chưa đăng nhập).
- **Lớp học — Bổ sung trường Link recording vào form Chỉnh sửa buổi học (`SessionHistoryTable`):** Thêm trường nhập "Link video YouTube (recording)" kèm preview video `YouTubeEmbed` bảo mật trong popup chỉnh sửa buổi học; đồng bộ dirty checking và xử lý cập nhật `recordingUrl` xuống cơ sở dữ liệu trên Backend API (`SessionUpdateService`).
- **Học sinh — Layout SPA không sidebar & Header mới (`StudentHeader`):** Chuyển giao diện học sinh từ sidebar dọc sang dạng SPA toàn màn hình với thanh `StudentHeader` trên đỉnh trang (Brand lockup, điều hướng nhanh, chuông thông báo portal, bộ chọn theme, avatar & nút đăng xuất).
- **Học sinh — Tinh gọn Dashboard (`/student`):** Bỏ các card thông tin cơ bản, thông tin phụ huynh, lịch thi trên trang chủ học sinh (đã chuyển về quản lý tập trung tại `/user-profile` kèm `StudentExamCard` và `ParentReceiptEmailSwitch`). Trang chủ chỉ hiển thị Thẻ Số dư ví (kèm Nạp tiền SePay QR + Lịch sử ví), Danh sách lớp học (mỗi lớp có thể click trực tiếp để vào xem chi tiết lớp tại `/student/classes/[id]`), và tiến độ UNIOJ.
- **Video bài học — Trình phát video bài học chuẩn Production (`YouTubeEmbed`):** Triển khai trình phát video tối ưu hóa cao cho bài giảng, kết nối trực tiếp YouTube Iframe API (`youtube-nocookie.com`). Khắc phục hoàn toàn các lỗi trên thiết bị di động / iOS Safari (Touch to Play/Pause tức thì, Fullscreen bung 100% màn hình thiết bị không bị lỗi iframe remount, thanh tua tiến trình kèm tooltip thời gian, điều chỉnh âm lượng & tốc độ phát 0.5x - 2x, phím tắt k/j/l/m/f/Esc, tự động ẩn controls sau 3.5s khi phát). Tích hợp cơ chế phát hiện DevTools đa tầng (`useDevToolsDetector`) hỗ trợ tức thì cả 2 chế độ **Docked** (bám viền) lẫn **Undocked / Cửa sổ rời** (Web Worker anti-debugging heartbeat, dynamic debugger timing loop, console serialization latency, object getters, window blur trigger) để lập tức ẩn & hủy iframe bảo vệ bản quyền video khi video đang phát.

- **Bài khảo sát — tự động push thông báo cho gia sư liên quan khi tạo mới:** `SurveyService.createSurvey` sau khi tạo thành công sẽ tính danh sách gia sư đang phụ trách ít nhất 1 lớp `running` chưa bị loại trừ, rồi gọi `NotificationService` (module `notification` có sẵn — chuông thông báo FE) tạo + push 1 thông báo tới đúng các gia sư đó (`targetUserIds`), title = tên bài khảo sát, nội dung dựng từ Thời gian/Nội dung/Hướng dẫn/Lưu ý/Gia sư của bài khảo sát. Không có gia sư liên quan → bỏ qua; lỗi push chỉ log, không fail request tạo khảo sát. `ClassModule` import thêm `NotificationModule`.
- **Bài khảo sát — chọn lớp loại trừ qua dialog search + filter loại lớp + infinite scroll:** thay picker checkbox inline (chỉ lọc lớp `status=running`, đã tải trước tối đa 300 lớp) bằng nút mở `ClassExclusionDialog` — dialog có ô tìm kiếm debounce gọi `GET /class?search=` phân trang (không giới hạn `status`, khắc phục lỗi "Không có lớp phù hợp" khi lớp cần loại trừ không thuộc trang tải sẵn) + dropdown lọc theo loại lớp (Tất cả/Basic/Advance/Hardcore/VIP, param `type`), danh sách cuộn vô hạn (`useInfiniteQuery` + `IntersectionObserver`). Checkbox **"Chọn tất cả (N)"** select **toàn bộ N lớp khớp filter** (gọi thêm các trang còn lại song song để lấy đủ ID trước khi set selection), không chỉ các lớp đã tải/hiển thị như trước. Lớp đã chọn hiển thị dạng chip có nút bỏ chọn nhanh bên ngoài dialog.
- **Bài khảo sát — soạn thông báo có cấu trúc + copy Zalo, mở cho đội giáo án:** `Survey` thêm 3 field text mới `notification_instructions` (Hướng dẫn), `notification_notes` (Lưu ý), `notification_teacher_note` (Gia sư), cạnh `notification_title` và `notification_content` (Nội dung) đã có — form tạo/sửa bài khảo sát (`SurveysManager`) đổi từ 1 rich text field sang 4 field riêng (Nội dung/Hướng dẫn/Lưu ý/Gia sư), hiển thị phẳng không đóng khung card, có khung xem trước + nút **"Sao chép để dán Zalo"** ở footer dialog (cùng hàng "Hủy"/"Lưu bài khảo sát") dựng message dạng `📢 <tên bài khảo sát> / ⏰ Thời gian / 📌 Nội dung / 📝 Hướng dẫn / ⚠️ Lưu ý / 📅 Gia sư` (helper `apps/web/lib/survey-notification.ts`; không có input Title riêng — `notification_title` mirror trực tiếp từ `name` khi lưu để tránh trùng lặp với tên bài khảo sát); danh sách bài khảo sát cũng có icon sao chép nhanh. Thêm route `/staff/surveys` (mở cho `lesson_plan`, `lesson_plan_head`, `assistant`, `admin`) dùng chung component `SurveysManager` với `/admin/surveys`, để mem đội giáo án (không chỉ `lesson_plan_head`) tự tạo bài khảo sát mà không cần quyền admin đầy đủ.
- **Bài khảo sát** (thay thế "lần khảo sát N toàn cục"): bảng `Survey` (model mới trên `survey_round`, giữ nguyên data lịch sử ở row `id = "current"`) cho phép admin + `lesson_plan`/`lesson_plan_head` CRUD nhiều bài khảo sát có `startDate`/`endDate`, nội dung thông báo rich text, và danh sách lớp loại trừ (`survey_excluded_classes`). Endpoints: `GET/POST /surveys`, `GET/PATCH/DELETE /surveys/:id`, `GET /surveys/:id/missing-classes`. UI: `/admin/surveys` (CRUD + `ClassExclusionPicker`).
- **Báo cáo khảo sát theo roster học sinh**: `class_surveys` nay gắn `survey_id` (bắt buộc 1 báo cáo/lớp/bài khảo sát) và có `class_survey_student_assessments` — mỗi học sinh đang học một row với 2 field tự do **Đánh giá kiến thức** + **Nhận xét**. Form báo cáo (`ClassSurveyPanel`) đổi theo pattern roster của "Tạo buổi học" (`AddSessionPopup`) thay vì rich text đơn. Cho phép nộp trễ sau `endDate`.
- **Cảnh báo gia sư (modal per-login)**: `SurveyReminderGate` mount ở `apps/web/app/staff/layout.tsx`, hiện mỗi lần gia sư truy cập `/staff` — một card/lớp liệt kê các Bài khảo sát đang mở (`startDate <= hôm nay`) mà lớp đó còn thiếu báo cáo, có nút "Báo cáo ngay" (link tới tab Khảo sát của lớp) và "Để sau" (dismiss theo session qua `sessionStorage`). Nguồn dữ liệu: `GET /survey-warnings/my-warnings`.
- **Cảnh báo (bỏ qua được) khi thanh toán nhân sự còn báo cáo khảo sát quá hạn:** `StaffService.guardOverdueSurveyReports` chạy đầu `payAllPayments`/`paySelectedPayments`/`payDepositSessions` — nếu nhân sự còn lớp `running` thiếu báo cáo cho bài khảo sát đã quá hạn (`endDate < hôm nay`) và chưa gửi `confirmOverdueSurveyReports: true`, backend trả `400` với `code: SURVEY_OVERDUE_WARNING` kèm chi tiết `warnings`. FE trên `/admin/staffs/:id` (và mirror `/staff/staffs/:id`) hiển thị dialog cảnh báo liệt kê từng bài khảo sát + lớp còn thiếu, kế toán chọn "Hủy" hoặc **"Bỏ qua, vẫn thanh toán"** (retry với `confirmOverdueSurveyReports: true`) — không còn chặn cứng như trước, kế toán chủ động quyết định. Check độc lập với dismissal của banner kế toán chi.
- **Cảnh báo gia sư — bắt buộc hiển thị lại mỗi lượt truy cập nếu có báo cáo quá hạn:** nếu trong danh sách cảnh báo có ít nhất 1 bài khảo sát đã quá hạn (`endDate < hôm nay`), `SurveyReminderGate` không còn dùng `sessionStorage` để ghi nhớ dismiss — "Để sau" chỉ ẩn tạm bằng React state (không persist), nên dialog sẽ hiện lại ngay từ lượt truy cập kế tiếp (tải lại trang/mở tab mới) cho tới khi báo cáo xong; badge **"Quá hạn"** (đỏ) đánh dấu từng bài khảo sát quá hạn trong danh sách, header/description đổi màu + copy cảnh báo khi có bài quá hạn. Nếu không có bài quá hạn, hành vi dismiss theo session (`sessionStorage`) giữ như trước.
- **Cảnh báo kế toán chi (`accountant_expense`)**: `AccountantSurveyWarningBanner` trên `/staff` dashboard liệt kê gia sư còn thiếu báo cáo cho Bài khảo sát đã **quá hạn** (`endDate < hôm nay`). "Đóng" chỉ ẩn tạm trong session; "Đóng và không hiển thị lại" gọi `POST /survey-warnings/accountant-warnings/dismiss` lưu vĩnh viễn vào `survey_warning_dismissals`. Nguồn dữ liệu: `GET /survey-warnings/accountant-warnings`.
- **`UpgradedSelect` — hỗ trợ search:** thêm prop `searchable` (+ `noResultsLabel`, option `searchLabel`) biến chính trigger thành 1 ô input gõ để lọc (không phải ô tìm kiếm phụ trong menu) — click/focus vào là gõ tìm ngay, chọn xong ô input hiển thị lại tên đã chọn; lọc option theo text không phân biệt hoa/thường và dấu tiếng Việt. Áp dụng cho dropdown "Bài khảo sát" trong form tạo/sửa báo cáo khảo sát lớp (`ClassSurveyPanel`, dùng chung `/admin/classes/:id` và `/staff/classes/:id`).
- `GET /survey-warnings/open-surveys`: danh sách Bài khảo sát đã mở, dùng cho picker khi gia sư tạo báo cáo khảo sát lớp.
- `GET /student/landing-achievements?includeUnpublished=true`: bỏ qua `sourceIds`/publish gate, trả thành tích TOÀN BỘ học sinh — dùng cho trang `/thanh-tich` list-theo-level. Mặc định (không set flag) giữ nguyên hành vi cũ: bắt buộc `sourceIds`, thiếu → trả rỗng (no roster leak), dùng cho khu "Tự Hào Unicorns". Docs `docs/api/landing-integration.md`.

### Added

- **CSKH — thẻ tóm tắt Đang học / Nghỉ trong tháng / Doanh thu tháng ở tab Học sinh:** `GET /customer-care/staff/:staffId/summary?month=YYYY-MM` (`CustomerCareService.getStudentSummaryByStaffId`) trả `{ monthKey, activeStudentsCount, droppedStudentsThisMonth, revenueThisMonth }` tính trên toàn bộ portfolio CSKH của staff (không giới hạn theo trang danh sách); FE (`CustomerCareDetailPanels`, dùng chung `/admin/customer_care_detail/[staffId]` và `/staff/customer-care-detail`) hiện 3 thẻ ngay đầu tab **Học sinh**.

### Fixed

- **Quản lý User (Admin & Trợ lí) — Khắc phục triệt để lỗi điều chỉnh Email Verified "lúc được lúc không":**
  - **Sửa lỗi Race condition & form overwrite trong `UserManageModal`:** Trước đây `useEffect` lắng nghe `user` và toàn bộ trường dữ liệu của user để gọi `setForm`. Khi mở modal, nếu dữ liệu đã có trong cache nhưng `refetchOnMount: "always"` gọi ngầm server để lấy dữ liệu mới, request ngầm trả về sẽ tự động reset form về giá trị cũ trên server, xóa mất tick chọn của người dùng nếu mạng chậm hoặc thao tác nhanh. Đã sửa lại cơ chế khởi tạo bằng `initializedUserIdRef` chỉ đồng bộ khi đổi sang ID user khác, tránh ghi đè dữ liệu đang nhập.
  - **Sửa lỗi đóng modal trước khi lưu hoàn thành:** Trước đây `handleSave` gọi `onClose()` ngay lập tức rồi mới chạy lưu nền qua `runBackgroundSave`, khiến form bị unmount sớm, người dùng mở lại ngay sẽ thấy dữ liệu cũ hoặc mất form nếu API lưu lỗi. Nay chuyển sang dùng `updateMutation` với trạng thái `isPending`: nút chuyển thành "Đang lưu…", vô hiệu hóa thao tác trùng lặp, chỉ đóng modal và toast thành công khi API đã cập nhật xong dữ liệu; nếu thất bại sẽ giữ nguyên form và thông báo lỗi.
  - **Tự động đồng bộ trạng thái `pending` sang `active` khi xác thực email:** Trong `UserManageModal`, khi người dùng tick chọn `[x] Email đã xác thực`, nếu trạng thái tài khoản đang là `pending` (Chờ xác thực) thì hệ thống tự động đổi sang `active` (Đang hoạt động) để tránh nhầm lẫn giữa 2 trường dữ liệu.
  - **Bổ sung badge trạng thái Email Verified trực quan trên danh sách User:** Bổ sung badge hiển thị rõ `Đã xác thực` (màu xanh kèm icon check) hoặc `Chưa xác thực` (màu vàng) ngay bên cạnh email ở cả bảng desktop và thẻ mobile tại `/admin/users` (và `/staff/users`).
  - **Bổ sung tùy chọn `Xác thực email ngay` khi Tạo user mới:** `CreateUserDialog` bổ sung checkbox xác thực email; `AdminCreateUserDto` và `AdminCreateStudentUserDto` ở backend hỗ trợ `emailVerified: boolean`, cho phép admin/trợ lí kích hoạt tài khoản ngay khi tạo mà không bắt buộc người dùng phải kiểm tra email.
- **Video bài học — Khắc phục lỗi hiển thị Fullscreen trên iOS Safari:** Thêm cấu hình `viewportFit: "cover"` trong `apps/web/app/layout.tsx` cho phép giao diện tràn viền cạnh notch/dynamic island; tinh chỉnh padding 4 chiều (`safe-area-inset-top/bottom/left/right`) trên các thanh điều khiển; bổ sung cơ chế khóa cuộn trang nền và chặn bouncing gesture trên WebKit/iOS Safari khi xem toàn màn hình; chuẩn hóa tỷ lệ khung hình và kích thước `-webkit-fill-available` trong `YouTubeEmbed`.
- **Chi tiết buổi học học sinh — Tự động xuống dòng link & văn bản dài trong card Hướng dẫn tự học / Tutorial:** Thêm class `break-words`, `[overflow-wrap:anywhere]` và `[&_a]:break-all` vào `MathContent` và các card chi tiết buổi học trong `StudentSessionDetailDialog` để liên kết dài hoặc văn bản không khoảng trắng tự động xuống dòng, không tràn ra ngoài giao diện.
- **`PATCH /class/:id/schedule` (+ mirror `staff-ops`) — chống lost-update khi 2 người sửa lịch cố định gần như đồng thời:** phát hiện qua debug production (lớp `UNICL-c1f789b32e`) — payload cũ dùng semantics "full-replace" (slot active vắng mặt trong `schedule` gửi lên bị coi là đã xoá), nên 2 request cận thời điểm với snapshot cũ khác nhau có thể tự xoá nhầm slot của nhau. Đổi sang **upsert**: slot vắng mặt trong payload nhưng không nằm trong `removedEntryIds` (field mới) được **giữ nguyên**; chỉ id liệt kê tường minh trong `removedEntryIds` mới bị soft-delete. Thêm optimistic lock qua `expectedUpdatedAt` (so với `Class.updatedAt`, lệch → `409 Conflict`) + `updateMany` có điều kiện ở tầng DB + khoá in-memory theo `classId` trong `ClassService` (mirror pattern khoá sẵn có ở `SessionCreateService`). Gia sư tự sửa lịch qua `staff-ops` giờ bị giới hạn chỉ được động tới slot có `teacherId` là chính họ (cả upsert lẫn `removedEntryIds`), vi phạm trả `403`. Đổi `UpdateClassScheduleDto`/`ClassScheduleItem` payload cả FE lẫn BE; `EditClassSchedulePopup` gửi kèm `removedEntryIds` diff được + `expectedUpdatedAt`, refetch class khi gặp `409`.
- **CSKH — ẩn học sinh đã nghỉ khỏi tab Học sinh:** `CustomerCareService.getStudentsByStaffId` (`GET /customer-care/staff/:staffId/students`) trước đây trả cả học sinh `status = inactive` (đã chuyển **Nghỉ học**) vì chỉ lọc theo `staffId`, không lọc theo trạng thái học sinh, dù bản ghi `customer_care_service` không tự xoá khi học sinh nghỉ. Nay thêm điều kiện `student.status = active` vào cả `count` lẫn `findMany` (dùng chung where object để `total`/phân trang khớp danh sách), áp dụng cho cả `/admin/customer_care_detail/[staffId]` và `/staff/customer-care-detail`.
- `GET /staff/landing-profiles` và `GET /student/landing-profiles`: chế độ `ids=` trước đây ép `skip=0` và giới hạn cứng `take = min(ids.length, 100)`, bỏ qua `page`/`limit` client truyền vào — nếu CMS gửi hơn 100 id thì phần vượt quá bị cắt âm thầm, không cách nào lấy tiếp bằng phân trang. Nay `ids=` dùng chung `skip`/`take` theo `page`/`limit` như chế độ search, CMS loop `page` bình thường để lấy hết roster đã publish. Docs `docs/api/landing-integration.md`.
- **Báo cáo khảo sát lớp — sao chép nội dung để dán Zalo:** `ClassSurveyPanel` (dùng chung `/admin/classes/:id` và `/staff/classes/:id`) thêm nút sao chép (icon ở danh sách card mobile/bảng desktop; nút "Sao chép để dán Zalo" ở footer dialog xem chi tiết **và** footer form tạo/sửa báo cáo — copy trực tiếp từ nội dung đang nhập trong form, không cần lưu trước) dựng message dạng `📢 BÁO CÁO KHẢO SÁT / 🏫 Lớp / 📋 Bài khảo sát / 📅 Ngày báo cáo / 👨‍🏫 Người phụ trách / 📌 Đánh giá kiến thức / 📝 Nhận xét học sinh` (helper `buildClassSurveyReportZaloMessage` trong `apps/web/lib/survey-notification.ts`, tái dùng `copyTextToClipboard` đã có). Nút ở danh sách/dialog xem hoạt động độc lập với quyền `canManage`/`canViewDetails` — ai xem được danh sách báo cáo cũng sao chép được.
- **Báo cáo khảo sát lớp — "Đánh giá kiến thức" đổi từ theo-từng-học-sinh thành 1 field dùng chung cho cả báo cáo:** roster `class_survey_student_assessments` trước đây có 2 field tự do mỗi học sinh (Đánh giá kiến thức + Nhận xét) là sai nghiệp vụ — đánh giá kiến thức là nhận định chung của gia sư cho cả lớp/bài khảo sát, không phải riêng từng học sinh. Chuyển field `knowledge_assessment` lên `class_surveys` (dùng chung cho cả báo cáo); `class_survey_student_assessments` giờ chỉ còn `comment` (nhận xét riêng từng học sinh). Migration `20260816123000_survey_knowledge_assessment_per_report` backfill toàn bộ `content` (nội dung báo cáo dạng cũ, trước khi đổi sang roster) vào `knowledge_assessment` mới để không mất dữ liệu các báo cáo đã tạo trước đây. `ClassSurveyPanel` (form tạo/sửa + dialog xem chi tiết, dùng chung cho `/admin/classes/:id` và `/staff/classes/:id`) cập nhật theo: 1 textarea "Đánh giá kiến thức" chung + roster chỉ còn field "Nhận xét" mỗi học sinh.

### Changed

- **Phân quyền Thành tích/Gallery: tách rõ quyền xem và quyền sửa.** Quyền **xem** (`GET`) khớp đúng với quyền xem hồ sơ tương ứng: `GET /staff/:staffId/achievements` mở thêm cho `accountant_expense` (khớp `GET /staff/:id`); `GET /student/:studentId/achievements` và `GET /student/:studentId/gallery` mở thêm cho `accountant`, `accountant_income` (khớp `GET /student/:id`), giữ nguyên `customer_care`. Quyền **sửa/xoá/upload ảnh/reorder** thu hẹp lại: chỉ admin đầy đủ, `staff.admin`, và `assistant` — bỏ `customer_care` khỏi quyền sửa thành tích/gallery học sinh (trước đây `customer_care` sửa được, nay chỉ xem). FE cập nhật theo: `apps/web/app/admin/students/[id]/page.tsx` và `EditStudentPopup` dùng `canManageStudent` (admin/assistant, prop mới `canEditAchievementsAndGallery`) thay vì `canEditStudentProfile` cho 2 khối Thành tích/Gallery; `apps/web/app/admin/staffs/[id]/page.tsx` truyền `allowAchievementEdit={(isAdmin || isAssistant) && !viewingOwnStaffRecordOnStaffShell}` cho `StaffIdentityOverview` để tránh fallback theo `allowQrEdit`. Nhân sự tự sửa thành tích của chính mình (`users/me/achievements`) không đổi.
- `GET /student/landing-profiles?search=`: tokenized AND trên `fullName` (giống staff name tokens; `"Le A"` khớp `"Le Van A"`). Docs `docs/api/landing-integration.md`.
- Landing integration **live-read**: CMS chỉ giữ publish gates (`sourceId`); public `/thanh-tich` + people surfaces đọc EduWeb5 qua `landing-achievements` / `landing-profiles?ids=`. Docs `docs/api/landing-integration.md`.
- Landing profiles: `GET /staff/landing-profiles` **không lọc** `status`/`role` (trả toàn bộ staff); `GET /student/landing-profiles` **không lọc** `status` (active + inactive, phục vụ thành tích / học sinh tiêu biểu cựu học viên). Bỏ query `role`/`status` khỏi DTO + docs `docs/api/landing-integration.md`.

### Removed

- Gỡ `apps/api/scripts/import-honor-roll-achievements.ts` khỏi repo (Nest `build` compile scripts và fail CI với TS18048); ops import chạy local ngoài image nếu cần.

### Added

- Landing profiles response thêm `status` (`active` \| `inactive`) cho staff + student — endpoint vẫn **không lọc** status (đủ cả học sinh/gia sư đã nghỉ). Docs `docs/api/landing-integration.md`.
- `GET /student/landing-achievements` (ApiKeyGuard): query `sourceIds` (comma-separated; empty → empty page), `level`, `page`, `limit` (default 9). Response flat achievements + nested student identity. `landing-profiles` thêm `ids=` hydrate. Docs `docs/api/landing-integration.md`.
- Landing profiles pagination: `GET /staff/landing-profiles` và `GET /student/landing-profiles` thêm query `page` (1-based) + document `search`; student `limit` max hạ xuống 100 (default 50). `total` = full filtered count; CMS phải loop pages trước khi archive. Docs `docs/api/landing-integration.md`.
- BE/FE **Student achievement structured fields** (landing `/thanh-tich` parity): `student_achievements` thay `title` bằng `award`/`exam`/`year`/`level`/`course_label` + enum `AchievementLevel`; CRUD/FE editor học sinh form đầy đủ field; `GET /student/landing-profiles` trả structured + derived `title`; script import từ folder `THÀNH TÍCH`; CMS landing sync vào `FeaturedStudent`+`Achievement` (SoT = EduWeb5).
- FE/BE **Student gallery** (landing): bảng `student_gallery_items` (`image_path` / `image_watermarked_path` + `sort_order`; cột `caption` unused); bucket `student-gallery` / `student-gallery-public`; API `/student/:id/gallery`; landing `GET /student/landing-profiles` thêm `gallery[]` (watermarked public only). FE `StudentGalleryEditor` (ảnh only — **multi-select** thêm nhiều ảnh 1 lần / đổi / xoá / reorder) trên student detail + `EditStudentPopup`. ADR `docs/adr/2026-08-11-student-gallery-watermarked.md`.
- Admin **upload avatar học sinh** qua linked user: `POST/DELETE /student/:id/avatar` (bake twin như `/users/me/avatar`); `GET /student/:id` trả `avatarUrl`/`avatarPath`; UI avatar trên `/admin/students/[id]`.
- FE/BE **ảnh watermarked public cho landing** (ADR `2026-08-11-landing-watermarked-public-images`): cột `avatar_watermarked_path` / `image_watermarked_path`; bake diagonal-tile ("HỌC TIN cùng CHUYÊN TIN") lúc upload avatar + ảnh minh chứng; bucket public `avatars-public` / `achievements-public`; landing profiles chỉ trả twin public + **avatar học viên** parity; script `scripts/backfill-watermarked-images.ts`.
- ADR **Landing watermarked public images** (`docs/adr/2026-08-11-landing-watermarked-public-images.md`): bake diagonal-tile watermark twin on EduWeb5 upload; landing/CMS chỉ dùng public URL ổn định của twin; thêm avatar học viên parity trên landing; glossary `CONTEXT.md` cập nhật.
- Landing integration (`GET /staff/landing-profiles`, `GET /student/landing-profiles`): response thêm `achievements[]` (`id`, `title`, `imageUrl`/`imagePath` watermarked public, `sortOrder`). Staff vẫn trả `specialization` (deprecated) để CMS cũ không gãy; docs `docs/api/landing-integration.md` cập nhật contract + hướng dẫn sync minh chứng.
- FE/BE **Thành tích** (Staff + Student): bảng `staff_achievements` / `student_achievements` (title + 1 `image_path` + `sort_order`), bucket Supabase `achievements`, API CRUD/reorder/upload ảnh (`/staff/:id/achievements`, `/student/:id/achievements`, `/users/me/achievements`). FE `AchievementListEditor` (@dnd-kit + Lucide icon buttons) mặc định **readonly**, icon **Chỉnh sửa** cạnh heading; bấm mới mở reorder/đổi tên/ảnh/thêm-xoá; nút **Tải ảnh** luôn hiện khi có `imageUrl` (readonly + edit); bấm thumbnail mở `ImageLightbox` fullscreen; gắn `EditStaffPopup` / `StaffSelfEditPopup` / `StaffIdentityOverview` / `EditStudentPopup` / student detail. Gate `staffProfileComplete` bỏ `personalAchievementLink` + `specialization`. Migration backfill `specialization` **tách theo bullet/dòng** (`-`/`*`/`•`, hoặc mỗi dòng nếu không có bullet; bỏ header kiểu `Thành tích:`); cột legacy giữ deprecated.
- FE/BE `/admin/dashboard/statistics`: nút **Xuất PDF** gọi `GET /dashboard/monthly-statistics/pdf` (cùng khoảng tháng đang chọn), tải PDF landscape A4 gồm 3 section chart SVG + bảng (Tài chính / Chi phí theo khoản có cột Tổng / Vận hành); render server-side qua `MonthlyStatisticsExportPdfService` + `ReceiptPdfService` (hỗ trợ thêm option `landscape`).
- Bảng `lesson_plan_head_commission`: snapshot hoa hồng doanh thu Trưởng giáo án (`lesson_plan_head`) theo từng buổi học toàn hệ thống, mỗi buổi chargeable sinh 1 dòng cho mỗi nhân sự role này đang active. Đồng bộ idempotent qua `syncLessonPlanHeadCommissions()` khi tạo/sửa session.
- Nguồn `revenue_share` mới trong `GET /staff/:id/payment-preview`, `PATCH /staff/:id/payment-status/pay-all|pay-selected`: cho phép thanh toán từng dòng hoa hồng doanh thu Trưởng giáo án (không khấu trừ thuế), gộp vào popup **Thanh toán** hiện có ở `/admin/staff/:id`.
- Cột **% CSKH** trong bảng học sinh ở `admin/customer_care_detail/[staffId]` và `staff/customer-care-detail/[staffId]` (đọc `CustomerCareService.profitPercent` qua `GET /customer-care/staff/:staffId/students`).
- Inline edit % CSKH trực tiếp trên bảng học sinh (click ô % → input → Enter/blur lưu qua `PATCH /student/:id`); chỉ admin sửa được, CSKH/assistant chỉ xem.
- Bulk edit % CSKH: checkbox chọn nhiều học sinh trong bảng + action bar ghi đè 1 giá trị % duy nhất qua `PATCH /customer-care/staff/:staffId/profit-percent/bulk` (chỉ admin, scoped theo `staffId`).
- KPI card **Biến động học sinh** (`+X / -Y`) trên `admin/dashboard`: `summary.newStudentsThisMonth`/`droppedStudentsThisMonth` đếm toàn hệ thống theo `createdAt`/`dropOutDate` trong kỳ đang chọn (`GET /dashboard`), cập nhật theo month navigator.
- Gộp KPI card **Biến động học sinh** vào card **Học sinh** trên `admin/dashboard` (bớt 1 card, note hiện `+X mới / -Y nghỉ trong kỳ`); bấm vào card mở popup drill-down 3 tab **Học sinh mới**/**Học sinh nghỉ**/**Học sinh hiện tại** liệt kê tên, lớp, ngày vào học/nghỉ (tab hiện tại chỉ tên + lớp, snapshot) qua endpoint mới `GET /dashboard/student-churn-details?type=new|dropped|active&month=&year=`.
- KPI **HS mới tháng này** / **HS nghỉ tháng này** trên dashboard CSKH ở `/staff` (khối **Tổng hợp CSKH** của trợ lí và khối tổng hợp của CSKH) giờ bấm được, mở popup liệt kê tên học sinh + lớp + ngày mới/nghỉ qua endpoint mới `GET /users/me/staff-dashboard/customer-care-student-changes?month=&year=&type=new|dropped&scope=own|managed`.
- Trang **Thống kê theo tháng** (`/admin/dashboard/statistics`), link từ `admin/dashboard` (nút "Thống kê theo tháng"), không có mục sidebar riêng. Chọn khoảng tháng bất kỳ (2 cặp Tháng/Năm bắt đầu-kết thúc, tối đa 36 tháng, mặc định 12 tháng gần nhất) qua endpoint mới `GET /dashboard/monthly-statistics?fromMonth=&fromYear=&toMonth=&toYear=`. Hiển thị 2 chart (tài chính: cột doanh thu/chi phí + đường lợi nhuận; vận hành: cột học sinh/lớp/gia sư) và 1 bảng dữ liệu chi tiết theo từng tháng. Số học sinh là số active thật tại cuối tháng (`created_at`/`drop_out_date`); số lớp/gia sư là proxy số lớp/gia sư có buổi học trong tháng (DB không lưu lịch sử đóng/nghỉ lớp và gia sư nên dùng proxy). Chi phí hiển thị 1 số tổng (nhân sự + vận hành), không breakdown theo loại.
- Chart **Chi phí theo từng khoản** (multi-line, 8 series: dạy/CSKH/giáo án/bonus/trợ cấp khác/trợ lí/QL lớp/vận hành) trên `/admin/dashboard/statistics`, chèn giữa 2 chart hiện có. `AdminDashboardMonthlyStatisticDto`/`GET /dashboard/monthly-statistics` trả thêm 8 field breakdown chi phí (dữ liệu vốn đã tính trong SQL, trước đây chỉ gộp vào `expense`). Thêm token màu categorical `--ue-viz-1..8` (light/dark) vào `globals.css` theo palette đã validate của skill `dataviz`.
- Cột **Chi phí** trong bảng dữ liệu chi tiết ở `/admin/dashboard/statistics` giờ bấm được: mở modal 2 tab **Nhân sự** / **Khác** cho đúng tháng, gọi lại `GET /dashboard/financial-detail?rowKey=personnel-cost|other-cost`. Tách `FinancialDetailModal` (trước đây định nghĩa cục bộ trong `admin/dashboard/page.tsx`) thành component dùng chung `apps/web/components/admin/dashboard/FinancialDetailModal.tsx`, hỗ trợ thêm chế độ `tabs` tự fetch nội bộ; dashboard chính vẫn dùng chế độ cũ (detail fetch từ ngoài) không đổi hành vi.
- Chart **Tài chính** trên `/admin/dashboard/statistics` thêm 2 đường: **Tổng nạp** (tổng tiền nạp ví trong tháng, period-filterable qua `wallet_transactions_history.type='topup'`) và **Tổng chưa thanh toán** (tổng số dư ví âm của học sinh tại thời điểm **cuối mỗi tháng**, tái dựng bằng cộng dồn lịch sử giao dịch ví theo quy ước dấu `topup=+amount`, còn lại `-amount`, không phải snapshot số dư hiện tại). `AdminDashboardMonthlyStatisticDto`/`GET /dashboard/monthly-statistics` trả thêm 2 field `totalTopup`/`totalUnpaid`, thêm 2 CTE SQL mới (`monthly_topup`, `monthly_unpaid` dựa trên window function cộng dồn theo học sinh). Bảng dữ liệu chi tiết thêm 2 cột cùng tên; cột **Tổng nạp** bấm được (mở `FinancialDetailModal` không-tab, `rowKey=topup`, tái dùng nguyên endpoint/UI sẵn có ở dashboard chính), cột **Tổng chưa thanh toán** chỉ hiển thị số.

### Changed

- FE `/admin/lesson_plan_detail/[staffId]` (và staff shim): với role `lesson_plan_head` tách **2 tab** — **Hoa hồng doanh thu** (mặc định) và **Bài giáo án**; nhân sự chỉ `lesson_plan` giữ layout một khối bài giáo án (không hiện section hoa hồng).
- Quyền chỉnh % CSKH (inline trên bảng chi tiết CSKH, bulk `PATCH .../profit-percent/bulk`, và ô trong popup **Chỉnh sửa hồ sơ học sinh`): chỉ còn **admin** (gỡ quyền `assistant`); FE/BE/docs đồng bộ.
- FE `/admin/lesson_plan_detail`: ghi chú hoa hồng doanh thu làm rõ card **Tỷ lệ %** = mức đang cấu hình (áp buổi mới), còn **Số tiền thực nhận** = tổng snapshot `lesson_plan_head_commission` trong tháng — không còn copy sai kiểu “tháng quá khứ tính theo % hiện tại”.
- FE `/admin/dashboard` và `/admin/dashboard/statistics`: xuất PDF/Excel dùng `useMutation` (TanStack Query) thay cho `useState` + gọi API thủ công.
- FE popup **Biến động học sinh** trên `admin/dashboard`: dual layout card (mobile) + table (desktop) trong cùng nhánh dữ liệu, khớp pattern `FinancialDetailModal`.

- FE/BE `/admin/dashboard/statistics`: ngay dưới mỗi bảng chi tiết tháng thêm khối **Giải thích chỉ số** bằng tiếng Việt dễ hiểu (không dùng thuật ngữ kỹ thuật); cột/series **Bonus** đổi nhãn thành **Thưởng**; PDF xuất và script DOCX one-off cũng kèm cùng nội dung giải thích.
- FE `/admin/dashboard/statistics`: bảng **Chi phí theo từng khoản** thêm cột **Tổng** (= `expense` cùng tháng, bấm được mở chi tiết Nhân sự/Khác).
- FE `/admin/dashboard/statistics`: tách bảng dữ liệu chi tiết chung thành 3 bảng riêng, mỗi bảng nằm ngay dưới chart tương ứng (Tài chính: Doanh thu/Chi phí/Lợi nhuận/Tổng nạp; Chi phí theo khoản: 8 cột breakdown; Vận hành: Học sinh/Lớp/Gia sư).
- `GET /staff/:id/revenue-share`: `amount` đổi từ tính live (`doanh thu × %`) sang tổng `lesson_plan_head_commission.amount` snapshot theo tháng, đồng bộ với payload thanh toán.
- FE popup **Thông tin lớp**: chọn trạng thái **Đã kết thúc** dùng cùng logic `POST /class/:id/end` (eligibility + confirm/lý do); BE `PATCH /class/:id/basic-info` từ chối `running → ended` (phải dùng `POST /end`).

### Removed

- FE `/admin/dashboard/statistics`: bỏ đường **Tổng chưa thanh toán** khỏi chart Tài chính và bỏ cột cùng tên khỏi bảng dữ liệu chi tiết (API vẫn trả `totalUnpaid`, chỉ không hiển thị).

### Fixed

- BE watermark bake: giảm opacity tile logo (`WATERMARK_ALPHA` → 0.05) để mark rất mờ trên twin public. Twin đã bake cần clear path + chạy lại backfill để cập nhật.
- Docs/ops: script backfill watermark chạy bằng `pnpm dlx tsx scripts/backfill-watermarked-images.ts` (tránh `ts-node` lỗi resolve Prisma 7 generated client).
- CD API image: chuyển `sharp` từ `devDependencies` → `dependencies` để `pnpm deploy --prod` giữ package trong image — tránh crash-loop `Cannot find module 'sharp'` khi boot Nest (watermark bake) sau deploy.
- BE watermark bake: thay asset `watermark-logo.jpg` (nền gạch) bằng `watermark-logo.webp` (logo trong suốt); bỏ luma-key nền tối để không ăn mất viền chữ đen của mark "HỌC TIN cùng CHUYÊN TIN".
- BE Google Calendar schedule resync: khi ghi lại `Class.schedule` sau sync/resync không còn strip `createdAt`/`deletedAt` hay xoá slot soft-deleted. Slot active thiếu `createdAt` (data cũ) được backfill từ `Class.updatedAt` lúc resync hoặc lúc đọc **Cảnh báo chưa dạy**, tránh cảnh báo giờ lịch mới trên ngày quá khứ sau khi đổi lịch cố định.

- FE form sửa buổi học (`SessionHistoryTable`): badge trợ cấp **Đã chỉnh tay** không còn false positive khi mở buổi unpaid vừa tạo — seed điểm danh từ `session.attendance` trước khi merge roster lớp, và chỉ suy luận override sau khi `attendanceLoading` (và cấu hình lớp live nếu cần) xong. Create admin/staff vẫn không ghi flag chỉnh tay (không có cột DB); badge chỉ là suy luận FE.
- FE `TimeInput` portal chọn giờ/phút: `z-[120]` (khớp `UpgradedSelect`) để không bị che bởi popup form lịch dạy bù / modal `z-[110]`.
- BE `GET /staff/:id/income-summary` card **Lớp phụ trách** (`classMonthlySummaries`): không còn seed mọi row `class_teachers` (kể cả `inactive`) thành dòng 0đ; chỉ luôn hiện phân công hiện tại (`status` null/`active`); lớp nghỉ dạy chỉ hiện khi tháng đang chọn còn trợ cấp và/hoặc còn `unpaid`/`pending`, với `isCurrentTeacherAssignment=false` (badge **NGHỈ DẠY**).
- BE `GET /staff` (list `/admin/staffs` cột **Lớp**): `classTeachers` chỉ gồm phân công hiện tại hoặc lớp nghỉ dạy còn trợ cấp tháng hiện tại / còn `unpaid`/`pending` — cùng rule ẩn lớp nghỉ 0đ với card **Lớp phụ trách**.

- Auth login/OAuth: sau đăng nhập redirect thẳng tới workspace/dashboard (`/auth/post-login` cho Google OAuth; login password bootstrap session an toàn hơn, bỏ fallback `canAccessRestrictedRoutes=false` gây kẹt homepage).

- **Trợ cấp gia sư theo lớp:** `PATCH /class/:id/teachers` và popup trợ cấp không còn materialize `allowance_per_session_per_student` vào `class_teachers.custom_allowance` khi ô trống; omit preserve, `null` = kế thừa mặc định lớp. Migration repair các row `custom_allowance` trùng default lớp → `NULL`.

### Added

- FE/BE trang chi tiết lớp: cột **Người chăm sóc** trên danh sách học sinh đang học (`customerCareStaff` từ `GET /class/:id` / staff-ops mirror; chỉ họ tên; chưa gán → `—`). Link tới chi tiết CSKH cho admin / trợ lí / kế toán chi; CSKH thuần chỉ self-link; role khác chữ thường.

### Added

- BE/FE trợ cấp quản lý lớp (QLL): `GET /training-manager/staff/:staffId/classes/:classId/session-allowances?month=` trả chi tiết buổi (học phí buổi, % snapshot, trợ cấp, trạng thái); tab **Lớp học** trên `/admin/training_detail` và `/staff/training-detail` mở rộng từng lớp (pattern tab Hoa hồng CSKH), bulk `PATCH .../payment-status/bulk` cho admin/assistant/kế toán.

### Fixed

- BE dashboard popup **Trợ cấp chờ thanh toán**: thẻ **Trợ cấp quản lý lớp chưa thanh toán** hiển thị đúng tổng (`totalTrainingManagerAmount` được SELECT từ aggregate unpaid staff).

- BE dashboard cảnh báo **Sắp hết tiền** (`getExpiringStudents`, admin dashboard + khối **Cảnh báo** trợ lí): chỉ còn học sinh đang học (active + membership active trên lớp `running`); học sinh nghỉ hoặc chỉ còn lớp đã kết thúc với số dư `>= 0` không còn hiện; số dư âm vẫn qua nhóm **Chưa thu**.

### Changed

- BE/FE staff profile gate: `staffProfileComplete` bắt buộc `users.avatar_path` và `staff_info.personal_achievement_link` (cùng bộ field hồ sơ staff hiện có + data-consent). Staff vận hành thiếu hai field này bị redirect `/user-profile?profile_required=1`; admin full vẫn bypass. DB giữ nullable; form admin tạo/sửa không ép submit. FE `/user-profile` + `StaffSelfEditPopup` cập nhật bộ đếm, missing items và label (bỏ “tùy chọn”).

### Added

- BE/FE session form: thêm field bắt buộc **Tutorial các buổi học** (`sessions.tutorial`, rich text) trên form tạo/sửa buổi học trong lớp (`AddSessionPopup`, `SessionHistoryTable`); validate FE + BE; template **Copy nhận xét** Zalo mở rộng mục `5️⃣ Tutorial các buổi học` sau BTVN; preview cột Nhận xét đồng bộ template mới. Migration `20260710100000_add_session_tutorial`. tab Hoa hồng hybrid (pending all-time + commission theo tháng); heading Học sinh/Thanh Toán có tổng; module `training-manager` (gán QLL + %, managed-classes, payroll session-level); card **Gia sư & Quản lý**; tab **Lớp học** trên training detail; calendar/dashboard training chỉ lớp được gán; redaction finance cho training manager view. [`deploy/instances.json`](../deploy/instances.json), compose tham số `COMPOSE_PROJECT_NAME` / `NGINX_PUBLISH`, deploy scripts, **một** web image (`NEXT_PUBLIC_BACKEND_URL=/api`, `apps/web/lib/api-base-url.ts`), runbook [`docs/ops/vps-multi-instance-runbook.md`](ops/vps-multi-instance-runbook.md).
- **CD instance JP (Tiếng Nhật):** `/root/UnicornsEduJP`, `unicorns-jp`, Nginx `127.0.0.1:8081`, mẫu [`.env.production.jp.example`](../.env.production.jp.example); bật `"enabled": true` — CD deploy tuần tự IT → ENG → JP.
- FE avatar UX: popup xem ảnh đại diện full-size (kèm nút **Tải ảnh**) trên `/user-profile`, `/admin/staffs/:id`, `/staff/profile` và mirror `/staff/staffs/:id`; danh sách `/admin/staffs` (và mirror `/staff/staffs`) hiển thị avatar nhân sự — bấm avatar mở trang hồ sơ chi tiết.
- FE extra-allowance role detail (`/admin/*_detail`, `/staff/*-detail`): tab **Trợ cấp** có `MonthNav` lọc theo tháng; TanStack Query truyền `year` + `month` vào `GET /extra-allowance` / `GET /users/me/staff-extra-allowances`; popup **Thêm trợ cấp** pre-fill tháng đang xem; khi đổi tháng giữ shell (header + MonthNav) và hiển thị skeleton summary/list qua `isFetching`.
- FE `apps/web`: script `pnpm --filter web test` (Vitest) + unit tests cho `session-comment-zalo.helpers.ts`.
- BE: bảng single-row `survey_round` (`current_round`, seed = 6) + `SurveyRoundService` quản lý **lần khảo sát hiện tại** toàn cục; `SurveysController` strict-admin (`GET /surveys/round`, `GET /surveys/missing-classes`, `PATCH /surveys/round`) với Swagger đầy đủ, audit `action_history` entity `survey_round`.
- FE: trang admin-only `/admin/surveys` (Khảo sát) — header KPI lần khảo sát + ô **Đặt lần khảo sát** (nhập trực tiếp số N), danh sách lớp `running` chưa báo cáo lần N (track-only, link `/admin/classes/:id`), TanStack Query + Sonner, mobile-first; thêm mục sidebar **Khảo sát** (adminOnly) và `/admin/surveys` vào `STRICT_ADMIN_ROUTE_PREFIXES`.

### Changed

- FE/BE CSKH: cho phép `staff.customer_care` chỉnh hồ sơ học sinh được giao (`PATCH /student/:id`, status, exam-schedules) trên `/staff/students/[id]`; khóa ô **Tỷ lệ lợi nhuận (%)** và BE trả 403 nếu CSKH gửi `customer_care_profit_percent`. Vẫn khóa danh sách lớp / gói học phí / chỉnh số dư ví.
- FE session form (`AddSessionPopup`, `SessionHistoryTable` / `session-form-ui`): trợ cấp nhập tay = **gross trước CPVH/thuế**; override giữ khi đổi điểm danh; **Xóa chỉnh tay** bỏ override; lưu cùng nút submit form (bỏ nút ✓ lưu riêng trên card); khóa chỉnh khi **Dạy thử**, buổi `paid`/`deposit`, hoặc read-only; form tạo cũng hỗ trợ override cho `canEditAllowance`. Helpers `grossAllowanceToRawBaseVnd` / `rawBaseToGrossAllowanceVnd`. Docs: `CONTEXT.md`, `docs/pages/admin.md`.
- FE session form: dialog **Thay đổi chưa được lưu** khi đóng form tạo/sửa buổi (X / Hủy / backdrop / Escape) còn field khác snapshot lúc mở; nút **Ở lại** / **Bỏ thay đổi**; chặn đóng khi form tạo đang submit. Component `SessionUnsavedChangesDialog`, helper `session-form-dirty.helpers.ts`.
- **CD deploy:** `scripts/gha-deploy-instance-remote.sh` tự chạy `prisma migrate deploy` sau pull API image; chỉ bước migrate tạm swap `DATABASE_URL` → `DIRECT_URL` (app runtime vẫn dùng PgBouncer qua `PrismaService`). Thêm `DIRECT_URL` vào env examples. Docs: `docs/Cách làm việc.md`, `docs/Database Schema.md`, `docs/ops/`, `AGENTS.md`.
- **BE class `PATCH /class/:id/basic-info`:** đổi `allowance_per_session_per_student` chỉ cập nhật mặc định trên `classes`; không còn `updateMany` ghi đè `class_teachers.custom_allowance` của từng gia sư (fix revert trợ cấp riêng khi sửa thông tin lớp).
- **FE/CD:** IT + ENG dùng chung `unicorns-web:latest`; client API same-origin `/api`; server dùng `INTERNAL_API_URL` / `BACKEND_URL` runtime.
- **CD deploy:** job `deploy` timeout SSH 45m → 60m; Nginx bind `127.0.0.1` qua `NGINX_PUBLISH`; deploy tuần tự multi-instance.

### Fixed

- FE `RichTextEditor` (nhận xét HS / nội dung bài học / BTVN / tutorial): khi focus ô trống, caret không còn nhảy cuối dòng đầu của placeholder — thêm `before:h-0` theo CSS TipTap Placeholder (`float` + `height: 0`); bỏ `data-placeholder` thừa trên editor root (TipTap gắn trên node trống).
- FE popup nạp ví (`StudentBalancePopup` / `/admin/students/[id]`): tab **Nạp thẳng** của admin không còn mất tiêu đề và chữ nút xác nhận — `copyOverrides` không còn ghi đè default bằng `undefined`.
- FE `RichTextEditor` (form thêm/sửa buổi học — nội dung bài học / BTVN / tutorial / nhận xét HS): paste/autolink URL không còn bị reset caret do controlled sync chạy DOMPurify rồi `setContent` khi TipTap Link HTML lệch (`target`/`rel`); sync chỉ áp dụng value ngoài (load/reset); Link `openOnClick: false`; preview `SessionCommentPreview` style `<a>`. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`.
- CD deploy: `scripts/gha-deploy-instance-remote.sh` CRLF → LF (fix `set: pipefail: invalid option name` on VPS bash).
- CD deploy IT: tự `docker compose -p unicorns down` khi migrate sang project `unicorns-it` (tránh port 80 already allocated).
- CD deploy IT: thêm teardown project `unicornsedu` + dừng container Docker chiếm port 80/8080 trước khi start nginx. bằng cách chuyển đổi việc lưu lịch sử hoạt động (Action History) từ vòng lặp $O(N)$ query ghi log tuần tự sang chèn hàng loạt (Bulk Insert) $O(1)$ query thông qua phương thức `recordUpdates` mới trong `ActionHistoryService`, giúp loại bỏ hoàn toàn hiện tượng nghẽn cơ sở dữ liệu khi thanh toán số lượng lớn mục.
- FE/BE: Thêm xử lý chống trùng lặp (idempotency) khi click tạo buổi học nhiều lần liên tiếp. Trên FE: disable nút "Thêm buổi học" khi đang submit, hiển thị trạng thái "Đang thêm..." và hồi phục lại nút nếu có lỗi xảy ra. Trên BE: sử dụng cơ chế in-memory lock theo `classId`, `date`, `startTime` để từ chối các request tạo buổi học trùng lặp đồng thời.
- FE session history (`SessionHistoryTable`): cột/card **Nhận xét** hiển thị lại đúng sau khi form buổi học chuyển sang `lessonContent`/`homework`/nhận xét HS — fallback dựng text template Zalo khi `sessions.notes` trống; khi lưu tạo/sửa buổi học tự ghi template Zalo vào `sessions.notes` (đồng bộ với nút Copy nhận xét). Buổi cũ có `notes` HTML legacy vẫn sanitize và render rich text thay vì hiện raw tag dù đã có `lesson_content`. Template Zalo: tiêu đề `Nhận xét buổi học lớp …`, dòng `⏰ HH:mm - HH:mm` parse đúng từ `HH:mm:ss` hoặc ISO time của session (fix thiếu phút khi đọc ISO).

### Changed

- FE popup **Chỉnh sửa thông tin nhân sự** (`EditStaffPopup`) và self-edit staff (`StaffSelfEditPopup`): trường **Mô tả chuyên môn** dùng textarea kéo giãn theo phương thẳng đứng (`resize-y`, `min-h` mặc định) thay cho `resize-none`.
- FE session form: đổi tiêu đề section **Điểm danh học sinh** → **Nhận xét từng học sinh** (`AddSessionPopup`, `SessionHistoryTable`, caption bảng a11y).
- FE session form (`AddSessionPopup`, `SessionHistoryTable`): **Nhận xét từng học sinh** — từ `md+` bảng **Học sinh** (tên + quick-pick dưới tên) | **Nhận xét** | **Học phí buổi** (admin/trợ lí); gia sư chỉ 2 cột; mobile card stack cùng thứ tự.
- FE template Zalo (`session-comment-zalo.helpers`): mục `3️⃣ Nhận xét từng học sinh` liệt kê mọi HS dạng `Tên (học|nghỉ phép|vắng)`; nhận xét thụt vào với gạch đầu dòng; `excused` luôn có thêm `Vắng có phép`, `present` trống → `—`.
- FE `/admin/classes/[id]` (và mirror `/staff/classes/[id]` cho trợ lí): mở quyền quản lý roster học sinh (`canManageClassStudents`) cho `assistant` — popup **Chỉnh sửa** ở mode `roster`, nút **Nghỉ học**, thêm/xóa học sinh khớp backend `PATCH /class/:id/students`.
- BE/FE admin dashboard: thẻ cảnh báo lớp đổi sang **"Lớp chưa báo cáo lần {N}"** (tiêu đề động theo `summary.currentSurveyRound`), nguồn dữ liệu = lớp `running` thiếu `class_surveys.test_number = N` (bỏ wiring rủi ro công nợ cũ); action alert thêm trường `detail` ("Mới nhất: lần X") render thay số tiền.
- BE staff dashboard `getTeacherSection`: khối "Lớp chưa điền lịch / khảo sát" dùng lần khảo sát hiện tại N chung (semantics `test_number == N`) thay cho `max(test_number)` toàn cục.
- BE/FE session form: tối giản form tạo/sửa buổi học — thêm `sessions.lesson_content` + `sessions.homework` (bắt buộc), toggle **Dạy thử** (`coefficient=0|1`), **Điểm danh học sinh** (bảng Trạng thái | Tên | Ghi chú | Học phí), inline save trợ cấp (admin edit), nút **Copy nhận xét** format Zalo 4 phần; bỏ UI hệ số 0–1, checkbox phí vận hành, field `sessions.notes` và ô trợ cấp thủ công riêng.
- FE `/admin/classes/[id]`: mở quyền nút **Thêm buổi học** cho trợ lí (`assistant`, khớp backend); popup chỉ đóng sau khi `POST /sessions` thành công; tự chuyển tháng lịch sử nếu ngày buổi mới khác tháng đang xem.

- FE `MissedTeachingAlertsCard`: khôi phục accordion thu gọn (title `Cảnh báo chưa dạy (n)`, badge **Chưa giải trình** / **Đã giải trình · chưa bù**, mặc định đóng, mở một dòng/lần); panel mở chia 2 cột desktop (trái giải trình, phải xếp bù), mobile stack 1 cột; khi >4 cảnh báo thì list accordion scroll trong card — áp dụng `/admin/classes/[id]`, `/staff/classes/[id]`, `/admin/staffs/[id]`.
- FE session form (`AddSessionPopup`, `SessionHistoryTable`): gỡ checkbox **Tính phí vận hành**; buổi mới/cập nhật luôn snapshot % vận hành theo cấu hình lớp/gia sư (API legacy `includeTeacherOperatingDeduction` giữ cho buổi cũ).
- BE/FE `POST /class/:id/end`: chỉ cho kết thúc lớp khi mọi session `teacher_payment_status = paid`; `GET /class/:id` trả `endClassEligibility`; FE disable nút **Kết thúc lớp** + toast khi chưa đủ điều kiện (admin + assistant mirror).
- FE form **Thêm buổi bù** (`MakeupScheduleCard`): bỏ ràng buộc chọn buổi gốc từ card **Cảnh báo chưa dạy**; chỉ còn **Ngày gốc** (DateInput tuỳ chọn). Vẫn hiện textarea giải trình khi ngày gốc + gia sư khớp cảnh báo chưa dạy. BE cho phép lưu `originalDate` không kèm `baselineScheduleEntryId`.
- Auth: tắt đăng ký công khai — `POST /auth/register` trả `403`; `/auth/register` redirect login; Google OAuth không tạo user mới (email chưa có → `/auth/login?error=registration_disabled`); ẩn link Đăng ký trên Navbar/login/verify-email. Admin provisioning (`POST /users`) giữ nguyên.

### Added

- BE/FE dashboard alerts infinite scroll: thêm `GET /dashboard/action-alerts` (group `expiring|debt|payroll|class`, page/limit), `summary.classAlertCount` trên aggregate, và FE `/admin/dashboard` — mỗi card **Cảnh báo & hành động** scroll preview đầy đủ batch đã tải + nút **Xem tất cả** mở dialog full-list (`useInfiniteQuery`, 20 mục/trang).
- BE/FE giải trình vắng trước lịch bù: bảng `missed_teaching_explanations`, API `POST/PATCH` giải trình (admin + staff-ops mirror), missed-alerts trả `status` + `explanation`, guard tạo makeup có `baselineScheduleEntryId` + `originalDate`; card **Cảnh báo chưa dạy** tách **Lưu giải trình** và **Xếp lịch bù**, giữ layout textarea + lưu ở cột phải trước/sau khi lưu; `/admin/staffs/[id]` hỗ trợ thao tác đầy đủ tại chỗ.
- FE popup **Thêm buổi bù** (`MakeupScheduleCard`): khi chọn buổi gốc thuộc cảnh báo chưa dạy, hiện textarea **Lý do giải trình** bắt buộc; submit lưu giải trình rồi tạo buổi bù trong một flow, không bắt user quay sang card **Cảnh báo chưa dạy** (admin + staff class detail). Dropdown **Buổi học gốc** chỉ liệt kê các buổi từ card **Cảnh báo chưa dạy**, không còn sinh toàn bộ occurrence từ `Class.schedule`.
- FE popup **Thanh toán** trên `/admin/staffs/[id]` và mirror `/staff/staffs/[id]`: mỗi card role mặc định **thu gọn** (accordion); bấm header role để mở rộng và xem toàn bộ khoản/source bên trong.
- BE/FE assistant detail tab **Hoa hồng**: thêm module `assistant-commission` với `GET /assistant-commission/staff/:assistantStaffId/managed-customer-care`, `GET .../managed-customer-care/:customerCareStaffId/students`, `GET .../students/:studentId/session-shares`, và `PATCH .../payment-status/bulk`; FE `/admin/assistant_detail?staffId=...` và `/staff/assistant-detail` có tab **Trợ cấp** / **Hoa hồng** hiển thị CSKH được quản lý → học sinh → buổi học (phần chia 3% học phí), filter mặc định **Chưa thanh toán** hoặc **Theo tháng**, và cho phép admin/assistant/kế toán chọn từng buổi để đổi `assistant_payment_status` `pending`/`paid`.
- BE/FE thanh toán nhân sự theo khoản chọn: thêm `PATCH /staff/:id/payment-status/pay-selected` với body `{ month, year, items: [{ sourceType, id }] }`; popup **Thanh toán** trên `/admin/staffs/[id]` và mirror `/staff/staffs/[id]` có checkbox chọn từng khoản (gồm hoa hồng CSKH), nút **Thanh toán N khoản đã chọn**, và giữ shortcut **Thanh toán tất cả** qua `pay-all`.
- BE/FE customer-care detail: thêm `PATCH /customer-care/staff/:staffId/payment-status/bulk` với body `{ attendanceIds, paymentStatus }`; tab **Hoa hồng** trên `/admin/customer_care_detail/[staffId]` và mirror `/staff/customer-care-detail/[staffId]` cho phép admin/assistant/kế toán chọn từng buổi hoa hồng và đổi trạng thái `pending`/`paid` (khi paid snapshot % thuế CSKH hiện hành; khi pending reset về 0). Response `session-commissions` bổ sung `attendanceId`.

### Changed

- BE/FE dual-role `assistant` + `customer_care`: cấm `customer_care_managed_by_staff_id` trỏ về chính mình; dual-role ẩn field **Trợ lí quản lí** và backend normalize FK → `null` khi lưu; runtime/payroll loại trừ trợ cấp 3% khi `assistant_manager_staff_id = customer_care_staff_id`; session mới ghi `assistant_manager_staff_id = null` nếu resolve self-managed; dashboard trợ lí tách **CSKH của tôi** và **CSKH tôi quản lí**; helper copy dưới dòng **Trợ lí** trong **Công việc khác** khi dual-role.
- BE cảnh báo chưa dạy / lịch bù: `GET /sessions/class/:classId/missed-teaching-alerts` và `GET /sessions/staff/:staffId/missed-teaching-alerts` (cùng mirror staff-ops) chỉ trả các cảnh báo có `originalDate >= 2026-06-01`; card **Cảnh báo chưa dạy** trên trang chi tiết lớp/nhân sự tự ẩn khi không còn dòng hợp lệ.
- BE/FE customer-care tab **Hoa hồng**: bỏ giới hạn 30 ngày mặc định; thêm filter `scope=pending|month&month=YYYY-MM` cho `GET /customer-care/staff/:staffId/commissions` và `GET .../session-commissions`, trả thêm `pendingCommission`/`paidCommission`; FE `CustomerCareDetailPanels` đồng bộ UX với tab hoa hồng trợ lí (toggle **Chưa thanh toán** / **Theo tháng**, `MonthInput`, cột `Chưa thanh toán` + `Tổng hoa hồng`). Filter theo tháng hiển thị toàn bộ khoản trong tháng (cả đã thanh toán lẫn chưa thanh toán).
- FE month UX: `MonthInput` reuse `MonthNav` (nút tháng trước/sau + popup chọn tháng/năm giống trang chi tiết staff), `MonthNav` popup dùng nhãn `Tháng 1` thay `Jan/Feb`, và helper `apps/web/lib/month-format.ts` chuẩn hoá hiển thị `Tháng X/YYYY` trên dashboard, extra allowance, lesson work, hoa hồng CSKH/trợ lí.
- FE tab **Công việc** (`/admin/lesson-plans`, mirror `/staff/lesson-plans`): chip trạng thái thanh toán ở cột **Trạng thái** hiển thị thêm **người nhận** (`staffDisplayName`) bên trong pill, cùng số tiền khi `pending`.

- FE customer-care detail tab **Hoa hồng**: cho phép mở rộng đồng thời nhiều học sinh (accordion độc lập, mỗi học sinh fetch `session-commissions` riêng qua TanStack `useQueries`); chọn khoản và đổi trạng thái thanh toán vẫn hoạt động xuyên suốt các học sinh đang mở.

### Fixed

- FE session form (`AddSessionPopup`, dialog chỉnh sửa trong `SessionHistoryTable`): modal cố định giữa viewport (`SessionFormDialog` trong `session-form-ui.tsx`), khóa scroll nền; chỉ nội dung form cuộn bên trong — không còn scroll cả trang phía sau popup.
- BE cảnh báo chưa dạy: sửa so khớp `session.startTime` (`@db.Time`) dùng wall-clock từ ISO/UTC thay vì `getHours()` local — tránh false positive khi server TZ `Asia/Ho_Chi_Minh` khiến buổi đã ghi (ví dụ `01/06/2026 09:00`) vẫn hiện trong card **Cảnh báo chưa dạy**.
- FE `/admin/notification`: dedupe nhãn người nhận và dùng key theo index để tránh cảnh báo React duplicate key khi cùng một role (ví dụ `@admin`) xuất hiện ở cả `targetRoleTypes` và `targetStaffRoles`.
- FE phân quyền `accountant_expense`: mở các trang chi tiết role của nhân sự khác trên staff shell (`/staff/customer-care-detail/[staffId]`, `/staff/lesson-plan-detail/[staffId]`, `/staff/*-detail?staffId=...`) và render admin-like detail thay vì self-service khi có `staffId`.
- FE trang chi tiết học sinh/nhân sự: gỡ nút header **Nghỉ học / Mở lại** và **Ngừng hoạt động / Mở lại**; đổi trạng thái chỉ qua popup chỉnh sửa (confirm khi inactive, field lý do tùy chọn, invalidate query lớp khi đổi status học sinh). Nút **Nghỉ học** trên trang chi tiết lớp vẫn giữ nguyên.


- BE/FE staff pay-all & Công việc khác: `payment-preview` và `pay-all` giờ lấy **mọi khoản pending/unpaid mọi role và mọi tháng** (trừ cọc), không còn giới hạn tháng query cho thưởng/trợ cấp/CSKH/giáo án/trợ lí; card **Công việc khác** dùng hybrid — **Tổng nhận/Đã nhận** theo tháng MonthNav, **Chưa nhận** full-scope theo role (net, thuế hiện hành). Cập nhật copy popup, helper card, Swagger và docs admin/staff.
- FE/BE key collision & pagination sorting: Sửa lỗi trùng lặp React element keys (`UNIST-...` student IDs) trong các danh sách hiển thị phiên bản mobile và desktop tại trang Danh sách học sinh Admin, Chi tiết lớp học Admin/Staff, và màn hình Chăm sóc khách hàng (CSKH) bằng cách thêm tiền tố unique (`mobile-` và `desktop-`), đồng thời bổ sung tie-breaker `student.id ASC` vào `orderBy` của các câu truy vấn phân trang phía backend để đảm bảo thứ tự sắp xếp deterministic và không bị lặp bản ghi học sinh giữa các trang.
- FE popup nạp ví SePay (`StudentBalancePopup` trên `/student` và chi tiết học sinh admin/staff): đổi từ sao chép nội dung chuyển khoản sang **Sao chép QR** (ảnh/link), gỡ khối hiển thị `transferNote`; tái sử dụng `copyStudentWalletQrWithToast` trong `apps/web/lib/clipboard-qr.ts`.
- BE test: Sửa các unit test lỗi liên quan đến việc giữ lại lịch sử khung giờ (ClassService, StaffService) và name ordering discrepancy trong DeductionSettingsService test, đồng thời cập nhật test rbac-mutation-metadata để tương thích với các decorator RBAC mới.
- FE typecheck: Sửa lỗi kiểu dữ liệu ClassScheduleItem trên frontend (bổ sung thuộc tính optional `createdAt` và `deletedAt`) và ép kiểu result trong EditClassSchedulePopup để pass check tsc.

### Changed

- BE/FE class schedule history & makeup validation: Lưu vết lịch sử thay đổi lịch cố định của lớp học dưới dạng snapshot (thêm trường `createdAt` và `deletedAt` trong JSON `Class.schedule`). Cảnh báo chưa dạy (missed teaching alerts) và các hiển thị calendar tuần chỉ đối chiếu với các slot lịch cố định còn hoạt động tại thời điểm tương ứng trong quá khứ. Đồng thời, bổ sung ràng buộc kiểm tra lịch bù (cả cảnh báo và tạo thủ công) phải có ngày học lớn hơn hoặc bằng ngày tạo lớp học (`Class.createdAt`).

- BE/FE biên lai nạp ví SePay: thêm `student_info.parent_receipt_email_enabled` (mặc định bật); khi tắt, webhook vẫn cộng ví nhưng không gửi email biên lai cho phụ huynh lẫn CSKH. Switch trên `/student` và trang chi tiết học sinh admin/staff. Biên lai email/PDF bỏ trường “Người thanh toán”.

### Added

- FE copy QR: Tự động dùng Canvas để vẽ thêm thông tin học sinh (Tên, Mã học sinh, các Lớp học đang hoạt động) ở phần chân ảnh (footer) của VietQR khi copy vào clipboard từ trang quản lý học sinh admin, ví học sinh, và màn hình chăm sóc khách hàng.
- FE/BE class session permissions: Bổ sung quyền điều chỉnh trường hệ số (multiplier/coefficient) và trạng thái thanh toán (payment status) cho quản lý (Admin/Trợ lý) cùng cả 2 vai trò kế toán (Kế toán thu `accountant_income` và Kế toán chi `accountant_expense`) trong các API `PUT /sessions/:id` và `PATCH /sessions/payment-status/bulk` cũng như UI quản lý buổi học tại trang chi tiết lớp học và chi tiết nhân sự.

- FE/BE session payment status: Bổ sung lại field điều chỉnh trạng thái thanh toán của buổi học (`teacherPaymentStatus`) trong form tạo buổi học (`AddSessionPopup`) cho admin/kế toán và form chỉnh sửa buổi học (`SessionHistoryTable`) cho nhân sự có quyền (admin, trợ lý, kế toán chi), đồng thời khóa tất cả các trường thông tin cơ bản khác (ngày, giờ, gia sư, nhận xét, điểm danh) khi ở chế độ xem chi tiết/kế toán chi để bảo vệ tính toàn vẹn của dữ liệu buổi học.
- BE/FE Đào Tạo role: thêm `StaffRole.training` / nhãn **Đào Tạo**, mở `/staff/calendar` cho lịch toàn bộ lớp đang chạy với redaction học sinh, random-check lớp đang diễn ra có Meet, dashboard Đào Tạo và docs route/schema tương ứng.

- BE/API `regulations`: thêm hard-delete `DELETE /regulations/:id` cho admin và `staff.assistant`, có ghi `action_history`; FE `/admin/notes-subject` và assistant `/staff/notes-subject` có nút xóa quy định kèm xác nhận.

- BE/FE RBAC kế toán: tách role kế toán legacy thành `accountant_income` (kế toán thu) và `accountant_expense` (kế toán chi). Dữ liệu legacy `accountant` được migration sang `accountant_income`; kế toán thu chỉ xem/chỉnh dữ liệu học phí theo lớp ở trang học sinh và xem dashboard thu, còn kế toán chi xử lý nhân sự/thanh toán/chi phí/trợ cấp/lương gia sư/giáo án payment status. Thêm redaction tài chính lớp/buổi học theo role và docs quyền mới.

- BE/FE class compensation: `accountant_expense` được chỉnh thêm `% vận hành` của gia sư theo lớp trong popup trợ cấp gia sư và cột **KH vận hành (%)** ở chi tiết nhân sự; backend lưu nguồn duy nhất tại `class_teachers.tax_rate_percent` (Prisma `operatingDeductionRatePercent`).

- **BREAKING – Short System Entity IDs (Lesson entities):** PK của `lesson_task`, `lesson_resources`, `lesson_outputs`, `staff_lesson_task` chuyển sang mã định danh hệ thống ngắn: `UNILTK-[0-9a-f]{10}`, `UNILRS-[0-9a-f]{10}`, `UNILOT-[0-9a-f]{10}`, `UNISLT-[0-9a-f]{10}`. Existing rows nhận ID mới sinh bằng `pgcrypto.gen_random_bytes(5)`, không cắt từ UUID cũ; old API links không redirect. Migration SQL: `20260524110000_lesson_short_system_entity_ids`. Docs: `docs/Database Schema.md` updated with PK format notes and summary table for all lesson entity IDs.

- **BREAKING – Short System Entity IDs:** PK của `student_info`, `staff_info`, `classes` chuyển sang mã định danh hệ thống ngắn: `UNIST-[0-9a-f]{10}`, `UNISTAFF-[0-9a-f]{10}`, `UNICL-[0-9a-f]{10}`. Existing rows nhận ID mới sinh bằng `pgcrypto.gen_random_bytes(5)`, không cắt từ UUID cũ; old API links không redirect. Migration SQL: `20260523110000_short_system_entity_ids`. Sau deploy: tái phát hành QR tĩnh học sinh và resync/update Google Calendar metadata theo runbook, không delete/recreate calendar events mặc định.

- FE loading state: Thêm các tệp loading suspense boundaries (`loading.tsx`) tại `/admin`, `/staff`, và `/student` hiển thị khung skeleton SaaS cao cấp phẳng siêu mượt khi bấm chuyển trang tức thì.

### Changed

- FE `/admin/notes-subject`: form chỉnh sửa quy định hiển thị ngay bên dưới item đang chọn thay vì ở cuối danh sách.

- FE thanh toán nhân sự: đổi nhãn cột/tổng “Sau thuế” thành “Sau cuối” và cho các dòng lớp trong payment preview bấm chuyển sang chi tiết lớp.

- SePay static QR nạp ví: nội dung QR tĩnh mới chỉ còn `[SEPAY_TRANSFER_NOTE_PREFIX] UNIST-[0-9a-f]{10}` để đồng bộ list/detail học sinh và tránh memo dài; webhook vẫn tương thích QR cũ có `NAPVI`/`NAP VI`, `UNICL-*`, `LOP ...`, đồng thời nhận token đã bị ngân hàng strip dấu như `UNIST<10hex>`/`UNICL<10hex>` khi tài khoản nhận đúng `SEPAY_TRANSFER_ACCOUNT_NUMBER`. Biên lai nạp ví hiển thị nội dung `Học sinh <id học sinh> gia hạn học phí các gói <tên lớp active...>`.

- Staff CCCD profile: bỏ flow upload ảnh CCCD ở admin/self-service, thay bằng field nhập tay `ethnicity`, `gender`, `current_address`; staff workspace gate kiểm tra các field này thay vì ảnh 2 mặt. Prisma migration `20260522100000_replace_staff_cccd_images_with_identity_fields` drop các cột path ảnh CCCD legacy.

- FE `LessonTaskDetailPage` (/admin/lesson-plans/tasks/[taskId] & /staff/lesson-plans/tasks/[taskId]): Đơn giản hoá, thiết kế lại trang chi tiết công việc giáo án theo bố cục 2 cột (Main content + Sidebar) cao cấp và responsive trên desktop. Gộp mô tả thừa, thu gọn danh sách nhân sự thực hiện (avatar tròn nhỏ) và tài nguyên liên quan (DB search mở rộng dạng inline) giúp trang gọn gàng, tăng diện tích thao tác và đạt 0 lỗi/cảnh báo tsc/eslint.

- FE sidebars: Tối ưu hóa tương tác chuyển trang Sidebar (`AdminSidebar.tsx`, `StaffSidebar.tsx`, `StudentSidebar.tsx`) tức thì (<16ms) thông qua trạng thái cục bộ `activeHrefState` và trì hoãn điều hướng thực tế bất đồng bộ `await Promise.resolve()`. Áp dụng pattern **điều chỉnh state tại thời điểm render** (Render-time State Adjustment) thay cho `useEffect` để loại bỏ render trùng lặp và vượt qua kiểm tra tĩnh ESLint `react-hooks/set-state-in-effect` sạch sẽ.

- Auth password flows: forgot/reset/setup pages now show full Unicorns Edu logo lockup; reset-password email uses React Email branded template with CTA/fallback link; reset tokens are bound to the current password hash so old links are invalid after a password change.

- FE nhãn `parent_email`: đổi **Email nhận biên nhận** → **Email phụ huynh** trên `/admin/students/[id]` (cả `/staff/students/[id]`), popup thêm/sửa học sinh, `/student` self-service và `/user-profile`.

- FE `AdminSidebar`: sắp xếp lại menu — Dashboard → Thông báo → User → Nhân sự → Lớp học → Học sinh → Chi phí → Giáo Án → Lịch → (Khấu trừ, Ghi chú môn học, Duyệt nạp ví, Lịch sử).

- BE mail: email xác thực tài khoản (`sendVerificationEmail`) chuyển sang React Email template `email-verification.email.tsx` (header thương hiệu, CTA, fallback link, ghi chú hết hạn 24 giờ); subject `[Unicorns Edu] Xác thực email tài khoản`. Docs: `docs/pages/auth.md`.

- FE `TutorCard` (`/admin/classes/[id]`, `/staff/classes/[id]` qua admin-like detail): **Trợ cấp** + **Vận hành** chỉ hiển thị với `admin`, `assistant`, `accountant`; các role khác giữ layout gia sư như trước (tên + trạng thái).

- FE `/admin/classes/[id]`: nút thêm buổi học hiện với admin đầy đủ và trợ lí (khớp `POST /sessions`); validate lớp phải có gia sư phụ trách và học sinh `active` trước khi mở popup; sau tạo buổi invalidate lịch sử buổi học theo lớp. `AddSessionPopup` gợi ý dropdown gia sư chỉ lấy từ roster lớp.

- FE `SessionHistoryTable` `variant="classDetail"`: layout dòng buổi học 3 cột (thời gian | nhận xét | thông tin + xóa) dùng chung cho `/admin/classes/[id]`, `/admin/staffs/[id]`, `/staff/profile`, `/staff/classes/[id]`; `entityMode="class"` hiển thị tên lớp ở cột phải thay vì gia sư.
- FE `SessionHistoryTable` `variant="classDetail"`: phần **Thông tin** trên trang lớp luôn hiển thị gia sư của từng buổi học, kể cả khi layout cha đang ẩn cột thực thể riêng.
- FE `SessionHistoryTable`: đổi trạng thái thanh toán buổi học không gửi lại `attendance` nếu người dùng không sửa điểm danh; payload điểm danh khi sửa chỉ gồm học sinh thuộc roster hiện tại để giữ lịch sử cũ không làm lỗi chuyển `deposit` → `paid`.

### Added

- BE/FE profile status workflow: thêm endpoint `PATCH /student/:id/status` và `PATCH /staff/:id/status`; học sinh `inactive` hiển thị **Nghỉ học** và tự đóng roster lớp đang active, nhân sự `inactive` hiển thị **Ngừng hoạt động** và bị chặn khỏi staff/admin-through-staff workspace cũng như phân công mới. Danh sách `/admin/students` và `/admin/staffs` có filter trạng thái server-side.
- FE `/staff/customer-care-detail` và `/admin/customer_care_detail/[staffId]`: tab **Học sinh** hiển thị tổng số, dùng infinite scroll tải 10 học sinh/lần, có nút icon QR copy nhanh, cột **Tiền vào** 21 ngày gần nhất; bấm vào con số **Tiền vào** mở popup **Lịch sử tiền vào** chỉ hiển thị giao dịch `topup`. Thêm tab **Thanh Toán** dùng `GET /customer-care/staff/:staffId/topup-history?page=&limit=` để đối soát lịch sử nạp tiền chung của học sinh thuộc CSKH đó, infinite scroll 20 khoản/lần.
- FE `/admin/students`: mỗi dòng học sinh có nút icon QR copy nhanh và cột **Tiền vào** cạnh **Số dư**.
- BE/FE yêu cầu **Nạp thẳng** ví học sinh cho CSKH/kế toán/trợ lí: staff nhập số tiền + lý do, backend gửi React Email tới `ADMIN_EMAIL`; token duyệt lưu hash, hết hạn sau 14 ngày, public page `/wallet-direct-topup-approval` chỉ cộng ví sau khi admin bấm xác nhận. Thiếu `ADMIN_EMAIL`, dùng placeholder như `admin@example.com`, production `FRONTEND_URL` không phải public HTTPS, hoặc lỗi SMTP thì không giữ request pending; lỗi gửi email duyệt có warning log theo `requestId`, `studentId`, domain admin email và error summary.
- FE/BE `/admin/wallet-direct-topup-requests`: thêm hàng chờ admin-only để xem `pending/approved/expired/all` yêu cầu **Nạp thẳng** và duyệt trực tiếp trong admin shell; mobile render request dạng card, desktop dùng bảng. Endpoint queue dùng cùng transaction cộng ví với link email, idempotent và chỉ tạo wallet transaction một lần. Khi CSKH/kế toán/trợ lí gửi yêu cầu, backend phát thêm notification published tới admin. Admin click toast/tray notification nạp thẳng sẽ mở popup duyệt trực tiếp theo request id.
- API production entrypoint: `postbuild` tạo `dist/main.js` tương thích với host/PM2 chạy `node dist/main`; `prod` script và Docker CMD dùng entrypoint này.
- Docs + mẫu Nginx native: [`nginx/dev-local-8080.example.conf`](../nginx/dev-local-8080.example.conf) và mục **Nginx reverse proxy local** trong [`docs/Cách làm việc.md`](./Cách%20làm%20việc.md) (cùng origin `http://localhost:8080`, BE `/api/`, biến env `FRONTEND_URL` / `NEXT_PUBLIC_BACKEND_URL` / OAuth callback).
- BE `POST /users/me/student-wallet-sepay-topup-order`: tạo yêu cầu nạp ví SePay kèm QR; `StudentService.getTuitionExtensionTransferNoteForSelf`; module `sepay/`. FE `/student`: nạp ví luôn tạo QR SePay, không còn cờ `NEXT_PUBLIC_STUDENT_WALLET_SEPAY_TOPUP`. Docs: `docs/pages/auth.md`, `docs/pages/student.md`, `docs/Cách làm việc.md`, `apps/api/.env.example`, `apps/web/.env.example`.
- BE mail: thêm biên nhận nạp ví SePay gửi tới email phụ huynh, nội dung text/html an toàn và giữ mapping lỗi SMTP `503`.
- FE admin student forms: thêm field email phụ huynh nhận biên nhận (`parent_email`) khi tạo/sửa học sinh.
- **Parent email self-service & hiển thị toàn hệ thống:** Thêm `parent_email` vào `UpdateMyStudentProfileDto` (backend `apps/api/src/dtos/profile.dto.ts` + `UserService.updateMyStudentProfile`) để học sinh tự cập nhật email phụ huynh qua `PATCH /users/me/student` (truyền `null`/chuỗi rỗng để xoá). FE: `ProfileStudentInfoDto`/`UpdateMyStudentProfileDto` (`apps/web/dtos/profile.dto.ts`) bổ sung `parentEmail`/`parent_email`; `/admin/students/[id]` (cũng dùng cho `/staff/students/[id]`) hiển thị dòng **Email nhận biên nhận** trong thẻ "Liên hệ phụ huynh"; `/student` self-service thêm input + dòng đọc cho email phụ huynh và tính `isStudentProfileDirty` theo field mới; `/user-profile` section Học viên thêm `TextField`/`DetailRows` `parent_email` và đưa field vào `studentCompletion`/`allProfileValues`. Docs: `docs/pages/auth.md`, `docs/pages/student.md`.

### Fixed

- FE tạo buổi học (`AddSessionPopup`): gỡ giới hạn 2000 ký tự cho nhận xét buổi học, vẫn giữ bắt buộc nhập nhận xét và giới hạn ghi chú điểm danh.

- BE/FE tạo lớp: `POST /class` trả detail đầy đủ gồm học sinh vừa gán để trang `/admin/classes/:id` hiển thị danh sách học sinh ngay sau redirect, không cần reload.

- BE SePay QR tĩnh nạp ví học sinh: nội dung chuyển khoản mới chỉ giữ prefix cấu hình + `<student_info.id>`; webhook vẫn reconcile được QR cũ có class id/hậu tố lớp.

- FE `/admin/students`: nút QR copy nhanh trên danh sách học sinh dùng nguyên QR URL backend trả về để đồng bộ với QR trong trang chi tiết học sinh.

- BE `GET /staff/:id/income-summary` — `classMonthlySummaries` (card **Lớp phụ trách**) trả `total` / `paid` / `unpaid` đều là gross allowance trước CPVH và trước thuế; tổng hợp thu nhập chung vẫn giữ net theo contract hiện tại. Docs: `docs/README.md`, `docs/pages/staff.md`; DTO comment `StaffIncomeClassSummary`.

- BE Google Meet link cố định cho staff: sau khi admin OAuth tạo Meet setup event, backend gọi Google Meet API `v2/spaces` để set `config.accessType=OPEN` cho link mới, rồi gọi `v2beta/spaces/{space}/members` để cấp role `COHOST` cho email staff; bỏ field `role: "CO_HOST"` khỏi Calendar attendees vì Calendar API không hỗ trợ field này. Nếu set `OPEN` hoặc cấp `COHOST` lỗi, link vẫn được lưu vào `staff_info.google_meet_link`; regenerate/auto-create backfill link vào `Class.schedule` và `makeup_schedule_events` do staff phụ trách, còn calendar feed ưu tiên link cố định của staff thay vì link cũ theo từng buổi. Docs/env cập nhật scope `meetings.space.settings`.

- CD deploy (`scripts/gha-deploy-remote.sh`): `wait_for_http` không còn bắt buộc mọi container có `node`; API/web vẫn dùng `node`, còn nginx image `nginx:1.27-alpine` dùng fallback `wget`/`curl`, tránh lỗi `exec: "node": executable file not found in $PATH` làm job timeout sau khi nginx đã start.
- CD deploy (`scripts/gha-deploy-remote.sh`): **deploy dừng âm thầm sau migration** — script được nạp qua `cat script | ssh ... bash -s` (đường Tailscale) nên `bash` đọc script từ stdin; `docker compose run` (migration) ở chế độ interactive nuốt hết phần stdin còn lại làm `bash` hết input và kết thúc ngay sau `prisma migrate deploy`, `api`/`web`/`nginx` không bao giờ được recreate → vẫn chạy image cũ. Fix: thêm `-T` + `</dev/null` cho lệnh `compose run` migration và `</dev/null` cho các lệnh `compose exec` (`wait_for_http`, `nginx -t`, `nginx -s reload`).
- CD deploy (`scripts/gha-deploy-remote.sh`): bỏ cờ `-a` ở các bước prune (`docker system prune -af` → `docker container/image/builder prune -f`) để prune không xoá nhầm image `:latest` vừa pull nhưng chưa có container; thêm `--no-deps` cho mọi lệnh `compose up` (đặc biệt `nginx`) để không force-recreate lại `api`/`web` đã chạy; nâng timeout `wait_for_http` lên `90 × 5s` (~7.5 phút/service, override qua `WAIT_HTTP_RETRIES`) để VPS thiếu disk boot chậm không bị abort giữa chừng làm `web`/`nginx` kẹt ở image cũ; `command_timeout` deploy SSH 30m → 45m. Docs: `docs/Cách làm việc.md`.

### Changed

- FE card **Lịch dạy bù** (`/admin/classes/[id]`, `/staff/classes/[id]`): danh sách chỉ tải buổi có `date >= hôm nay` (ẩn buổi đã qua); tổng và phân trang khớp filter. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`.
- CI Docker deploy: build API/Web chuyển sang runner ARM64 native `ubuntu-24.04-arm` với `platforms: linux/arm64` và Dockerfile dùng BuildKit cache mount cho pnpm store, tránh `pnpm install --frozen-lockfile` trên ARM64 qua QEMU chạy quá lâu nhưng vẫn có manifest đúng cho VPS ARM64.
- SePay QR tĩnh nạp ví học sinh đổi nội dung chuyển khoản sang `NAPVI <student_info.id> <active_class_id...> LOP <tên lớp...>`; webhook gửi biên lai riêng cho phụ huynh và CSKH, kèm dòng nội dung tiếng Việt trong email để nhận diện học sinh/lớp/số tiền.
- BE `GET /student` và `GET /customer-care/staff/:staffId/students`: trả thêm tổng `topup` 21 ngày gần nhất và cờ đạt ngưỡng `300.000` VND; endpoint CSKH đổi sang response phân trang `{ data, meta }`.
- BE `GET /student/:id/wallet-history`: mở quyền cho `staff.customer_care` xem lịch sử ví của học sinh được phân công, dùng cùng assignment check với chi tiết học sinh.
- SePay nạp ví học sinh: UI `/student` và popup ví admin/staff chuyển từ nhập số tiền + tạo order sang QR tĩnh theo học sinh (`GET /users/me/student-wallet-sepay-static-qr`, `GET /student/:id/wallet-sepay-static-qr`) với nội dung `NAPVI <student_info.id> <active_class_id...> LOP <tên lớp...>`; webhook cộng ví theo số tiền thực nhận và tạo ledger completed để chống cộng trùng. Docs: `docs/pages/auth.md`, `docs/pages/student.md`, `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/pages/README.md`, `docs/Cách làm việc.md`.
- Deploy/Nginx: production chuyển sang Cloudflare Tunnel; NGINX chỉ bind `127.0.0.1:80`, bỏ vhost HTTPS/certbot/domain cũ, preserve `X-Forwarded-Proto`, deploy smoke test qua loopback local thay vì `VPS_PUBLIC_HOST`. Docs `docs/Cách làm việc.md`.
- CI: job **`mirror-nginx`** copy manifest `docker.io/library/nginx:1.27-alpine` → **`ghcr.io/unicorns-prj-dev/nginx:1.27-alpine`** (`buildx imagetools create`); `docker-compose.prod.yml` trỏ `nginx` sang GHCR; `deploy` chờ `mirror-nginx`. VPS không còn phụ thuộc pull trực tiếp Docker Hub cho nginx. Docs `docs/Cách làm việc.md`.
- Deploy VPS script [`scripts/gha-deploy-remote.sh`](../scripts/gha-deploy-remote.sh): **retry** `docker compose pull` (mặc định 5 lần, backoff) cho lỗi mạng/ghcr tạm thời. Docs `docs/Cách làm việc.md`.
- CI build/push Docker: thêm **multi-arch** `linux/amd64,linux/arm64` (`docker/setup-qemu-action` + `platforms` trên `docker/build-push-action`) để VPS **ARM64** kéo được image từ GHCR (tránh `no matching manifest for linux/arm64`). Lần build đầu có thể chậm hơn do QEMU. Docs `docs/Cách làm việc.md`.
- CI deploy Tailscale: input `ping` mặc định **`vars.VPS_TAILSCALE_PING || secrets.VPS_HOST`** để đợi tailnet propagate trước SSH (giảm `ssh: handshake failed: EOF`). Docs `docs/Cách làm việc.md`.
- `docs/Cách làm việc.md`: Tailscale SSH — `action: check` **không** cho `src` là **tag**; rule từ `tag:cicd` dùng **`action: accept`**; numbering troubleshooting ACL.
- CI deploy: khi `TAILSCALE_ENABLED=true`, SSH deploy qua **`ProxyCommand` + `tailscale nc`** (userspace tailnet); script tách [`scripts/gha-deploy-remote.sh`](../scripts/gha-deploy-remote.sh); job `deploy` thêm checkout shallow; không Tailscale vẫn `appleboy/ssh-action` + `script_path`. Docs `docs/Cách làm việc.md`.
- CI deploy Tailscale: mặc định `tags` từ `tag:ci` → **`tag:cicd`** (khớp OAuth client / ACL tailnet); vẫn override được bằng variable `TAILSCALE_TAGS`. Docs `docs/Cách làm việc.md`.
- `docs/Cách làm việc.md`: mục Tailscale bổ sung hướng dẫn **Custom scopes** (Keys/Devices, không bật General) khi tạo OAuth credential cho GitHub Actions.
- FE `/staff/profile`: bỏ nút bút chì chỉnh sửa thông tin nhân sự ở header; `StaffSelfEditPopup` vẫn mở qua chỉnh sửa QR trong mục Hồ sơ nhân sự; toast `profile_required=1` cập nhật copy tương ứng. Docs: `docs/pages/staff.md`, `docs/README.md`, `docs/CHANGELOG.md`.
- FE `/user-profile`: khối **Nhân sự** lại **chỉnh sửa được** (form `updateMyStaffProfile`, upload CCCD). Proxy staff: hồ sơ chưa đủ → redirect `/user-profile?profile_required=1&from=...`. Bỏ toast `profile_required` riêng trên `/staff/profile`. Docs: `docs/README.md`, `docs/pages/auth.md`, `docs/pages/staff.md`.
- FE `/staff/staffs/[id]` khi mở **đúng hồ sơ nhân sự của chính user** (sidebar **Cá nhân**): ẩn chỉnh sửa kiểu admin (**Chỉnh sửa thông tin nhân sự**, popup `EditStaffPopup`, chỉnh QR thanh toán); tự cập nhật hồ sơ qua `/staff/profile`. Docs: `docs/pages/staff.md`.
- FE `/user-profile` — khối **Nhân sự**: thêm field **Minh chứng thành tích** (`personal_achievement_link`, `PATCH /users/me/staff`), đồng bộ với popup self-edit `/staff/profile`. Docs: `docs/pages/auth.md`, `docs/README.md`.
- **Email/PDF biên lai (`TuitionReceiptEmail`):** Hai logo căn giữa bằng bảng presentation (tránh client chia `Row`/`Column` đẩy logo ra hai mép); chú thích “Đối chiếu sao kê…” góc trái dưới và con dấu (ảnh CID) góc phải dưới cùng một hàng; viền khối biên lai mỏng `1px` khớp mẫu in.
- **Email biên lai nạp ví (phụ huynh, sau webhook SePay):** HTML render bằng **React Email** (`TuitionReceiptEmail`), logo/con dấu qua `ReceiptAssetsService` (`src/mail/assets/*_sm.png`). Đính kèm **PDF** cùng HTML khi `ReceiptPdfService` (Puppeteer + `CHROMIUM_PATH`) sinh PDF thành công; image Docker API cài Chromium và `CHROMIUM_PATH=/usr/bin/chromium`. Tuỳ chọn `RECEIPT_*` ghi đè tiêu đề/người nhận/STK; `sendReceiptAfterCommit` vẫn truyền `parentName`, `transferNote`, `balanceAfter`; lỗi SMTP không fail webhook. Docs: `apps/api/.env.example`, `docs/Cách làm việc.md`, `docs/pages/auth.md`, `docs/pages/student.md`.
- FE/BE auth gates: đồng bộ admin shell access để `staff.admin` được xem là admin đầy đủ, admin không bị khóa bởi email verification, và login/proxy/client gate dùng cùng policy route admin shell. Docs: `docs/pages/admin.md`, `docs/pages/auth.md`, `docs/pages/auth-login.md`, `docs/README.md`.
- FE `/user-profile`: bộ đếm section `Nhân sự` chỉ tính 12 field staff người dùng tự hoàn thiện, không tính `status`/`roles`; `personal_achievement_link` tiếp tục là tùy chọn và không kích hoạt redirect hoàn thiện hồ sơ. Docs: `docs/pages/auth.md`, `docs/pages/staff.md`, `docs/README.md`.
- FE `StudentBalancePopup`: chế độ **Nạp tiền** dùng số dương; QR SePay là mặc định, admin mới có tab **Nạp thẳng** và phải nhập lý do khi chỉnh số dư trực tiếp. `/student` chỉ còn QR SePay, không còn nhập số âm/rút self-service. Docs: `docs/pages/student.md`, `docs/pages/admin.md`, `docs/README.md`, `docs/pages/auth.md`.
- FE `/user-profile`: tắt `forceEmailUnverifiedForTest` mặc định để hiển thị đúng `emailVerified` từ API; nhãn chữ **Đã xác minh** / **Chưa xác minh**; gửi lại link qua `POST /auth/resend-verification` thay vì mock; email học viên khác email tài khoản hiển thị ghi chú không áp dụng xác minh đăng nhập. Docs: `docs/pages/auth.md`.
- FE SePay top-up UX/docs: chặn tạo QR khi số tiền dương dưới `1.000` VND, cập nhật copy sang webhook tự động cộng ví sau xác nhận ngân hàng, và ghi rõ backend chặn self-service nạp dương qua `PATCH` khi API đã cấu hình SePay.
- BE SePay top-up: thêm `SEPAY_TOPUP_MODE=bank_transfer` để tạo QR chuyển khoản thường/VietQR và reconcile bằng webhook cho ngân hàng không hỗ trợ VA orders như MBBank; giữ `va_order` cho BIDV/Sacombank.
- BE SePay webhook: hỗ trợ xác thực HMAC `X-SePay-Signature` + `X-SePay-Timestamp` trên chuỗi `{timestamp}.{raw_body}` đúng byte SePay gửi, thêm replay-window `SEPAY_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS`, và chỉ nhận fallback `X-Secret-Key` cũ khi bật `SEPAY_WEBHOOK_ALLOW_LEGACY_SECRET_KEY`.
- BE SePay webhook: sau khi validate định dạng header, so khớp digest HMAC bằng `timingSafeEqual` trên 32 byte decode từ hex (chặt hơn ví dụ `!==` trên toàn chuỗi).
- BE SePay webhook: `401` khi `X-SePay-Timestamp` ngoài cửa sổ drift dùng message riêng (không còn trùng với sai HMAC), kèm gợi ý cấu hình / ký lại; docs checklist gỡ lỗi curl replay.
- BE SePay webhook: ACK thành công đổi sang `{ "success": true }` để khớp yêu cầu response body của SePay Webhooks.
- BE SePay webhook: log `[SePayWebhookAuth]` khi invalidate chỉ còn reason, fingerprint/length của expected secret, received legacy `X-Secret-Key`, received `X-SePay-Signature`, và `expectedSignature` khi HMAC mismatch; không log payload metadata.
- BE SePay webhook: verify HMAC bằng raw body theo tài liệu HMAC hiện tại của SePay; nếu thiếu raw body khi có header HMAC thì fail closed để tránh ký sai payload.
- Quyền nạp ví học sinh: thêm `POST /student/:id/wallet-sepay-topup-order` cho admin/assistant/accountant/CSKH được phân quyền; staff chỉ tạo QR SePay và không được chỉnh thẳng số dư. Admin popup nạp ví có 2 tab **Tạo QR SePay** / **Nạp thẳng**; mọi chỉnh số dư trực tiếp của admin phải nhập lý do và ghi vào lịch sử ví. Self-service student chỉ QR SePay, không còn rút/chỉnh ví trực tiếp.
- DB `student_wallet_sepay_orders`: lưu metadata người tạo QR (`created_by_user_id`, email, role type, staff roles) để audit các đơn SePay do admin/staff/student tạo.

### Changed

- FE **Thành tích chuyên môn** (`specialization`): render trực tiếp chuỗi từ DB bằng Markdown (`react-markdown` + `remark-gfm`, `skipHtml`) qua `StaffSpecializationMarkdown`; bỏ nhánh rich text HTML sanitize, bỏ helper tự chèn xuống dòng trước bullet, copy popup chỉ hướng dẫn nhập Markdown, và `/user-profile` dùng textarea nhiều dòng để lưu newline thật vào DB. Docs: `docs/pages/staff.md`, `docs/pages/admin.md`, `docs/pages/auth.md`.

### Fixed

- CD VPS: deploy script prune Docker unused data trước khi pull, pull/recreate từng service và prune giữa các service để tránh `no space left on device` khi containerd giải nén image mới trên VPS nhỏ.
- CD VPS: `scripts/gha-deploy-remote.sh` chạy Prisma `migrate deploy` từ API image sau khi pull GHCR và trước khi recreate services, tránh deploy code mới khi schema production chưa có migration mới.
- BE/FE `GET /staff/:id/income-summary` — `snapshotUnpaidTotal` / `snapshotUnpaidNetTotal` giờ tính **toàn bộ** khoản pending/unpaid hiện tại từ mọi nguồn, không giới hạn tháng hoặc `days` và không gồm cọc; net giáo viên = gross - vận hành hiện hành - thuế trên phần sau vận hành, role khác = gross - thuế. Card **Tổng nhận** dùng `incomeStatsTotalNet` = `monthlyIncomeTotals.total` (net tháng đang chọn), trong đó buổi dạy `unpaid`/`pending` của tháng cũng được tính theo NET hiện hành; **Đã nhận** dùng `monthlyIncomeTotals.paid`, card **Tổng năm** dùng `yearIncomeTotal`, còn mini stat **Chưa nhận** trên `/staff` dùng `snapshotUnpaidNetTotal`. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md`; DTO comments.
- BE `GET /staff/:id/income-summary` — `monthlyIncomeTotals` và `bonusMonthlyTotals`: thưởng (bonus) được tính **net sau thuế** theo mức khấu trừ hiện hành của role ưu tiên trên hồ sơ (không khấu trừ vận hành trên thưởng); `monthlyTaxTotals` / `yearTaxTotal` gồm thuế thưởng; `payment-preview` và `snapshotUnpaidNetTotal` đồng bộ cùng rule. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md`; DTO `bonusMonthlyTotals`.
- BE `GET /staff/:id/income-summary` — `classMonthlySummaries` (card **Lớp phụ trách**): cột Tổng / Chưa nhận / Đã nhận dùng **thực nhận** sau khấu trừ vận hành theo lớp và thuế (cùng công thức net như tổng hợp buổi dạy), thay vì gross trước thuế. Docs: `docs/pages/admin.md`, `docs/pages/staff.md`; DTO comment `StaffIncomeClassSummaryDto` / `StaffIncomeClassSummary`.
- BE auth/email verification: `POST /auth/resend-verification` chấp nhận session qua `access_token` hoặc `refresh_token` để user chưa verify không bị kẹt; lỗi SMTP giữ đúng `503` thay vì thành `500`; Gmail App Password có khoảng trắng được normalize trước khi gửi qua Nodemailer.
- API local CORS/preflight: bật CORS qua `NestFactory.create(..., { cors })` trong `apps/api/src/main.ts` thay vì `app.enableCors()` sau `create`, để middleware CORS đăng ký trước router Nest và trả `Access-Control-Allow-Origin` cho `OPTIONS` (tránh lỗi preflight khi gọi API cross-origin từ web).

### Added

- **CI deploy — Tailscale (tuỳ chọn):** job `deploy` trong [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) có thể gọi [`tailscale/github-action@v4`](https://github.com/tailscale/github-action) trước `appleboy/ssh-action` khi bật variable `TAILSCALE_ENABLED=true` (OAuth `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` mặc định, hoặc `TAILSCALE_AUTH_MODE=authkey` + `TAILSCALE_AUTHKEY`). Biến tuỳ chọn `TAILSCALE_TAGS`, `VPS_TAILSCALE_PING`. Hướng dẫn: `docs/Cách làm việc.md`.
- DB migration: `staff_info` thay unique index `staff_info_user_id_key` bằng phiên bản **covering** `INCLUDE ("id", "roles")` để hỗ trợ index-only scan cho truy vấn theo `user_id` (luồng auth/session).
- Prisma `StaffInfo`: doc comment + `@@unique([userId], map: "staff_info_user_id_key")` (thay `@unique` trên field) để tên index khớp DB và ghi chú INCLUDE chỉ trong migration.
- **Nginx HTTPS (prod):** Tách `location` proxy chung vào `nginx/conf.d/snippets/proxy-locations.conf`, `app.conf` phục vụ HTTP (default_server) + `/.well-known/acme-challenge/` cho Certbot webroot; mount `./nginx/certbot/www` trong `docker-compose.prod.yml`; file mẫu `nginx/conf.d/https-vhost.conf.example`; **`nginx/conf.d/https-vhost.conf`** cho TLS + redirect (miền prod hiện tại: `it.unicornsedu.com`). Hướng dẫn & thứ tự Certbot trong `docs/Cách làm việc.md`.
- FE `/admin/staffs/[id]` (shell `/admin`) — card **Lớp phụ trách**: cột **KH vận hành** (%); **admin** chỉnh ô `%` với **Huỷ bỏ** / **Lưu** chỉ hiện khi có thay đổi; không lưu khi blur; **Huỷ bỏ** refetch `GET /staff/:id` và xóa draft; **Lưu** áp tuần tự các lớp đã đổi qua `PATCH /staff/:id/class-teachers/:classId/operating-deduction` và hiện skeleton khi đang lưu. `GET /staff/:id` trả `operatingDeductionRatePercent` trên từng `classTeachers`.
- FE notification tray (staff shell): thêm popup cảnh báo giữa màn hình khi load trang và còn thông báo `unread`, nội dung "Cảnh báo còn thông báo chưa đọc", có nút `X` để tắt popup và nút CTA `Xem thông báo` để mở notification slide bên phải ở tab `Mới`.

### Changed

- **Prod domain (VPS):** `nginx/conf.d/https-vhost.conf`, [.env.production.example](../.env.production.example) và mục Certbot/HTTPS trong `docs/Cách làm việc.md` chuyển sang **`it.unicornsedu.com`** (Let’s Encrypt path `/etc/letsencrypt/live/it.unicornsedu.com/`). Trên VPS: cấp lại cert với `-d it.unicornsedu.com`, đồng bộ `.env` (`FRONTEND_URL`, `BACKEND_URL`, `GOOGLE_CALLBACK_URL`, `VPS_PUBLIC_HOST`) và secret GitHub `NEXT_PUBLIC_BACKEND_URL` = `https://it.unicornsedu.com/api`.
- **CI deploy:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) không còn gọi `prisma migrate deploy` sau smoke HTTPS; migration production do vận hành chạy tay trên VPS (hoặc quy trình ngoài Actions). `docs/Cách làm việc.md` cập nhật mô tả pipeline và mục troubleshooting 137.
- BE/FE staff income summary (detail cards): `snapshotUnpaidNetTotal` tính net với **% vận hành và % thuế hiện hành** (cùng luồng preview thanh toán); `incomeStatsTotalNet` = `monthlyIncomeTotals.total`; `totalReceivedNet` = `yearPaidNetTotal + snapshotUnpaidNetTotal`. Card **Tổng nhận** = net tháng đang chọn, bao gồm unpaid/pending buổi dạy sau khấu trừ hiện hành; **Đã nhận** = `monthlyIncomeTotals.paid`; **Tổng năm** = `yearIncomeTotal`.
- **GitHub Actions:** gỡ job CI trên Actions; chỉ giữ [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (push `main`: build/push GHCR `unicorns-prj-dev`, tag `latest` + `${GITHUB_SHA}`, deploy VPS với `GHCR_USERNAME` / `GHCR_TOKEN`). Lint/typecheck/test chạy local (`pnpm lint`, `pnpm check-types`, …).
- CI deploy workflow: biến `VPS_PUBLIC_HOST` cho curl HTTPS smoke test qua loopback (SNI); sau deploy gọi `certbot renew` khi có trên VPS.
- BE/FE admin dashboard: `GetAdminStudentBalanceDetails` thêm query tùy chọn `month` (01–12) / `year` (YYYY) để drill-down prepaid phù hợp tháng đang xem; FE admin dashboard chỉnh copy KPI và ghi chú nợ học phí / chưa thu / quick view cho khớp semantics tháng hiện tại.
- FE admin/staff/student CRUD save UX: các form save không-destructive cho lớp, nhân sự, học sinh, session, học phí, ví và self-profile nay đóng popup/thoát edit mode ngay sau client validation, hiện `toast.loading`, rồi resolve success/error khi mutation nền hoàn tất; section đang refetch vẫn giữ dữ liệu cũ, dim nhẹ và hiện refresh strip/skeleton mảnh thay vì thay cả vùng bằng loading state.
- Staff **Thanh toán** (payment-preview + pay-all): mọi nguồn trong preview và khi xác nhận pay-all là **toàn bộ khoản pending/unpaid hiện tại** (mọi role, mọi tháng, trừ cọc); `month/year` trong query/body chỉ là context UI. Card **Công việc khác**: **Chưa nhận** theo role là snapshot full-scope; **Tổng nhận/Đã nhận** vẫn theo tháng đang xem.
- BE session create/update: memo hoá `resolveTaxDeductionRate` theo `(staffId, roleType)` với `createMemoizedTaxDeductionResolver` — tránh N lần query trùng khi `Promise.all` trên nhiều dòng điểm danh cùng CSKH / assistant; `studentClass` khi tạo buổi chỉ `select` `student.account_balance` thay vì cả `student_info`.
- CI: `.github/workflows/deploy.yml` tách build Docker **API** và **Web** thành hai job chạy song song (`build-api`, `build-web`); `deploy` chờ cả hai; cache BuildKit `gha` dùng `scope` riêng để tránh xung đột khi push cache đồng thời. Job `deploy`: `VPS_PUBLIC_HOST` từ Secret hoặc Repository variable (`secrets.VPS_PUBLIC_HOST || vars.VPS_PUBLIC_HOST`), truyền SSH qua `envs`; trên VPS nếu trống thì đọc `VPS_PUBLIC_HOST` trong `.env`; chỉ chạy smoke test HTTPS (`curl --resolve`) khi đã có hostname (không có thì skip). `.env.production.example` thêm `VPS_PUBLIC_HOST`.

### Fixed

- BE dashboard `getMonthlyTrend`: sửa lỗi PostgreSQL `function pg_catalog.substring(date, integer, integer) does not exist` (Prisma `P2010`) khi raw SQL bind cận `DATE` dạng parameter — chuyển sang literal `DATE 'YYYY-MM-DD'` đã validate; gộp chi phí bonus theo `bonuses.date`; `cost_extend` lọc nhánh `month` bằng `::text` + `BTRIM` đồng bộ với range aggregate.
- CI deploy (`.github/workflows/deploy.yml`): giảm lỗi race `OCI runtime exec failed ... setns` ở bước `docker compose exec -T nginx ...` bằng cách chờ `nginx` chạy ổn định sau recreate (`wait_for_nginx_running`) và retry `nginx -t` / `nginx -s reload`; khi thất bại sẽ dump `docker compose ps` + `logs nginx` để debug nhanh root cause.
- FE `SessionHistoryTable`: pill trạng thái thanh toán (ví dụ _Chưa thanh toán_) xuống dòng gọn trong ô khi bảng `table-fixed` hẹp / `overflow-x-auto`, cột trạng thái tăng tỷ lệ + `min-w-30`, tiêu đề cột được phép xuống dòng trên màn nhỏ — tránh badge/mask lệch hoặc tràn khi scroll ngang.
- BE admin dashboard aggregate (`GET /dashboard`): chỉnh `getMonthlyTrend` dùng cận ngày `YYYY-MM-DD` theo `month`/`year` + `anchorMonthKey`, và `buildDashboardRange` dùng `Date.UTC` cho biên tháng / `formatMonthKey` theo UTC — tránh lệch múi giờ khiến `generate_series` không khớp CTE doanh thu/chi phí và `resolveSelectedMonthTrend` fallback về 0 (bảng **Báo cáo tài chính** hiển thị sai **Học phí đã học**, chi phí, lợi nhuận).
- BE dashboard `getMonthlyTrend`: lọc `cost_extend.date` ép `::date` vì cột DB là `TEXT` — sửa lỗi PostgreSQL `operator does not exist: text >= date` (Prisma `P2010`).
- BE/FE staff income summary unpaid: thêm `snapshotUnpaidTotal` authoritative cho card `Chưa nhận` trên `/staff/profile` và `/admin/staffs/[id]`; snapshot loại trạng thái cọc, buổi dạy chỉ tính `unpaid` trong `days` gần nhất, các nguồn pending khác tính full, dùng semantics trước thuế. Đồng thời cột `Chưa nhận` theo lớp chuyển sang lấy gross từ cửa sổ unpaid gần nhất.
- BE staff income summary theo lớp: `classMonthlySummaries` chuẩn hóa lại theo rule mới — cột `Tổng` + `Đã nhận` tính theo **tháng đang chọn** với gross trước thuế, còn cột `Chưa nhận` giữ cửa sổ `days` gần nhất (mặc định 14 ngày) với gross trước thuế.
- BE session date-only consistency: chuẩn hóa parse/lọc ngày theo mốc UTC date-only (`YYYY-MM-DD`) cho luồng tạo/sửa session và query tháng để tránh case đổi ngày sang tháng trước nhưng vẫn hiển thị ở tháng hiện tại.
- BE staff unpaid snapshot: mở rộng lọc trạng thái buổi dạy `chưa nhận` cho cửa sổ gần nhất để bao gồm cả dữ liệu legacy `pending` lẫn `unpaid`, tránh hụt cột `Chưa nhận` theo lớp.
- BE session create: tăng `interactive transaction timeout` / `maxWait` cho `SessionCreateService.createSession` (cùng mức 20s như `SessionUpdateService`) để tránh Prisma `P2028` khi tạo buổi có nhiều điểm danh, ghi ví, và audit snapshot.
- BE session update/payroll audit: tăng `interactive transaction timeout` cho `SessionUpdateService` (`updateSession` và `updateSessionPaymentStatuses`) để tránh lỗi Prisma `P2028` khi transaction chứa nhiều thao tác (snapshot + attendance upsert + audit log) vượt ngưỡng mặc định 5s.
- BE payroll (deposit sessions): `buildTeacherSessionAllowanceCte` không còn áp trần `classes.max_allowance_per_session` cho các buổi có `teacher_payment_status` thuộc nhóm cọc (`deposit/deposite/coc/cọc`); các buổi thường vẫn giữ logic cap như cũ.
- BE/FE session allowance (lựa chọn **B**): `sessions.allowance_amount` lưu **gốc trước hệ số** = `(trợ cấp/HS theo gia sư-lớp × số HS điểm danh present/excused) + classes.scale_amount`; các SQL payroll/dashboard/reporting dùng `min(max_allowance_per_session, allowance_amount * coefficient)` và **không** cộng thêm `classes.scale_amount`. Migration `20260502120000_session_allowance_includes_scale_amount` cộng `scale_amount` vào `allowance_amount` cho session cũ để gross không đổi sau deploy.
- FE `AddSessionPopup` + chỉnh sửa buổi trong `SessionHistoryTable`: auto-fill/preview đồng bộ công thức trên; header hiển thị gross ước tính (hệ số + trần); submit gửi đúng gốc lưu buổi. Helper dùng chung `apps/web/lib/session-allowance.helpers.ts`.
- BE/FE extra allowance create flow: `POST /extra-allowance` và `POST /users/me/staff-extra-allowances` không còn yêu cầu FE gửi `id`; backend để Prisma/DB tự sinh UUID, trong khi các flow `PATCH` tương ứng vẫn giữ `id` bắt buộc. Admin detail page và self-service `communication`/`technical` đã bỏ `createClientId()` khi tạo trợ cấp mới.
- BE/FE calendar exam schedules: feed `/admin/calendar/events` và `/calendar/staff/events` không còn làm rơi lịch thi chỉ vì `student_info.status = inactive`; miễn học sinh còn gắn với lớp `running` thì event `exam` vẫn hiển thị trên calendar. Dropdown filter học sinh của calendar cũng đổi sang cùng tiêu chí này.
- FE: `ThemeProvider` không còn đọc `localStorage` trong `useState` initializer — tránh hydration mismatch (logo `BrandLogo` / `next/image` khác `src` và kích thước giữa server và client khi user đã lưu theme tối hoặc pink).
- FE `/auth/login`: toast lỗi hiển thị message từ Nest khi **400** / **401** / **429**; ô mật khẩu có `minLength={6}` + placeholder gợi ý để khớp validation `POST /auth/login` (tránh 400 chỉ vì mật khẩu quá ngắn).
- FE `/staff/calendar` và `/admin/calendar`: thêm switch **Calendar / Schedule**, bộ lọc lớp hỗ trợ **multi-select** (admin giữ thêm lọc gia sư); chế độ Schedule chỉ hiển thị ngày có lịch (ẩn ngày trống); dùng chung `CalendarScheduleList` + palette lớp; card có badge trạng thái `Đã dạy / Đang diễn ra / Sắp tới`.

### Changed

- BE/FE calendar: chuyển sang aggregate feed hợp nhất `fixed` + `makeup` + `exam`, hỗ trợ filter học sinh, toggle **Tuần này / Tuần sau**, popup/list render lịch thi như event all-day kiểu ngày lễ; route admin/staff calendar giữ read-only cho `makeup`.
- FE `/admin/classes/[id]` và `/staff/classes/[id]`: quản lý **Lịch dạy bù** trực tiếp trong trang chi tiết lớp, có phân trang, sắp xếp buổi gần nhất trước, copy tiếng Việt đầy đủ; admin/trợ lí chọn gia sư phụ trách, teacher tạo buổi bù với chính mình là người phụ trách.
- FE `AddSessionPopup` + dialog **Chỉnh sửa buổi học** trong `SessionHistoryTable`: layout một cột (`max-w-3xl`), header có số tiền (success), nhóm thời gian có mũi tên + thời lượng, điểm danh cột **Trạng thái** trước (nút icon Học/Phép/Vắng), tổng điểm danh dạng một dòng màu; module dùng chung `session-form-ui.tsx`. Truyền `classPricing` từ chi tiết lớp để hiển thị ước lượng trợ cấp (gốc lưu buổi = trợ cấp/HS × có mặt + scale; header gross = `min(max_allowance, gốc × hệ_số)`).
- FE `/admin/classes/[id]` và `/staff/classes/[id]`: dòng meta lớp (trạng thái, loại, gói, trợ cấp, sĩ số, …) chỉ hiển thị cho **admin**, **trợ lí**, **kế toán**, **CSKH**; gia sư thuần `teacher` trên staff workspace không thấy dải thông tin đó.
- FE `/admin/staffs/:id` (và mirror staff): **Thống kê thu nhập** thêm lại khối **Trước khấu trừ** (gross/thuế/khấu trừ chi tiết) cho người xem **admin** hoặc **kế toán**, đồng bộ với logic `/staff/profile`.
- FE `/admin/calendar` và `/staff/calendar`: tối giản layout — header/bộ lọc nhỏ hơn (bỏ gradient blob + đoạn hướng dẫn dài; gợi ý ngắn hoặc `title`), Schedule list + vỏ FullCalendar gọn; lưới giờ co trong ngày (không mở dải nửa đêm khi chỉ có lịch ban ngày), ô giờ thấp hơn, sự kiện xếp không overlap trong cột; đồng bộ `FilterBar` / `StaffCalendarFilterBar`.
- FE `/admin/classes/[id]` và `/staff/classes/[id]` (teacher workspace): tối giản UI chi tiết lớp — header/card gọn hơn, meta lớp một hàng có dấu phân cách ·, khung giờ học bỏ khối thời gian quá lớn trên desktop, bảng học sinh và tab lịch sử/khảo sát bớt padding; `SessionHistoryTable` với `variant="classDetail"` có bảng buổi học dày hơn (cột thời gian/ghi chú/thông tin gọn).
- BE/FE payroll summary: giữ nguyên khấu trừ vận hành của gia sư theo lớp, nhưng đổi khấu trừ thuế sang tính trên **tổng thu nhập của từng nguồn trong kỳ** theo snapshot/effective-rate bucket; bonus tiếp tục không chịu thuế.
- BE `GET /staff/:id/income-summary`, `GET /users/me/staff-income-summary`, `GET /staff`: unpaid/tổng hợp net giờ dùng aggregate-tax theo nguồn; các view chi tiết lớp/cọc/unpaid của gia sư chuyển sang semantics **sau vận hành, trước thuế**.
- FE `/admin/deductions`, `/admin/staffs/:id`, `/staff/profile`: cập nhật copy/label để phản ánh tax aggregate theo nguồn, bonus untaxed, và bảng lớp là số trước thuế.
- BE/FE deductions settings: `/admin/deductions` và mirror `/staff/deductions` giờ chỉ quản lý mức thuế mặc định theo role; flow chỉnh/tạo override theo staff được chuyển sang card thuế ở `/admin/staffs/:id` và mirror `/staff/staffs/:id`. API `PATCH` cho role defaults và staff overrides vẫn giữ nguyên.

### Removed

- FE `/staff/classes/[id]`: bỏ đoạn ghi chú dưới header (teacher / admin teacher-workspace / CSKH) về khung giờ, buổi học và trường tài chính bị khóa.
- FE: component `AdminProfilePopup` (modal "Thông tin cá nhân" khi bấm avatar); export barrel `@/components/admin` không còn `AdminProfilePopup`. Thông tin cá nhân chỉ qua trang `/user-profile`.
- BE/FE notifications: gỡ cấu hình người nhận lưu DB và API `GET /notifications/recipient-options`; push/feed không còn filter theo đối tượng. Trên `/admin/notification`, ô **Người nhận** chỉ còn **mock UI (demo)** trên FE (tag + user giả), không gửi lên server.

### Added

- BE/FE student exams + Google Calendar: thêm persistence `student_exam_schedules`, popup/card chỉnh lịch thi học sinh, aggregate calendar event type `exam`, và sync all-day event lên Google Calendar theo `studentId + examScheduleId`.
- BE/FE makeup schedules: thêm bảng `makeup_schedule_events`, API CRUD theo lớp cho admin/staff workspace, render one-off event `makeup` trong aggregate calendar và sync riêng lên Google Calendar.
- BE schema/migration: thêm `class_teachers.tax_rate_percent` (default `0`) và `sessions.teacher_tax_rate_percent` (default `0`) để cấu hình thuế theo từng cặp gia sư-lớp và snapshot mức thuế tại thời điểm tạo/cập nhật buổi học.
- BE/FE class teachers: payload cập nhật gia sư lớp nhận thêm tỷ lệ khấu trừ vận hành; FE dùng key semantic `operating_deduction_rate_percent`, backend vẫn nhận `tax_rate_percent` như alias legacy.
- FE admin/staff: thêm màn `Khấu trừ` tại `/admin/deductions` và mirror `/staff/deductions` để quản lý khấu trừ thuế theo role (effective-date), kèm wire sidebar + access gate cho admin/assistant/accountant theo policy shell; chỉnh riêng từng staff được thực hiện tại trang chi tiết nhân sự.
- FE: `BrandLogoLockup` — khung mark + tách màu **Edu** (`text-primary`), khoảng cách chặt, hover lockup; Navbar / auth / sidebar (`dense` khi thu gọn).
- BE/FE: `notification_reads` (per-user đã đọc) + `GET /notifications/feed` trả `readStatus` + `PATCH /notifications/feed/:id/read`. Feed mở cho `student` (studentInfo active) và `admin` không bắt buộc staff profile. Sidebar `StaffSidebar` / `StudentSidebar`: `SidebarNotificationTray` (TanStack Query), panel phải + popup chi tiết giữa màn hình (Framer), auto mark read khi mở chi tiết; `@heroicons/react` `BellIcon`.
- BE/FE: Trợ cấp trợ lí 3% học phí đã học. Trợ lí (`assistant` role) quản lí các CSKH: `staff_info.customer_care_managed_by_staff_id` FK mới; snapshot `assistant_manager_staff_id` + `assistant_payment_status` trên `attendance` tại thời điểm tạo/cập nhật buổi học. Thu nhập trợ lí aggregate bằng raw SQL `ROUND(tuition_fee * 0.03)` chỉ trên attendance `present`, wire vào `getIncomeSummary`, `getUnpaidTotalsByStaffIds`, và dashboard unpaid CTE. API: `GET /staff/assistant-options`, `PATCH /staff` nhận thêm `customer_care_managed_by_staff_id`; `GET /staff/:id` trả `customerCareManagedBy`. FE: dropdown trợ lí trong popup sửa nhân sự CSKH. Migration: `20260405120000_add_assistant_manager_fields`.

### Fixed

- Auth/API/Web: thêm `GET /auth/session` làm contract auth nhẹ cho SSR/proxy/bootstrap; `GET /auth/profile` delegate cùng resolver; refresh/session auth không còn đối chiếu hash refresh token với DB để hỗ trợ đăng nhập đồng thời nhiều thiết bị cùng một tài khoản; logout clear cookie theo session hiện tại; forgot-password trả generic success để tránh account enumeration; bổ sung route `/verify-email` ở web.
- User self-service/security: đổi email tự phục vụ sẽ reset `emailVerified=false`; self student update không còn nhận `status`; `bank_qr_link` được normalize/validate chỉ cho `http/https`; upload avatar/CCCD được chặn MIME/size ngay từ controller interceptor; `StaffQrCard` không còn `window.open` URL không an toàn.
- FE: popup **Chọn giao diện** (`SidebarThemePicker`) render qua `createPortal` → `document.body` để không bị cắt bởi `overflow-hidden` / `transform` trên sidebar.
- API: `NotificationService` feed + mark-read không còn dùng `include.reads` / `prisma.notificationRead` (tránh lệch type khi Prisma client chưa generate đủ); feed query `notification_reads` bằng `$queryRaw` + `Prisma.join`, mark read bằng `$executeRaw` `ON CONFLICT DO NOTHING`.

### Changed

- BE income summary staff: chuyển sang **net-first** cho khoản dạy học (`monthlyIncomeTotals`, `sessionMonthlyTotals`, `yearIncomeTotal`) và trả thêm breakdown gross/tax (`monthlyGrossTotals`, `monthlyTaxTotals`, `sessionMonthlyGrossTotals`, `sessionMonthlyTaxTotals`, `yearGrossIncomeTotal`, `yearTaxTotal`).
- FE `/admin/staffs/[id]` và `/staff/profile`: card thu nhập tháng hiển thị số net làm chính; block `Trước khấu trừ` render động gross/tax và tự mở rộng thêm `operating/total deductions` nếu backend expose; chỉ hiển thị cho admin hoặc accountant.
- FE class forms (`AddClassPopup`, `EditClassPopup`, `EditClassTeachersPopup`): semantic UI/DTO đổi từ `thuế gia sư-lớp` sang `khấu trừ vận hành`; giữ fallback tương thích key cũ để không vỡ khi backend rollout từng phần.
- Docs: đồng bộ lại `docs/pages/admin.md`, `docs/pages/staff.md`, `docs/Database Schema.md` theo logic deductions mới (thuế không áp dụng bonus, khấu trừ vận hành theo quan hệ gia sư-lớp, route mới `/admin|/staff/deductions`).
- FE: chọn giao diện 3 chế độ (Sáng / Tối / Hoa anh đào) — `data-theme` + `localStorage` (`ue-app-theme`), `ThemeProvider`, logo theo theme (`logo_light` / `logo_dark` / `logo_hana`), nút `SidebarThemePicker` (icon Swatch) cạnh avatar + chuông trên `AdminSidebar` / `StaffSidebar` / `StudentSidebar`; script `beforeInteractive` tránh flash; tinh chỉnh token `[data-theme="pink"]` (tông hồng / rose). Asset `logo_hana.png` đã chạy lại `square-trim-logos`.
- FE `/user-profile`: icon xác minh email; khi chưa xác minh — nút «Xác minh email →→» (mutation + mock `mockResendVerificationEmail`, toast demo); mock `emailVerifiedWhenApiMissing` + `forceEmailUnverifiedForTest` trong `mocks/user-profile-verification.mock.ts`.
- FE `/user-profile`: bố cục hai cột (trái: avatar tròn + đặt lại mật khẩu + file ảnh; phải: bảng nhãn/giá trị căn gutter, `hr` giữa khối); `max-w-5xl`, bỏ Card hero một khối.
- FE: `AdminSidebar` / `StaffSidebar` — bấm avatar (menu mở rộng hoặc thu gọn, mobile drawer) điều hướng tới `/user-profile` thay vì mở `AdminProfilePopup` (đồng bộ với `StudentSidebar`).
- FE: sidebar dùng cùng `BrandLogoLockup` variant **`navbar`** như trang home (flex, gap, cỡ mark, typography); bỏ variant `sidebar` / grid. Thu gọn menu: `dense` (mark ~`h-9`/`sm:h-10`).
- Web: script `square-trim-logos.mjs` (`pnpm square:logos`) xử lý mọi PNG trong `image/logo/`: trim, canvas vuông, margin ~3px; `LOGO_MAX_EDGE` mặc định 1024. Sau đó nên chạy lại `favicon:ico`.
- Web: tối ưu logo/favicon — script `optimize-ui-logo.mjs` nén `image/logo/logo_light.png` (cạnh dài tối đa 1600px); `png-to-favicon-ico.mjs` gọn pipeline Sharp, trần prep (`FAVICON_PREP_MAX`), PNG zlib tối đa, `apple-icon` 180px; thêm `pnpm optimize:assets` / `optimize:logo`. `next.config.ts`: ưu tiên định dạng AVIF/WebP cho `next/image`.
- FE notifications (staff + student): realtime toast từ websocket chuyển sang bản tóm tắt; click toast hoặc action `Mở` sẽ mở trực tiếp popup chi tiết của đúng notification trong `SidebarNotificationTray` (giống click item trong panel), đồng thời mark-read nếu đang unread.
- FE notifications UI: panel chuông cải tiến nhẹ (header có summary số mới, item dạng card với nhấn mạnh unread), modal chi tiết thêm badge trạng thái (`Thông báo mới` / `Điều chỉnh vN`).
- FE `/admin/notification`: chuyển ô nội dung sang rich text editor (TipTap) để admin soạn thông báo có định dạng; validate submit dựa trên text thực (không chấp nhận nội dung rỗng chỉ có tag). Feed admin + modal chi tiết staff/student render HTML đã sanitize.
- FE notification typography: tiêu đề thông báo được nhấn mạnh hơn (input tiêu đề trên `/admin/notification` dùng chữ to + đậm khi nhập; tiêu đề khi hiển thị ở list admin và popup chi tiết cũng tăng size/weight để nổi bật).
- FE `/admin/notification` UI/UX tối giản thêm: lược bỏ note dài, thu gọn tiêu đề/copy, giảm padding và bo góc card, rút gọn trạng thái rỗng, và chuyển metadata item sang inline để màn hình gọn hơn.
- FE `/admin/notification` actions chuyển sang icon-only đồng bộ style hệ thống (tạo nháp, sửa, push, push lại, xóa, làm mới, hủy); giữ `aria-label`/`title` để không mất khả dụng.
- FE admin sidebar: thêm `SidebarNotificationTray` (icon chuông + panel/popup chi tiết) ở cụm action dưới cùng, đồng bộ trải nghiệm với staff/student.
- FE popup chi tiết thông báo: co giãn bề rộng theo độ dài nội dung (max trong viewport) để đọc thông báo dài/ngắn tự nhiên hơn.
- FE staff detail income stats (`/admin/staffs/[id]`, `/staff/profile`): đổi bảng số liệu sang card grid; block `Trước khấu trừ` chỉ hiển thị cho admin hoặc role kế toán.
- FE `/admin/classes/[id]` và `/staff/classes/[id]` (teacher/CSKH/admin workspace): bỏ card **Thông tin cơ bản** và dòng mô tả “Chi tiết lớp học…” (admin); thông tin lớp gọn dưới tiêu đề (chip trạng thái/loại + gói, trợ cấp, sĩ số, …); staff giữ đoạn mô tả workspace **dưới** dòng meta.
- FE: Popup thêm/sửa lớp (`AddClassPopup`, `EditClassPopup`, `EditClassBasicInfoPopup`) — học phí chỉ **Tổng gói** + **Số buổi**, không ô học phí/buổi; submit gửi `student_tuition_per_session` làm tròn; `compactTuitionPerSessionLine` chỉ hiện một dòng `…/buổi` khi nhập hợp lệ (thay cho gợi ý dài). UI tối giản: tiêu đề **Thêm lớp** / **Sửa lớp** / **Thông tin lớp**, section nhỏ (Gia sư, Học sinh, Học phí, Lịch), bỏ ghi chú trợ cấp/định dạng giờ dài.
- FE: `StaffSidebar` bỏ mục menu **Thông báo** (đã có chuông + panel); học sinh vốn không có mục này trong `StudentSidebar`.
- FE: Panel + modal thông báo (`SidebarNotificationTray`) portal vào `document.body` để không bị kẹt trong sidebar (ancestor có `transform`); mobile panel full viewport; z-index tách lớp với modal chi tiết.
- Docker: base image `node:20-alpine` → `node:24-alpine` cho `apps/api` và `apps/web` (build/run trong container).
- CI deploy VPS: `appleboy/ssh-action` thêm `command_timeout: 30m`; script deploy đặt `COMPOSE_PARALLEL_LIMIT=1`, `sleep` sau `up` và `NODE_OPTIONS=--max-old-space-size=384` khi chạy `prisma migrate deploy` để giảm OOM / exit **137** trên VPS nhỏ. `docs/Cách làm việc.md` thêm mục troubleshooting 137 + gợi ý swap/RAM.
- BE deploy: `prisma` CLI chuyển từ `devDependencies` sang `dependencies` của `apps/api` để `pnpm deploy --prod` đưa binary vào image Docker; workflow VPS gọi `npx prisma migrate deploy` thay vì `./node_modules/.bin/prisma` (tránh lỗi `stat: no such file` sau khi prune).
- BE/FE: Học phí buổi học giờ áp dụng cho cả trạng thái **Học** (`present`) và **Phép** (`excused`); chỉ **Vắng** (`absent`) mới không tính học phí. Sửa `resolveChargeableAttendanceTuitionFee`, filter chargeable students trong session create/update, và toàn bộ SQL/Prisma aggregate tính doanh thu học phí + 3% trợ lí trên dashboard/staff service. Trợ cấp gia sư (teacher allowance) vẫn chỉ đếm `present`. FE `isChargeableAttendanceStatus` mở rộng cho `excused` trong `SessionHistoryTable` và `AddSessionPopup`.
- FE: Buổi học đã thanh toán (`paid`) hoặc đã cọc (`deposit`): popup chỉnh sửa điểm danh chỉ hiển thị học sinh theo bản ghi attendance đã lưu (kèm tên từ BE), không merge roster lớp hiện tại. Buổi `unpaid` vẫn merge danh sách học sinh lớp.
- BE: API list session (`GET /sessions/class/:id`, `GET /sessions/staff/:id`) trả thêm `attendance[].student.fullName` để FE hiển thị tên học sinh trong buổi đã khóa.
- FE staff shell `staff.assistant`: sidebar thêm mục **Cá nhân** → `/staff/staffs/:ownStaffId`; **Dashboard** trỏ `/staff` (cùng UI dashboard gọn như nhân sự khác); `/staff/dashboard` chỉ còn redirect về `/staff`. Xóa màn dashboard riêng trợ lí (bảng trợ cấp inline) khỏi `/staff` — dùng `/staff/assistant-detail` hoặc trang chi tiết nhân sự cho nội dung sâu hơn.
- FE `/admin/notes-subject` và mirror `/staff/notes-subject` (assistant): tab **Quy định** dùng bảng danh sách + bấm dòng mở **bảng chỉnh sửa** inline (`RegulationsTabPanel`, `RulePostEditTable`); thêm mới vẫn qua popup.
- FE trang chi tiết nhân sự (`/admin/staffs/[id]`, mirror `/staff/staffs/[id]`, `/staff/profile`): `StaffIdentityOverview` đồng bộ UI với các card section (viền/shadow/tiêu đề giống “Thống kê thu nhập”), QR minimal **cùng hàng tiêu đề bên phải** (flex), khối thành tích nền `bg-bg-secondary/40`, parse `specialization` bỏ ngoặc kép bọc ngoài.

### Added

- BE/FE auth: thêm flow bắt buộc thiết lập mật khẩu cho user đăng nhập Google OAuth nếu account tương ứng chưa có `passwordHash`. Backend thêm `POST /auth/setup-password`, mở rộng `GET /auth/profile` và `GET /auth/me` với cờ `requiresPasswordSetup`, re-issue lại cookie sau khi setup thành công, và ghi audit `setup password`. Frontend thêm route `/auth/setup-password`, root auth gate để chặn mọi route đã đăng nhập khi còn thiếu mật khẩu, và redirect tự động từ Google callback sang flow này.
- BE server cache: thêm Postgres-backed dashboard cache service (`apps/api/src/cache/dashboard-cache.service.ts`) dùng bảng `dashboard_cache` cho các read endpoint nặng của admin dashboard (`GET /dashboard`, `GET /dashboard/topup-history`, `GET /dashboard/student-balance-details`) với key theo query params và TTL ngắn; nếu thao tác cache lỗi thì backend vẫn fallback query dữ liệu tươi từ PostgreSQL.
- BE self-service users: thêm endpoint `PATCH /users/me/staff-bonuses` để staff chỉnh `workType`, `month`, `amount`, `note` của khoản thưởng thuộc chính mình; route kiểm tra ownership bằng truy vấn hẹp `id` + `staffId` và không cho tự đổi `status`.
- BE dashboard: thêm endpoint `GET /dashboard/topup-history?month=&year=&limit=` trả lịch sử nạp (topup) trong tháng kèm tổng nạp tích lũy trước/sau mỗi giao dịch để phục vụ popup tra cứu.
- BE dashboard: thêm endpoint `GET /dashboard/student-balance-details?limit=` trả danh sách chi tiết học sinh - lớp - số dư (`account_balance > 0`) cho popup “Nợ học phí chưa dạy”.
- BE class: 4 endpoint PATCH riêng cho từng form cập nhật lớp — `PATCH /class/:id/basic-info`, `PATCH /class/:id/teachers`, `PATCH /class/:id/schedule`, `PATCH /class/:id/students`. Khi form basic-info gửi `allowance_per_session_per_student`, backend đồng bộ toàn bộ `class_teachers.customAllowance` của lớp về giá trị đó.
- Xóa buổi học: bảng lịch sử buổi học có nút xóa (icon thùng rác) trong cột Thao tác; bấm vào hiện confirm, xác nhận thì gọi `DELETE /sessions/:id`, toast và invalidate sessions.
- Chỉnh sửa buổi học đầy đủ: bảng lịch sử buổi học có cột "Thao tác" (khi có `onSessionUpdated`) với nút "Sửa" mở dialog chỉnh sửa ngày học, gia sư phụ trách, giờ bắt đầu/kết thúc, ghi chú (rich text), trạng thái thanh toán, **điểm danh học sinh** (trạng thái Học/Phép/Vắng + ghi chú từng học sinh). Trang lớp truyền `teachers` và `getClassStudents`; trang gia sư truyền `getTeachersForClass(classId)` và `getClassStudents(classId)`. BE: list session trả thêm `attendance`; `PUT /sessions/:id` hỗ trợ `teacherId`, `teacherPaymentStatus`, `attendance`.
- Session notes rich text: bảng lịch sử buổi học (SessionHistoryTable, entityMode=teacher) hiển thị ghi chú dạng HTML đã sanitize (DOMPurify); dialog chỉnh sửa buổi học dùng RichTextEditor (TipTap) cho ghi chú. Popup thêm buổi học dùng RichTextEditor cho ghi chú thay cho textarea. Shared `RichTextEditor` và `sanitizeHtml` (lib/sanitize.ts) dùng chung với notes-subject.
- Trang Ghi chú môn học (`/admin/notes-subject`): 2 tab Quy định và Tài liệu. Tab Quy định cho phép thêm bài post quy định (tiêu đề, mô tả, nội dung TipTap) dùng mock data trong page; Tab Tài liệu hiển thị list contest của group Codeforces, bấm contest hiện list bài (theo thứ tự gốc), bấm bài mở popup chỉnh sửa tutorial.
- Tab Tài liệu (Ghi chú môn học): 3 dòng tài liệu (Luyện tập, Khảo sát, Thực chiến); bấm vào mới load contest của group tương ứng; hiển thị website link đầu mỗi contest; nút "Mở trên CF" dùng custom domain (unicornsedu.contest.codeforces.com, v.v.) thay vì codeforces.com.
- Khi bấm vào contest: mở rộng hiển thị danh sách bài trong contest (theo thứ tự gốc).
- Khi bấm vào bài: mở popup chỉnh sửa tutorial (rich text).
- API proxy Codeforces: `GET /codeforces/doc-groups`, `GET /codeforces/contests?groupCode=`, `GET /codeforces/contests/:contestId/problems` (yêu cầu CODEFORCES_API_KEY, CODEFORCES_API_SECRET).
- API tutorial bài: `GET /cf-problem-tutorial/:contestId/:problemIndex`, `PATCH /cf-problem-tutorial/:contestId/:problemIndex`.
- Model Prisma `CfProblemTutorial` lưu tutorial theo contestId + problemIndex.
- BE `sessions`: thêm endpoint `DELETE /sessions/:id` để xóa session theo id.
- BE lesson: thêm `GET /lesson-task-options?search=&limit=` cho flow đổi task gốc của output; query giữ bounded search với `limit` nhỏ, select tối thiểu và recent-first khi không search để tránh tải danh sách task rộng xuống FE.

### Security

- BE auth/server hardening: thêm global HTTP rate limiting bằng `@nestjs/throttler` ở `AppModule`, bỏ qua health check `GET /`, và cân theo scale ~200 user với default `300 request / 60s / endpoint / IP`. Các route nhạy cảm dùng limit riêng để giảm false positive khi nhiều người dùng chung NAT/proxy: `POST /auth/login` (20/5 phút), `POST /auth/register` (10/giờ), `POST /auth/forgot-password` (5/giờ), `POST /auth/reset-password` (10/giờ), `POST /auth/change-password` (10/30 phút), `GET /auth/verify` (30/giờ), `POST /auth/refresh` (120/phút). Thêm env `THROTTLE_DEFAULT_*` và `TRUST_PROXY` để cấu hình runtime.

### Changed

- FE `/admin/dashboard`: khối **Báo cáo tài chính** chuyển sang card viền nhạt + tiêu đề trái và bảng 3 cột (Danh mục / Giá trị / Ghi chú), 9 dòng tóm tắt nghiệp vụ; bỏ cột nhóm và cụm 3 card tín hiệu phía trên bảng; giá trị **Tổng nạp** và **Nợ học phí chưa dạy** vẫn là link mở popup lịch sử nạp / số dư học sinh.
- FE `/admin/students`: thêm nút xóa (icon thùng rác) ở cuối mỗi dòng học sinh (desktop) với popup xác nhận; gọi `DELETE /student/:id` và tự refresh danh sách sau khi xóa.
- BE staff/student: chặn xóa cứng khi còn dữ liệu liên kết (staff còn `sessions.teacher_id`, student còn `attendance.student_id`), trả lỗi 400 rõ ràng để FE toast thay vì phát sinh lỗi Prisma foreign key (P2003).
- FE `/staff`: section **Thưởng** giờ cho bấm từng dòng để mở popup **Điều chỉnh thưởng** ngay tại chỗ; popup self-service giữ layout add/edit chung, hiển thị `payment status` ở dạng chỉ đọc và chỉ cho staff sửa nội dung thưởng của chính mình.
- FE `/admin/customer_care_detail/[staffId]` và `/staff/customer-care-detail`: tab **Hoa hồng** giờ hiển thị trạng thái thanh toán CSKH theo từng buổi học bằng badge lấy từ `customerCarePaymentStatus`; danh sách chi tiết buổi được đổi sang layout một hàng/ledger thay vì card, vẫn giữ học phí, hệ số CSKH và tiền commission trên cùng dòng.
- BE customer-care: `GET /customer-care/staff/:staffId/students/:studentId/session-commissions` trả thêm `paymentStatus` (fallback `pending` cho record cũ còn `null`) và co hẹp `select` trên truy vấn attendance để chỉ lấy đúng cột cần cho màn chi tiết CSKH.
- FE tab `Công việc` (`/admin/lesson-plans`): thêm tick chọn nhiều + popup cập nhật `paymentStatus` hàng loạt cho bảng **Bài giáo án đã làm**; thanh bulk action chỉ hiện khi có ít nhất 1 item được chọn và dùng cùng UI checkbox minimal/bulk bar của hệ thống.
- FE bulk selection UI: chuẩn hoá checkbox tick (minimal) và bulk action bar chỉ hiện khi có selection cho các bảng lịch sử buổi học (lớp + nhân sự), đồng bộ UX “tick → hiện thanh hành động”.
- FE bulk selection UI: áp dụng cùng behavior “chỉ hiện thanh bulk khi đã chọn” cho các màn thanh toán hàng loạt (Chi phí, Trợ cấp thêm, Giáo án theo nhân sự) và chuẩn hoá checkbox tick theo style minimal dùng chung.
- FE `/admin/classes/:id`: đồng bộ và cải tiến UI/UX vùng **Lịch sử & Khảo sát** theo backup (tab underline, thanh điều khiển tổng buổi + điều hướng tháng + nút thêm), đồng thời bật chọn nhiều buổi để chuyển nhanh trạng thái thanh toán ngay trong tab Lịch sử.
- FE `/admin/lesson-manage-details`: mở rộng khung hiển thị (max width lớn hơn), bỏ block heading mô tả “Quản lí Giáo Án chi tiết…”, và thêm nút **Quay lại** về trang `lesson-plans`.
- FE tab **Giáo Án**: đồng bộ cụm thao tác cột `Link` theo backup với icon **copy / mở liên kết / xóa** trên từng dòng bài (giữ layout cột `Tag | Tên bài | Link`).
- FE `/admin/lesson-plans`: flow chi tiết `LessonOutput` quay về popup dùng chung trong workspace; tab **Công việc**, tab **Giáo Án**, màn hình phóng to và trang task detail đều mở popup ngay tại chỗ thay vì dựa vào route detail riêng.
- FE tab **Giáo Án**: đồng bộ header popup với tab **Công việc** (kicker `Bài giáo án`, title `Chỉnh sửa thông tin bài`, cùng chiều rộng modal) để UI thống nhất.
- FE tab **Giáo Án** popup bài trong chuyên đề: tối ưu lại để dùng chung trực tiếp `LessonOutputEditorForm` (cùng form với tab **Công việc**), không duy trì form chỉnh sửa riêng.
- FE tab **Giáo Án** popup **Thông tin chi tiết bài**: thêm nút **Chỉnh sửa** ở cuối form chi tiết; bấm vào sẽ mở form chỉnh sửa ngay trong popup và lưu bằng API update output.
- FE tab **Giáo Án** popup **Thông tin chi tiết bài**: bổ sung hiển thị thêm **Ngày tạo** và **Người tạo** để form chi tiết đầy đủ hơn khi bấm vào bài trong chuyên đề.
- FE tab **Giáo Án** (tab bài tập cũ): bấm vào dòng bài hoặc tên bài trong danh sách chuyên đề giờ mở popup **Thông tin chi tiết bài** ngay trong tab, không điều hướng sang trang mới.
- FE `/admin/dashboard`: trong bảng **Báo cáo tài chính**, đổi nhãn dòng cuối từ **Tổng niên** thành **Tổng nhận** để đúng wording nghiệp vụ.
- FE `/admin/dashboard`: khối **Cảnh báo & hành động** đồng bộ lại đúng 4 thẻ theo backup (`Học sinh cần gia hạn`, `Chờ thanh toán trợ cấp`, `Lớp chưa báo cáo lần 4`, `Chưa thu học phí`) cùng tone màu riêng cho từng thẻ và style item trong card.
- FE `/admin/dashboard`: đồng bộ lại UI/UX khối **Cảnh báo & hành động** theo màu từng loại cảnh báo (warning/destructive/info/default), card rõ trọng tâm hơn và mỗi dòng cảnh báo có thể bấm để đi tới trang chi tiết tương ứng.
- BE/FE dashboard alerts: mở rộng payload `actionAlerts` với `targetType` + `targetId`; thêm nhóm cảnh báo lớp (`Lớp cảnh báo`) dựa trên `classPerformance.balanceRisk` để hỗ trợ điều hướng sang `/admin/classes/:id`.
- FE `/admin/dashboard`: bấm vào giá trị dòng **Tổng nạp** trong bảng tài chính sẽ mở popup **Lịch sử nạp** theo backup (ngày giờ, học sinh, số tiền nạp, ghi chú, tổng nạp tích lũy trước/sau) theo tháng đang chọn.
- FE `/admin/dashboard`: bấm vào giá trị dòng **Nợ học phí chưa dạy** sẽ mở popup chi tiết theo backup với bảng 3 cột **Học sinh / Lớp / Số dư**.
- FE `/admin/dashboard`: thay 2 ô lọc tháng/chọn tháng bằng thanh hành vi chuyển tháng (nút trước/sau + nhãn tháng hiện tại) để thao tác nhanh hơn.
- FE `/admin/dashboard`: tinh chỉnh lần 2 để bám sát backup hơn (thêm card `Chưa thu` cùng cụm KPI, highlight 2 dòng tài chính trọng tâm, card cảnh báo dạng cột có header màu + danh sách scroll, bỏ cụm summary cuối trang).
- FE `/admin/dashboard`: đồng bộ UI/UX và bố cục theo backup theo hướng tối giản (lọc thời gian + xuất PDF/Excel, dải KPI card, bảng báo cáo tài chính, card cảnh báo & hành động, quick-view theo phân hệ với tab + chọn năm), giữ dữ liệu thật từ `GET /dashboard`.
- Web dependencies: thêm `recharts` cho `apps/web` để sửa lỗi build `Module not found: Can't resolve 'recharts'` ở trang `/admin/dashboard`.
- FE popup `EditStudentPopup` (`/admin/students/:id`): tối giản bố cục form chỉnh sửa hồ sơ học sinh (bỏ bớt mô tả dài, giảm tầng card/bo góc/spacing, giữ nguyên logic cập nhật dữ liệu và các khối CSKH + lịch thi).
- FE `/admin/lesson_plan_detail/[staffId]`: tối giản trang chi tiết giáo án theo staff, chỉ giữ 3 card tổng hợp (**Tổng số bài**, **Đã thanh toán**, **Chưa thanh toán**) và bảng danh sách bài đã làm theo cấu trúc tab `Công việc` (Tag/Level/Tên bài/Trạng thái/Contest/Link), bỏ hero + metadata nhân sự và detail-row mở rộng.
- FE tab **Công việc**: sau khi tạo bài mới sẽ tự mở popup chi tiết của output vừa tạo để chỉnh tiếp ngay tại workspace, không còn điều hướng qua route riêng.
- FE `/admin/lesson-plans/tasks/[taskId]`: ngoài flow tạo resource mới, trang chi tiết task có thêm panel **Đính kèm từ DB** để tìm trực tiếp trong bảng `LessonResources` và gắn/chuyển resource có sẵn sang task hiện tại.
- FE `/admin/lesson-plans/tasks/[taskId]`: bấm vào resource trong trang detail task giờ mở đúng popup `LessonResource` shared giống `/admin/lesson-plans`, thay vì dùng popup detail riêng hoặc bật link trực tiếp từ list.
- FE/BE `/admin/lesson-plans/tasks/[taskId]` + `GET /lesson-resource-options`: sửa lỗi panel search tài nguyên có thể trả rỗng sai khi resource chưa gắn task; query backend giờ giữ lại standalone resources và FE hiển thị trạng thái lỗi/retry rõ ràng nếu API search thất bại.
- FE/BE `/admin/lesson-plans/tasks/[taskId]`: thêm thao tác **Gỡ khỏi task** ngay trên từng resource card; FE gọi `PATCH /lesson-resources/:id` với `lessonTaskId = null` để trả resource về thư viện chung mà không xóa bản ghi.
- FE `LessonTagPicker`: dropdown tag chuyển sang render bằng portal theo vị trí input, nên có thể tràn ra ngoài popup/modal mà không bị clip; popup tạo/chỉnh sửa lesson resource trong `/admin/lesson-plans` hưởng luôn UX này.
- FE popup **Chỉnh sửa thông tin bài** (tab Công việc) đồng bộ lại theo backup: bố cục 2 cột gọn, field tiếng Việt theo thứ tự nhập liệu thực tế (Tên bài, Link gốc, Tên gốc/Nguồn, Tag/Level, Ngày + Checker/Code + Chi phí, Trạng thái, Contest, Link), giữ UX tag picker và thao tác lưu nhanh tại chỗ.
- FE tab **Công việc**: bấm vào dòng trong bảng “Bài giáo án đã làm” giờ mở popup **Chỉnh sửa thông tin bài** ngay trong trang (load chi tiết theo `lesson-output id`, cập nhật bằng `PATCH /lesson-outputs/:id`), giúp chỉnh sửa nhanh không cần rời tab.
- FE `LessonWorkAddLessonForm` (Thêm bài mới): tối giản bố cục theo hướng compact (giảm tầng card/spacing, rút gọn phần tag nhanh và helper text) để nhập liệu nhanh hơn trong tab Công việc.
- FE tab **Công việc**: bảng “Bài giáo án đã làm” đồng bộ lại theo backup (layout gọn, cột checkbox · Tag · Level · Tên bài · Trạng thái thanh toán · Contest · Link; cụm icon copy/mở/xóa bên phải).
- FE tag filter picker: cho phép chọn liên tục nhiều tag (multi-select chips) như backup; BE `GET /lesson-work` cập nhật filter `tag` hỗ trợ nhiều term phân tách bằng dấu phẩy/chấm phẩy.
- FE **Bộ lọc nhanh** (tab Công việc/Giáo Án): trường Tag chuyển sang picker UI/UX giống form thêm bài (dropdown nhóm level + search + chọn trực tiếp), đồng bộ thao tác với backup.
- FE tag picker (`LessonTagPicker`): nhóm **KHÁC** ở cuối list giờ hiển thị toàn bộ tag mới đã từng được thêm (lưu local), đúng flow backup khi chọn tag cũ/tag mới.
- FE tag UX trong form **Thêm bài mới** (Giáo án): chọn tag cũ qua dropdown nhóm level theo backup, mỗi tag có icon, và thêm tag mới ngay trong form bằng Enter/nút **Thêm** trước khi submit.
- FE lesson forms (`LessonWorkAddLessonForm`, `LessonOutputEditorForm`): UI/UX chọn tag đồng bộ backup bằng dropdown list phân nhóm `LEVEL 0..5` + `KHÁC`, hỗ trợ tìm kiếm và chọn trực tiếp nhiều tag.
- FE `/admin/lesson-plans` tab **Công việc** + tab **Giáo Án**: tối giản UI khối **Bộ lọc nhanh** và **Thêm bài mới** (ẩn mặc định, bấm mới mở), bỏ các đoạn ghi chú/phụ đề dài để form gọn hơn; icon phóng to ở tab **Giáo Án** đổi sang style hiện đại (outline + subtle motion).
- FE `/admin/lesson-plans` tab thứ 3 đổi tiêu đề thành **Giáo Án**; thêm icon phóng to ở góc header để mở `/admin/lesson-manage-details` (bản quản lí chi tiết/phóng to của cùng dataset), và có nút thu gọn quay về tab trong workspace.
- FE `/admin/lesson-plans` tab **Giáo Án** (`LessonExercisesTab`): thay placeholder — sidebar Level 0–5, bộ lọc nhanh (`ex*`), bảng Các bài đã làm (Tag · Tên bài · Link), cùng API `GET /lesson-work`; BE `GET /lesson-work`: thêm query `level` (`0`…`5`); response mỗi output thêm `originalLink` (fallback link).
- FE `/admin/lesson-plans` tab **Công việc**: **Bộ lọc nhanh** + **Thêm bài mới** (`LessonWorkAddLessonForm` — 4 khối card, lưới cặp trường + hàng 3 cột ngày/thanh toán/chi phí, Checker/Code trong “Gắn tag nhanh”; map thanh toán → `cost`; không task/nhân sự trên UI) + bảng “Bài giáo án đã làm”. BE `GET /lesson-work` (lọc tháng/ngày/search/…); `POST /lesson-outputs` với `lessonTaskId`/`staffId` có thể `null`.
- FE `/admin/lesson-plans` tab Tổng quan: bảng **Tài nguyên** tối giản — bỏ mô tả dưới tiêu đề section; bảng chỉ cột Tài nguyên / Link / Tag (+ thao tác), bỏ cột Cập nhật và mô tả trong ô; bảng **Công việc** bỏ mô tả dưới tiêu đề và không hiển thị mô tả dưới tiêu đề từng dòng.
- FE `/admin/lesson-plans`: thanh tab **Tổng quan / Công việc / Bài tập** full width trong khối nội dung, ba nút chia đều (`flex-1`), tăng chiều cao và padding; bỏ `sm:w-fit` + `sm:flex-none` để không còn thanh pill quá hẹp trên desktop.
- Refresh docs cho trạng thái repo hiện tại: cập nhật `README.md`, `apps/web/README.md`, `docs/README.md`, `docs/Cách làm việc.md`, `docs/pages/README.md` và `docs/pages/admin.md` để phản ánh đúng route đang có, command `pnpm --filter ...`, API port/env note, và snapshot review ngày `2026-03-16`.
- FE `/admin/classes/:id`: 4 form chỉnh sửa (thông tin cơ bản, gia sư, khung giờ, học sinh) gọi lần lượt `updateClassBasicInfo`, `updateClassTeachers`, `updateClassSchedule`, `updateClassStudents` thay vì một `updateClass` chung.
- FE `/admin/classes`: thêm phân trang theo `page` query param (Trước/Sau), reset `page=1` khi đổi search/type, đồng bộ lại `page` từ `meta.page` backend và hiển thị phạm vi kết quả hiện tại.
- FE `/admin/classes/:id`: nút `+ Thêm buổi học` ở tab Lịch sử đã mở popup form tạo session (ngày học, gia sư, thời gian, ghi chú, điểm danh học sinh) và submit qua `POST /sessions`.
- FE `/admin/classes/:id`: thay dữ liệu học sinh mock bằng dữ liệu thật `students` từ `GET /class/:id` để hiển thị bảng học sinh và làm nguồn điểm danh trong popup.
- BE `GET /class/:id`: trả thêm `students` (id, fullName, status, remainingSessions) lấy từ `student_classes` + `student_info`.
- FE popup thêm session: siết validation độ dài ghi chú (`notes`, `attendance.notes`) và chuẩn hóa thông báo lỗi theo hướng generic để tránh lộ lỗi nội bộ từ backend.
- Cập nhật `.env.example`: thêm 3 nhóm tài liệu (CODEFORCES_GROUP_LUYEN_TAP, CODEFORCES_GROUP_KHAO_SAT, CODEFORCES_GROUP_THUC_CHIEN) và 3 website (CODEFORCES_WEBSITE_LUYEN_TAP, CODEFORCES_WEBSITE_KHAO_SAT, CODEFORCES_WEBSITE_THUC_CHIEN).
- FE `/admin/notes-subject`: harden phần render bài Quy định bằng sanitize HTML trước khi `dangerouslySetInnerHTML`; popup tutorial xử lý rõ trạng thái lỗi tải dữ liệu và tránh reset form khi React Query refetch trong lúc đang nhập.
- FE `/admin/notes-subject`: redesign layout theo chuẩn các trang admin khác (wrapper có margin, border, surface card); tab Tài liệu cập nhật tương tác tutorial thành 2 mode: view-mode khi bấm vào dòng bài, edit-mode khi bấm nút `Chỉnh sửa`.
- FE `/admin/staff/:id`: bảng "Lớp phụ trách" đã render dữ liệu `classAllowance` từ API (Tổng nhận / Chưa nhận / Đã nhận) theo từng lớp thay cho giá trị hardcode 0.
- FE: thêm API client `session.api.ts` + DTO `session.dto.ts`; tái sử dụng component `SessionHistoryTable` để hiển thị lịch sử session ở cả `/admin/classes/:id` và `/admin/staff/:id`.
- FE `/admin/classes/:id`: tab Lịch sử đã lấy dữ liệu thật từ `GET /sessions/class/:classId?month=&year=` (TanStack Query), lọc theo tháng ở backend và hiển thị trạng thái timeline (Đã hoàn thành/Đã lên lịch).
- FE `/admin/staff/:id`: thêm card riêng "Lịch sử buổi học" dùng `GET /sessions/staff/:staffId?month=&year=` với điều hướng tháng (prev/next).
- FE `/admin/staff/:id`: phần Tổng tháng/Chưa nhận/Đã nhận và Tổng năm đã dùng dữ liệu thật từ session API (tháng hiện chọn + tổng hợp 12 tháng trong năm).
- FE admin detail pages (`/admin/classes/:id`, `/admin/staff/:id`): thay trạng thái loading text bằng skeleton loading cho bảng lịch sử session và phần khung chi tiết.
- FE `SessionHistoryTableSkeleton`: chuẩn hoá conditional rendering theo `entityMode`; bỏ phụ thuộc vào cờ hiển thị riêng để tránh lệch cột/header khi đổi mode.
- BE `CodeforcesService`: thay cơ chế gọi Codeforces API từ `https.get` sang `@nestjs/axios` (`HttpService.axiosRef`) để đồng bộ HTTP client trong backend và đơn giản hoá parsing response JSON.
- BE `sessions`: cập nhật DTO create/update theo shape attendance từ FE (không yêu cầu `sessionId`/`attendance.id` trong payload), parse/validate date-time rõ ràng hơn, và update attendance theo cơ chế sync (upsert + delete bản ghi không còn trong payload) thay vì xóa toàn bộ rồi tạo lại.

### Fixed

- Docker Compose production: pin `api.PORT=4000` và `web.PORT=3000` ngay trong `docker-compose.prod.yml` vì cả hai service cùng dùng chung `.env`; tránh việc `PORT=4000` của backend override Next.js khiến container `web` listen ở `4000` còn Nginx vẫn proxy sang `web:3000` và phát sinh 502.
- Nginx (`nginx/conf.d/app.conf`): thêm exact-match redirect `location = /api { return 301 /api/; }` để `GET /api` không rơi xuống `location /` và trả HTML của Next.js; với proxy đang strip prefix, verify backend bằng `GET /api/` (kỳ vọng `Hello World!`) hoặc mở Swagger tại `/api/api`.
- Nginx (`nginx/conf.d/app.conf`): bỏ khối `upstream` tĩnh, dùng `resolver 127.0.0.11` + `proxy_pass` qua biến (`web`/`api`) để Docker DNS cập nhật IP sau khi recreate container — tránh 502 `connect() failed (111: Connection refused)` tới IP cũ (ví dụ `172.18.0.3:3000`). `server_name` đổi thành `_` để truy cập bằng IP không bị lệch virtual host.
- Docker API: copy `prisma.config.ts` vào image production (cùng `WORKDIR /app`). Prisma 7 lấy `datasource.url` từ file này (`process.env.DATABASE_URL`); thiếu file khiến `prisma migrate deploy` trên VPS báo `The datasource.url property is required in your Prisma config file` dù đã có `--schema`.
- Docker API/Web: sau khi `COPY` vào image, chạy `chown -R appuser:appgroup /app` để tiến trình không-root ghi được dưới `node_modules` (Prisma cần ghi thư mục `@prisma/engines`). Tránh lỗi deploy `Can't write to ... @prisma/engines please make sure you install "prisma" with the right permissions`.
- FE popup xem tutorial Codeforces (`ProblemTutorialPopup`): HTML từ TipTap được chuyển sang chuỗi markdown trước `react-markdown` + KaTeX (`lib/tutorial-markdown.ts`), không còn hiển thị literal thẻ `<p>` / `</p>` khi xem nội dung đã lưu dạng HTML.
- FE `/admin/lesson-plans`: sửa type error của `LessonWorkQuickFilters`/output detail để `pnpm --filter web exec tsc --noEmit` pass lại; form chi tiết output giờ chỉnh sửa được cả output chưa gắn task; title cell ở tab **Công việc** và **Bài tập** trở thành link focus được bằng bàn phím; form **Thêm bài mới** hỗ trợ đủ Level `0`–`5`.
- BE `GET /lesson-work`: gộp summary counts theo `groupBy(status)` thay cho nhiều lần `count` lặp lại; bổ sung index cho `lesson_outputs` theo `date`, `(status, date)`, `(staff_id, date)`, `updated_at`; `PATCH /lesson-outputs/:id` giờ chấp nhận `lessonTaskId: null` để detach output khỏi task.
- BE: xóa `console.log(month, year)` debug trong `SessionController` để tránh log nhiễu ở môi trường runtime.
- BE: đăng ký lại `CodeforcesModule` và `CfProblemTutorialModule` trong `AppModule` để các endpoint Codeforces/tutorial hoạt động ổn định sau merge.
- BE `GET /staff/:id`: sửa truy vấn tổng hợp `classAllowance` dùng đúng `staff id` động thay cho teacher id hardcode; đồng thời trả `404` khi không tìm thấy staff.
- BE `sessions`: controller đã forward đủ `month/year` cho cả endpoint class/staff; service validate `month/year` và sửa date-range theo chuẩn `[startOfMonth, startOfNextMonth)` để không mất dữ liệu ngày cuối tháng.
- BE `sessions`: thêm validate attendance payload để trả lỗi 400 cho dữ liệu không hợp lệ/`studentId` trùng lặp thay vì phát sinh lỗi runtime.
- BE `sessions`: siết validate định dạng `startTime`/`endTime` theo `HH:mm` hoặc `HH:mm:ss` để chặn giá trị giờ/phút/giây ngoài phạm vi hợp lệ.

---

## [0.0.0] – Khởi tạo

- Changelog và rule ghi log trước khi push.
