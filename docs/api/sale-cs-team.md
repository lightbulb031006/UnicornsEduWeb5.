# Sale & CSKH team API (Trưởng phòng quản lý đội, #271)

Module: `apps/api/src/sale-cs-team/`. Controller `@Controller('sale-cs-team')`, `@Roles(UserRole.staff)` — route **staff-side**, không phải route admin, nên không đụng allowlist `admin-deny-by-default.spec.ts`. Nguồn nghiệp vụ: biên bản họp 12/11/2026 mục 9 (`docs/meetings/2026-11-12-bien-ban.md`).

## Quyền

`SaleCsTeamService.resolveHead`: người gọi phải có `staffInfo` `active` mang role `sale_customer_care_head` (`hasSaleCsHeadAccess`); ngược lại `403` «Chỉ Trưởng phòng Sale & CSKH được dùng chức năng này.». Admin không có role Trưởng phòng cũng `403` (Admin dùng màn quản trị nhân sự riêng). Có thể có nhiều Trưởng phòng; mọi Trưởng phòng thấy cùng một đội.

Luật trên từng nhân sự đích nằm ở `apps/api/src/staff/sale-cs-head-role-policy.ts` (test `sale-cs-head-role-policy.spec.ts`):

| Thao tác | Được phép khi | Bị chặn (`403`) |
|---|---|---|
| Bật/tắt role | Đích không phải chính mình, không phải tài khoản `roleType=admin`, không mang role trưởng/Admin (`PRIVILEGED_STAFF_ROLES`: `admin`, `sale_customer_care_head`, `training_head`, `lesson_plan_head`); payload chỉ đổi `sale`/`customer_care` | Tự sửa, Admin, người có role trưởng, payload thêm/bớt role khác |
| Khoá / mở khoá tài khoản | Như trên **và** đích chỉ mang `sale` và/hoặc `customer_care` | Đích kiêm bất kỳ role nào khác (gia sư, kế toán…) |
| Sửa hồ sơ chuyên môn | Như bật/tắt role **và** đích là thành viên đội (có `sale` hoặc `customer_care`) | Ngoài đội, role trưởng, Admin |
| Đổi tên đăng nhập (16/11) | Như khoá tài khoản (tên đăng nhập là của cả tài khoản) | Như khoá tài khoản |

Mỗi dòng trả về kèm `permissions { canEditRoles, canLockAccount, canEditProfile, canEditAchievements, canEditAccountHandle }` tính bằng cùng hàm policy, web chỉ hiện nút theo cờ này; backend vẫn chặn lại khi gọi.

## Field allowlist

`MEMBER_SELECT` tường minh, không `include`. Trả về: `id`, `fullName`, `lastName`, `firstName`, `avatarUrl` (signed), `roles`, `status`, `accountLocked` (`users.status = inactive`; `null` nếu chưa có tài khoản), `university`, `highSchool`, `customerCareDefaultProfitPercent` (chỉ đọc), `managedBy`, `customerCareStudentCount`, `province` (`users.province`, cột «Tỉnh» như `/admin/staffs`), `achievementCount` (`_count.achievements`, nút «Xem thành tích»), `permissions`.

Chi tiết (`GET /sale-cs-team/members/:staffId`, cũng là response của `professional-profile`) dùng `MEMBER_DETAIL_SELECT` = allowlist trên + `accountHandle`, `googleMeetLink` (`staff_info.google_meet_link`), phục vụ card **Hồ sơ nhân sự** giống `/admin/staffs/:id`. Danh sách không trả 2 field này. Web: danh sách ở `/staff/staffs` (`SaleCsTeamStaffList`, bố cục `/admin/staffs`), hồ sơ thành viên ở `/staff/staffs/:id` (`HeadStaffDetailPage`); route cũ `/staff/sale-cs-team` và `/staff/sale-cs-team/:staffId` đã xoá. Thưởng qua `StaffBonusViewCard` (`source="saleCsTeam"`).

**Không bao giờ trả:** email, SĐT, CCCD, ngày sinh, giới tính, dân tộc, địa chỉ, ngân hàng/QR, lương/trợ cấp riêng, số tiền hoa hồng.

## Endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | `/sale-cs-team/members` | Danh sách. Query: `page`, `limit`, `search` (tên), `role` (`sale`\|`customer_care`), `status` (`active`\|`inactive`), `scope` (`members` mặc định \| `candidates`). `candidates` = nhân sự **chưa** thuộc đội, loại người mang role trưởng/Admin và tài khoản admin, **chỉ nhân sự đang hoạt động** (bỏ qua `status`) — dùng để bật role Sale/CSKH cho người mới. |
| GET | `/sale-cs-team/members/:staffId` | Chi tiết thành viên đội (`SaleCsTeamMemberDetailDto`: allowlist + `accountHandle`, `googleMeetLink`); `404` nếu không thuộc đội. |
| GET | `/sale-cs-team/members/:staffId/achievements` | Thành tích của thành viên (`AchievementService.listStaffAchievements`, cùng shape `/staff/:staffId/achievements`). `404` nếu không thuộc đội. |
| POST | `/sale-cs-team/members/:staffId/achievements` | Thêm thành tích (multipart, `title` + `image` tuỳ chọn). |
| PATCH | `/sale-cs-team/members/:staffId/achievements/:achievementId` | Sửa tiêu đề / `sortOrder`. |
| DELETE | `/sale-cs-team/members/:staffId/achievements/:achievementId` | Xoá (kèm ảnh). |
| PUT | `/sale-cs-team/members/:staffId/achievements/reorder` | Sắp xếp (`orderedIds` đủ bộ). |
| PUT | `/sale-cs-team/members/:staffId/achievements/:achievementId/highlight` | Gắn sao thành tích nổi bật (gỡ sao dòng cũ). |
| POST / DELETE | `/sale-cs-team/members/:staffId/achievements/:achievementId/image` | Tải/thay · gỡ ảnh minh chứng. |
| GET | `/sale-cs-team/members/:staffId/sale-allowances` | Trợ cấp sale (`extra_allowances.role_type = sale`): `id`, `month`, `note`, `createdAt`, `student { id, fullName }`. **Không** có `amount` / `status` / thuế. Query `month` (`YYYY-MM`, bỏ trống = mọi tháng; sai định dạng `400`). |
| GET | `/sale-cs-team/members/:staffId/bonuses` | Thưởng có **số tiền**: `id`, `workType`, `amount`, `status`, `note`, `month`, `date`, `createdAt` (ISO, thời điểm tạo — card «Thưởng tháng» hiện giờ tạo như admin). Chỉ đọc — không có endpoint tạo/sửa. Query `month` như trên. |
| PATCH | `/sale-cs-team/members/:staffId/roles` | Body `{ roles: ("sale"\|"customer_care")[] }` = trạng thái đích của 2 role; role khác giữ nguyên. `400` nếu không còn role nào. Tắt `customer_care` → **gỡ gán mọi học sinh** người đó đang chăm sóc (xoá `customer_care_service`) trong cùng transaction với lệnh ghi role (follow-up 13/11 mục 2.1; trước đây `400` «còn học sinh»); bật lại không khôi phục; `attendance` đã ghi (CSKH, hệ số, hoa hồng trưởng phòng) giữ nguyên, buổi mới của học sinh chưa gán không sinh hoa hồng CSKH / trưởng phòng. Tắt role → xoá mức đè lương cứng của role đó (`syncStaffRoleOverridesInTx`). Ghi `action_history` (before/after kèm `customerCareStudentCount`), xoá cache auth của đích. Trả `{ id, roles, releasedCustomerCareStudentCount }`. |
| PATCH | `/sale-cs-team/members/:staffId/account-status` | Body `{ locked: boolean }` → `users.status` `inactive`/`active`. Ghi `action_history`, xoá cache auth (phiên đang mở bị chặn ngay). `400` nếu nhân sự chưa có tài khoản. |
| PATCH | `/sale-cs-team/members/:staffId/account-handle` | Body `{ accountHandle }` (3–50 ký tự, không khoảng trắng / `@`, không trùng — luật chung `src/user/account-handle.ts`). Đổi `users.account_handle`, ghi `action_history` (entity `staff`), xoá cache auth; không đăng xuất thiết bị. `400` sai định dạng / trùng / chưa có tài khoản; `403` ngoài phạm vi. Trả `{ id, accountHandle }`. |
| PATCH | `/sale-cs-team/members/:staffId/professional-profile` | Body `{ lastName?, firstName?, university?, highSchool? }`. Field khác bị `ValidationPipe` loại. Tên trống `400`. Trả lại chi tiết thành viên. |
| POST | `/sale-cs-team/members/:staffId/avatar` | Multipart `avatar` (JPG/PNG/WebP ≤ 5 MB). Đổi ảnh đại diện nhân sự dưới cấp, cùng phạm vi `professional-profile` (`permissions.canEditProfile`). Lưu bản gốc (bucket private) + bản watermark (bucket public) qua helper chung `uploadUserAvatarFiles` (`src/storage/user-avatar-upload.ts`, dùng chung với `/training/tutors/:id/avatar`), cập nhật `users.avatar_path` / `avatar_watermarked_path`, ghi `action_history`, xoá cache auth. `400` thiếu ảnh / sai định dạng / nhân sự chưa có tài khoản; `403` ngoài phạm vi. Trả lại chi tiết thành viên. |

