# ADR: Thứ tự chuyên đề theo lớp; gỡ chuyên đề ẩn cả lần giao; bỏ sắp xếp tay timeline

- **Status:** Accepted
- **Date:** 2026-10-05
- **Amends:** quyết định "gỡ chuyên đề giữ lần giao tiết thực hành" của `docs/adr/2026-10-02-class-content-by-module.md`
- **Reverses:** sắp xếp tay timeline lớp (#98, 07/09/2026)

## Context

Trang lớp admin/staff gom chuyên đề và timeline buổi học vào một khối cuộn chung. Người dùng muốn tách thành hai tab như phía học sinh: tab **Buổi học** quay về lịch sử theo tháng (bảng), tab **Chuyên đề** kéo-thả được và học sinh thấy đúng thứ tự đó.

Thứ tự nhóm chuyên đề lúc đó lấy từ `modules.sort_order`, là thứ tự **cấp khoá**, mọi lớp của khoá dùng chung. Gỡ chuyên đề thì ẩn tiết lý thuyết nhưng giữ lần giao tiết thực hành, nên nhóm đã gỡ vẫn hiện (badge «Đã gỡ khỏi lớp») ở cả staff lẫn học sinh.

## Decision

1. **Thứ tự nhóm là của từng lớp.** Cột `class_modules.sort_order`. Thứ tự ban đầu (backfill) theo `modules.sort_order`. Chuyên đề vừa thêm (kể cả gỡ rồi thêm lại) lên **đầu**. Sắp lại không đụng `modules.sort_order`.
2. **Gỡ chuyên đề = coi như chưa từng thêm.** Nhóm biến mất ở mọi phía. Ẩn mềm cả tiết lý thuyết lẫn lần giao tiết thực hành của chuyên đề (bài làm, điểm giữ nguyên). Mỗi item ẩn mang lý do (`manual` / `module_removed`); thêm lại chuyên đề chỉ khôi phục item ẩn do gỡ, item gia sư tự ẩn vẫn ẩn. Gỡ không bị chặn; dialog xác nhận báo số bài tự luận chưa chấm và số học sinh đang làm dở.
3. **Bỏ sắp xếp tay timeline.** Gỡ UI kéo-thả, `POST /class/:id/timeline/reorder` và cột `classes.timeline_custom_order`. Timeline học sinh luôn theo thời gian, mới nhất trên. Lúc quyết định, 0/162 lớp (dump prod 05/10) từng lưu thứ tự tay nên không mất dữ liệu.

## Considered options

- **Ghi thứ tự kéo vào `modules.sort_order`:** loại, vì sắp một lớp làm đổi mọi lớp cùng khoá.
- **Giữ nhóm đã gỡ ở cuối, không kéo được:** loại, người dùng muốn gỡ là hết.
- **Chặn gỡ khi còn lần giao / bài chưa chấm:** loại, gây kẹt thao tác; cảnh báo là đủ, thêm lại chuyên đề vẫn chấm tiếp được.
- **Khôi phục mọi item ẩn khi thêm lại** (cách cũ của tiết lý thuyết): loại, lần giao gia sư cố ý ẩn sẽ tự hiện cho học sinh.
- **Giữ endpoint reorder timeline cho sau này:** loại, không còn UI gọi tới.

## Consequences

- Sau khi gỡ, trang **Chấm bài** của lần giao thuộc chuyên đề đó không còn đường vào từ trang lớp cho tới khi thêm lại.
- Lớp đã gỡ chuyên đề trước ADR này: migration ẩn luôn lần giao của chuyên đề không còn trong `class_modules` (lý do `module_removed`), để dữ liệu cũ khớp quy tắc mới.
- Rollback: drop `class_modules.sort_order` và cột lý do ẩn; lần giao bị migration ẩn phải bỏ cờ ẩn bằng tay. Cột `timeline_custom_order` thêm lại với mặc định `false`.
