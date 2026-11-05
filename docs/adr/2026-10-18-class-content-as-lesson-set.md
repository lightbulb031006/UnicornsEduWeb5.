# ADR: Nội dung lớp là tập tiết học; thêm chuyên đề chốt một lần, kèm tiết thực hành

- **Status:** Accepted
- **Date:** 2026-10-18
- **Supersedes:** quyết định "lớp thêm nội dung theo chuyên đề, không thêm lẻ tiết lý thuyết" của `docs/adr/2026-10-02-class-content-by-module.md`
- **Amends:** quyết định "gỡ chuyên đề = coi như chưa thêm" của `docs/adr/2026-10-05-class-module-order-and-removal.md` (nay áp cho cả từng tiết)

## Context

Trước đây lớp thêm **chuyên đề**. Tiết lý thuyết đi theo chuyên đề như liên kết sống: tiết khoá thêm về sau tự hiện trên lớp. Tiết thực hành phải giao riêng từng tiết, và chỉ giao được trong chuyên đề lớp đã thêm. Gia sư cần chọn lẻ từng tiết (lý thuyết lẫn thực hành), kể cả tiết của chuyên đề lớp chưa thêm. Gia sư cũng muốn thêm chuyên đề thì tiết thực hành vào lớp luôn.

## Decision

- **Nội dung lớp** là tập tiết học của khoá mà lớp đã thêm. Chuyên đề trên lớp chỉ là nhóm hiển thị: tự hiện khi lớp có tiết đầu tiên của nó, biến mất khi tiết cuối bị gỡ. Nhóm mới đứng đầu danh sách.
- Gia sư thêm lẻ một tiết lý thuyết hoặc thực hành của bất kỳ chuyên đề nào trong khoá. Tiết thực hành thêm vào thì thành **lần giao**.
- **Thêm cả chuyên đề** đưa một lượt mọi tiết lý thuyết và thực hành **đang có** vào lớp. Mỗi tiết thực hành thành một lần giao: mở bài lúc thêm, hạn làm bài mặc định = Hạn xem nội dung của lớp. Thêm là **chốt một lần**: tiết khoá thêm vào chuyên đề về sau không tự hiện trên lớp.
- **Gỡ khỏi lớp** áp cho một tiết hoặc cả chuyên đề. Tiết biến mất ở mọi phía, kể cả lần giao. Lượt xem, bài làm và điểm vẫn giữ. Thêm lại thì tiết hiện lại; tiết đang Ẩn vẫn ẩn. Dialog xác nhận báo số bài tự luận chưa chấm và số học sinh đang làm dở.
- **Ẩn** vẫn là thao tác riêng, khác Gỡ khỏi lớp.

## Considered options

- **Giữ liên kết sống, chỉ thêm khả năng thêm lẻ:** lớp vừa có chuyên đề sống vừa có tiết lẻ. Khó giải thích khi gỡ một tiết của chuyên đề sống (tiết đó có quay lại khi khoá sửa không?).
- **Thêm chuyên đề vẫn là liên kết sống, tiết thực hành mới tự sinh lần giao:** lớp đang chạy tự nhận bài mới mà gia sư không biết. Hạn và mở bài cũng không có ai chốt.

## Consequences

- Dữ liệu lớp hiện có phải materialize: mỗi lớp đã thêm chuyên đề được chép thành các tiết lý thuyết đang có của chuyên đề đó. Lần giao hiện có giữ nguyên.
- Tiết khoá mới không còn tự lan ra lớp. Đội giáo án thêm tiết thì gia sư phải tự thêm vào từng lớp.
- Thứ tự nhóm theo lớp (ADR 2026-10-05) vẫn áp, nay theo nhóm tự hiện.