## Quyền liên quan ngoài module

- **% CSKH mặc định** (`staff_info.customer_care_default_profit_percent`): chỉ Admin sửa (route admin quản lý nhân sự). Trưởng phòng chỉ xem.
- **Tạo nhân sự** (14/11, sửa 15/11 → `POST /users/staff`): Trưởng phòng nhập thẳng tài khoản mới (email, tên đăng nhập, mật khẩu) + hồ sơ; gán mọi role trừ Admin / role trưởng, không đặt %. Không tìm / gắn vào user có sẵn. Web: nút **Tạo nhân sự** trên `/staff/staffs`. Chi tiết: `docs/pages/admin.md`.
- **Giao / chuyển CSKH và % của từng học sinh** (`PATCH /student/:id` với `customer_care_staff_id`, `customer_care_profit_percent`): Admin hoặc Trưởng phòng. Trưởng phòng **không** được đặt % khi CSKH đích là chính mình (luật không tự sửa thu nhập #265). CSKH/Sale thường `403`.
- **Trạng thái thanh toán hoa hồng trưởng phòng** (`PATCH /assistant-commission/payment-status*`): từ #271 chỉ Admin hoặc Kế toán chi; Trưởng phòng `403`, kể cả với hoa hồng của chính mình.
- **Hoa hồng trưởng phòng**: khi tạo/sửa buổi học, `attendance.sale_cs_head_staff_id` (cột `assistant_manager_staff_id`) chỉ snapshot người quản lý CSKH (`customer_care_managed_by_staff_id`) nếu người đó **còn** role Trưởng phòng (`resolveSaleCsHeadManagerId`). Mỗi Trưởng phòng chỉ ăn nhóm CSKH mình quản lý. Buổi đã ghi trước đó không bị tính lại.

## Sửa thành tích nhân sự dưới cấp

Trưởng phòng sửa thành tích **như Admin** (editor `kind: 'other'`: không ràng buộc minh chứng, ghi `action_history` trừ sắp xếp) qua các route ghi ở trên — giống Ban Đào Tạo ở `/training/tutors/:id/achievements/*`.

- `SaleCsTeamService.resolveAchievementEditor`: `resolveHead` → `findTarget` (`404` nếu không có nhân sự) → `assertSaleCsHeadCanEditAchievements` → `AchievementService.resolveOtherStaffAchievementEditor`.
- «Dưới cấp» = cùng phạm vi sửa hồ sơ chuyên môn (`canSaleCsHeadEditProfile`): target mang role `sale` / `customer_care` (kể cả kiêm role khác), **không** phải chính mình, tài khoản Admin hay nhân sự mang role trưởng. Ngoài phạm vi → `403` («Chỉ được sửa thành tích của thành viên đội Sale & CSKH.» / «Không được sửa thành tích của Admin hoặc nhân sự mang role trưởng.» / «Không thể tự sửa thành tích của chính mình.»).
- Danh sách / chi tiết trả `permissions.canEditAchievements` (cùng hàm policy); web bật editor trong `StaffAchievementsDialog` (danh sách `/staff/staffs`) và card **Thành tích** trên `/staff/staffs/:id` theo cờ này.
