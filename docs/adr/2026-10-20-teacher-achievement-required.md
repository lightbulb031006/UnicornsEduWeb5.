# ADR: Gia sư (`teacher`) bắt buộc có ít nhất 1 thành tích để hồ sơ nhân sự được coi là đủ

- **Status:** Accepted
- **Date:** 2026-10-20
- **Supersedes (một phần):** `docs/adr/2026-08-11-achievement-gate-and-legacy-columns.md` — quyết định 1 ("Achievement không còn trong gate `staffProfileComplete`"), chỉ với staff role `teacher`. Quyết định 2 (giữ cột legacy) không đổi.

## Context

ADR 2026-08-11 bỏ thành tích khỏi gate vì coi đó là mục giới thiệu tự nguyện. Thực tế **Chuyên môn (gia sư)** chính là danh sách thành tích, và Ban Đào Tạo dựa vào đó để ghép gia sư theo chuyên môn; gia sư không khai thành tích nào thì Ban Đào Tạo không có dữ liệu để ghép. Vận hành yêu cầu mọi gia sư phải có ít nhất 1 thành tích, chưa có thì chuyển sang trang hồ sơ.

## Decision

1. Nhân sự có staff role `teacher` mà có 0 `StaffAchievement` thì `staffProfileComplete = false` (`hasRequiredStaffAchievements` trong `apps/api/src/auth/auth-access.service.ts`). Các gate có sẵn (`proxy.ts`, `StaffAccessGate`, staff vào `/admin`) tự đưa người đó về `/user-profile?profile_required=1&from=...`.
2. Role khác (kể cả admin đầy đủ, vốn bypass gate) không bị yêu cầu thành tích.
3. Thành tích **thiếu minh chứng** vẫn được tính — điều kiện chỉ là số dòng ≥ 1.
4. `GET /users/me/full` trả thêm `staffInfo.achievementCount`; web dùng chung `lib/staff-achievement-requirement.ts` cho form hồ sơ (`validateProfileForm` báo thiếu tại khối Thành tích), `proxy.ts` và `staff-shell-access.ts`.

## Considered options

- **Chỉ nhắc (banner/checklist), không chặn**: hướng ADR cũ gợi ý — bị loại vì yêu cầu vận hành là bắt buộc.
- **Áp cho mọi staff**: bị loại; thành tích là chuyên môn của gia sư, role vận hành không cần.

## Consequences

- Gia sư xoá thành tích cuối cùng sẽ bị gate chặn ở lần điều hướng sau và quay về trang hồ sơ.
- Thêm/xoá thành tích ở `/user-profile` phải refresh `GET /auth/session` + cache full profile (đã làm trong `AchievementListEditor`, owner `staff/self`), nếu không gate client sẽ stale.
