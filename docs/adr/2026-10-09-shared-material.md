# ADR: Tư liệu dùng chung là bảng riêng, câu gắn tối đa một tư liệu

- **Status:** Superseded một phần bởi `2026-10-09-question-set.md` (mục 1, 2, 5, 6)
- **Date:** 2026-10-09
- **Ticket:** #198
- **Thay quyết định:** "Tư liệu nhúng trong nội dung câu, chưa dùng chung giữa nhiều câu" (`docs/plans/2026-10-07-it-question-types.md`, mục gửi lại người soạn) — chỉ áp cho hồ sơ JP.

## Context

Đề JP có đoạn đọc hiểu / hội thoại mà 3–5 câu cùng dựa vào. Chép đoạn văn vào từng câu làm đề dài gấp nhiều lần, sửa một lỗi chính tả phải sửa N câu, và học sinh không thấy các câu đó thuộc cùng một đoạn. Hồ sơ IT trước đó chọn tư liệu nhúng vì đề THPT Tin học không có đoạn dùng chung.

## Decision

1. Bảng `shared_materials` thuộc **khoá học** (ngân hàng câu hỏi), có `title` (để chọn/lọc) và `content` HTML. Cờ hồ sơ `sharedMaterials` (chỉ JP).
2. Câu gắn **tối đa một** tư liệu qua `questions.shared_material_id` (nullable). Câu vẫn giữ tư liệu nhúng riêng trong `content`. Không có bảng nối N-N.
3. Tư liệu và câu phải cùng khoá. Xoá tư liệu bị chặn (`409`) khi còn câu chưa xoá đang gắn; FK `NO ACTION`, câu đã soft-delete được tháo gắn trước khi xoá.
4. Snapshot lúc start: `attempt_answers.shared_material_id` + `shared_material_content`. Sửa tư liệu không đổi bài đã bắt đầu.
5. Thứ tự trong đề: các câu cùng tư liệu đứng liền nhau tại vị trí câu đầu tiên của khối, bên trong khối giữ thứ tự người soạn. Đảo câu xáo **khối** như một đơn vị (câu đứng riêng là khối một câu). IT giữ luật xáo theo phần / nhóm tự chọn, không dùng khối.
6. Một tiết được lấy một phần số câu của tư liệu (người soạn tự chọn câu, không có luật "lấy cả khối").

## Considered options

- **Chép tư liệu vào từng câu (giữ như IT):** không cần schema mới, nhưng là chính vấn đề cần giải.
- **"Câu nhóm" (câu cha chứa câu con):** đổi cấu trúc chấm và liên kết câu-trong-tiết; quá lớn so với nhu cầu "hiện một đoạn văn trên nhóm câu".
- **N-N câu ↔ tư liệu:** chưa có đề nào cần một câu dựa vào hai đoạn; thêm độ phức tạp cho xếp khối.

## Consequences

- Màn soạn đề không cần đổi: khối được dựng lúc start / lúc trả câu ôn nhẹ.
- Audio (#200) và vị trí trống trong tư liệu (#199) gắn vào bảng này.
- Đổi ý sang N-N sau này cần migration dữ liệu từ `shared_material_id`.
