# ADR: Lớp thêm nội dung theo Chuyên đề; bỏ tiết riêng lớp

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** #150
- **Supersedes:** `docs/adr/2026-09-16-class-owned-lesson-xor.md`
- **Amends:** quyết định 3 của `docs/adr/2026-09-07-class-content-soft-hide-restrict-knowledge-tree.md`
- **Related:** biên bản `docs/meetings/2026-10-02-bien-ban.md`

## Context

Trước đây gia sư thêm từng tiết học vào lớp, hoặc tạo tiết riêng ngay trên lớp (`lessons.class_id`, không có chuyên đề — ADR 2026-09-16). Biên bản 02/10/2026 đổi cách dạy: lớp đi theo **Chuyên đề** của khoá. Thêm một chuyên đề thì mọi tiết lý thuyết của nó vào lớp. Tiết lý thuyết thêm vào chuyên đề sau này phải tự hiện trên mọi lớp đã thêm chuyên đề. Tiết thực hành vẫn giao từng tiết, vì mỗi lần giao có lịch mở bài và thời lượng riêng.

Mô hình cũ không có chỗ để ghi "lớp đã thêm chuyên đề X", nên tiết lý thuyết mới không có đường để tự hiện. Tiết riêng lớp cũng không còn chỗ trong luồng thêm theo chuyên đề.

## Decision

1. **Bảng `class_modules (class_id, module_id)`**, unique theo cặp, cascade theo lớp và chuyên đề. Đây là nguồn sự thật cho câu hỏi "lớp đã thêm chuyên đề nào".

2. **Tiết lý thuyết được materialize** thành `class_content_items`, mỗi tiết một dòng như trước, kèm dòng timeline `content_item`. Thêm chuyên đề thì tạo item còn thiếu và khôi phục item đang ẩn của chuyên đề đó. Gỡ chuyên đề thì ẩn mềm item và dòng timeline, giữ lượt xem. Tạo tiết lý thuyết trong chuyên đề thì đồng bộ sang mọi lớp có `class_modules` tương ứng. Xoá tiết lý thuyết thì xoá luôn item của nó ở mọi lớp. Item lý thuyết không có Attempt, nên xoá an toàn. Chuyên đề và loại của tiết không đổi sau khi tạo, nên chỉ cần hook ở bước tạo và xoá.

3. **Không thêm lẻ tiết lý thuyết.** `POST /class/:id/content` chỉ nhận tiết thực hành có sẵn của khoá. Khôi phục item lý thuyết cũng bị chặn khi lớp chưa thêm chuyên đề chứa nó.

4. **Bỏ tiết riêng lớp.** API không tạo tiết có `class_id` nữa. Tiết riêng cũ được ẩn mềm, không xoá và không đổi thành tiết của khoá; API từ chối sửa hoặc xoá tiết đã lưu trữ (400). Cột mới `lessons.archived_at` ghi trạng thái này, và item cùng dòng timeline của các tiết đó cũng ẩn. Màn staff (vốn hiện cả item đã ẩn) cũng bỏ hẳn chúng; học sinh mở trực tiếp nhận 404. CHECK `lessons_owner_check` giữ nguyên, để dữ liệu cũ vẫn hợp lệ.

5. **Sửa guard xoá (ADR 2026-09-07, quyết định 3).** Restrict 409 khi xoá Chuyên đề hoặc Tiết học chỉ còn tính item của **tiết thực hành**, tức lần giao có Attempt. Item lý thuyết là bản chiếu của chuyên đề, nên đi theo tiết khi tiết bị xoá. FK Restrict ở DB vẫn giữ nguyên, nên ứng dụng xoá item lý thuyết trước rồi mới xoá tiết hoặc chuyên đề, trong cùng một transaction.

6. **Migration dữ liệu** (`20261002120000_add_class_modules`):
   - Lớp đang có tiết lý thuyết thêm lẻ, còn hiện: tự thêm nguyên chuyên đề chứa tiết đó, kèm các tiết lý thuyết còn thiếu của chuyên đề.
   - Lớp không bật thứ tự timeline tuỳ chỉnh: sắp lại timeline theo thời gian.
   - Tiết riêng lớp: archive như mục 4.

## Considered options

- **Join động, không materialize:** đọc nội dung lớp bằng cách hợp `class_modules × lessons` với item thực hành. Loại vì lượt xem, ẩn mềm, timeline và quyền học sinh đều đang khoá theo `class_content_items.id`. Join động buộc viết lại toàn bộ các nhánh đó.
- **Đổi tiết riêng lớp thành tiết của khoá** (gom vào một chuyên đề "của lớp"): loại vì nội dung tự soạn của một lớp sẽ lọt vào cây khoá và ngân hàng câu hỏi chung. Biên bản chốt: archive, không chuyển.
- **Xoá cứng tiết riêng lớp:** loại vì sẽ mất lượt xem và nội dung đã soạn, không tra cứu lại được.

## Consequences

- Câu "ba cấp Khoá → Chuyên đề → Tiết" giờ đúng với mọi nội dung đang hoạt động. Tiết riêng lớp chỉ còn là dữ liệu lưu trữ.
- Đội giáo án xoá được tiết lý thuyết đang hiện trên lớp; lớp mất tiết đó ngay, kèm lượt xem và dòng timeline của item (cascade). Đây là xoá cứng có chủ đích: tiết không còn thì lượt xem không còn gì để tra. Muốn giữ lượt xem thì gỡ chuyên đề khỏi lớp (ẩn mềm) thay vì xoá tiết. Tiết thực hành đã giao vẫn bị chặn 409.
- Thêm lại chuyên đề khôi phục mọi item lý thuyết đang ẩn của chuyên đề đó, kể cả item gia sư ẩn lẻ trước #150.
- Thêm một chuyên đề có thể tạo nhiều item và dòng timeline trong một transaction. Timeout được đặt 30s.
- Rollback: drop `class_modules` và `lessons.archived_at`. Item lý thuyết do migration thêm vẫn còn, dưới dạng item lẻ hợp lệ của mô hình cũ. Muốn hiện lại tiết riêng lớp đã archive thì phải bỏ cờ ẩn trên item của chúng bằng tay.
