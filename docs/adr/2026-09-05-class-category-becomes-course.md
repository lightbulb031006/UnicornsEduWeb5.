# ADR: `ClassCategory` được đổi tên thành `Course`, không tạo trục phân loại thứ hai

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

`class_categories` được sinh ra ở migration `20260818090000_add_class_category` để thay enum `ClassType`, và được seed đúng 7 dòng: VIP, Basic, Advance, Hardcore, THPT Basic, THPT Advanced, THPT Luyện Đề. Trên thực tế đây không phải "phân loại lớp" mà là **chương trình học** — mỗi giá trị tương ứng một lộ trình nội dung khác nhau, và ví dụ nghiệp vụ "học sinh học xong Basic chuyển sang Advance" là chuyển khoá học chứ không phải đổi nhãn.

PRD tái cấu trúc khoá học đòi hỏi một thực thể "Khoá học" sở hữu: cây Chủ đề/Chuyên đề, Thư viện đề thi, Ngân hàng câu hỏi riêng, thang độ khó riêng, thời hạn mặc định, và danh sách đội giáo án được gán. `classes.class_category_id` đã là `NOT NULL` với `ON DELETE RESTRICT`, tức quan hệ Khoá học 1–N Lớp học đã tồn tại sẵn dưới tên sai.

## Decision

Đổi tên `class_categories` → `courses` (và `classes.class_category_id` → `classes.course_id`), bổ sung `default_duration_days`. Không tạo bảng `courses` mới song song, không giữ `ClassCategory` như một trục phân loại độc lập. Tên cũ bị loại bỏ dứt điểm ở cả API, DTO và frontend trong cùng một PR — monorepo deploy đồng thời và không có client bên thứ ba.

## Considered options

- **Tạo `Course` mới, giữ `ClassCategory` song song**: cho phép VIP là "hình thức lớp" cắt ngang nhiều khoá. Bị loại vì sinh ra câu hỏi không có lời đáp sạch — lớp thuộc category X nhưng course Y thì lấy ngân hàng câu hỏi, thang độ khó và thời hạn của bên nào — và vì mọi lớp đang chạy sẽ cần backfill `course_id` thủ công.
- **Tạo `Course` mới, backfill rồi deprecate `ClassCategory`**: cùng ngữ nghĩa với phương án đã chọn nhưng phải maintain hai bảng một thời gian mà không thu được gì, vì không có consumer ngoài monorepo.
- **Giữ nguyên tên bảng/API, chỉ đổi nhãn hiển thị**: rủi ro migration bằng 0, nhưng để code và ngôn ngữ nghiệp vụ lệch nhau vĩnh viễn — chính là thứ mà đợt tái cấu trúc này muốn xoá bỏ.

## Consequences

- Mọi lớp đang chạy tự động thuộc đúng khoá, không cần backfill dữ liệu.
- Không còn chỗ nào biểu diễn "hình thức tổ chức lớp" (1 kèm 1, lớp đông) tách khỏi nội dung học. Nếu sau này cần, phải thêm một trường/bảng mới có tên đúng nghĩa, **không** khôi phục `ClassCategory`.
- Migration đụng vào FK của bảng `classes` — bảng gốc của toàn bộ nghiệp vụ tài chính. Migration phải rename in-place (`ALTER TABLE ... RENAME`), không drop-and-recreate.
