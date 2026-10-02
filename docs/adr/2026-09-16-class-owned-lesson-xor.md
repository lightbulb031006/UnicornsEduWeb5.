# ADR: Tiết riêng lớp không thuộc chuyên đề nào (XOR chủ sở hữu)

- **Status:** Accepted
- **Date:** 2026-09-16
- **Related:** `docs/adr/2026-09-15-three-level-content-model.md`

## Context

Cây nội dung học thuật được mô tả là ba cấp: **Khoá học → Chuyên đề → Tiết học**. Phát biểu đó không đúng phổ quát. Gia sư vẫn tạo tiết ngay trên lớp (nội dung riêng lớp, không đưa vào cây khoá). Trước rename, topic riêng lớp có `classId` và không có `chapterId`. Biên bản 13/09/2026 giữ nguyên trạng mồ côi: tiết thuộc chuyên đề **hoặc** thuộc lớp, không cả hai.

Nếu bỏ ngoại lệ này, "ba cấp" sẽ trông sạch trên giấy nhưng mất chỗ chứa nội dung lớp tự soạn.

## Decision

CHECK `lessons_owner_check`: `(course_id IS NOT NULL AND module_id IS NOT NULL AND class_id IS NULL) OR (class_id IS NOT NULL AND course_id IS NULL AND module_id IS NULL)`. Tiết cấp khoá luôn nằm trong một Chuyên đề. Tiết riêng lớp không có `module_id` — không hiện trên cây khoá, không phải cấp thứ tư.

`ClassContentItem` vẫn là lần giao: trỏ tới tiết cấp khoá **hoặc** tiết riêng lớp. Ẩn mềm lần giao không đổi chủ sở hữu của tiết.

## Considered options

- **Ép mọi tiết vào một chuyên đề:** tạo chuyên đề giả trên khoá (hoặc chuyên đề "của lớp") để phát biểu ba cấp luôn đúng. Loại vì nội dung riêng lớp sẽ lọt vào cây khoá / ngân hàng câu hỏi của khoá, hoặc phải bịa một Module không phải Chuyên đề nghiệp vụ.
- **Cho phép vừa `module_id` vừa `class_id`:** tiết vừa thuộc chuyên đề vừa thuộc lớp. Loại vì chủ sở hữu mơ hồ — xóa chuyên đề, ẩn lần giao, và quyền soạn nội dung khoá vs lớp không còn một nguồn sự thật. Constraint XOR giữ nguyên trạng đã chạy trên `dev`.

## Consequences

- Câu "ba cấp" chỉ đúng cho nội dung **cấp khoá**. Tiết riêng lớp là ngoại lệ có chủ đích, ghi trong glossary.
- Xóa chuyên đề/tiết cấp khoá khi còn `ClassContentItem` (kể cả ẩn) vẫn 409. Xóa tiết riêng lớp đi cùng lần giao theo luồng ẩn mềm hiện hành.
