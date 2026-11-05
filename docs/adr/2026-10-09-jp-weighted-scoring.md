# ADR: Hồ sơ JP chia 100 theo trọng số câu-trong-tiết

- **Status:** Accepted
- **Date:** 2026-10-09
- **Ticket:** #197

## Context

Đề JP trộn câu nặng nhẹ khác nhau (đoạn đọc hiểu dài vs câu kanji). Thang `equal_100` hiện chia đều 100/N (ADR `2026-09-07-attempt-exam-snapshot`), nên câu khó và câu dễ cùng điểm. Gia sư cần đặt **trọng số** cho từng câu trong tiết. `question_links.points` đã có sẵn (nullable `Int`) nhưng bị bỏ qua khi chấm.

## Decision

1. Cờ hồ sơ `questionWeights` (chỉ JP bật). `attempts.scoring` vẫn là `equal_100` — **không** thêm giá trị enum mới; tổng bài vẫn là 100.
2. Trọng số nằm trên **câu-trong-tiết** (`question_links.points`), không nằm trên câu ở ngân hàng: cùng một câu có thể nặng ở đề này, nhẹ ở đề khác. `null` (hoặc ≤ 0 ở dữ liệu cũ) tính là trọng số 1; JP từ chối lưu trọng số `0`.
3. Lúc `start`, `points_possible` = chia 100 theo tỉ lệ trọng số bằng Hamilton: `floor(100·wᵢ/Σw)`, phần dư +1 cho câu có phần lẻ lớn nhất (hoà → câu đứng trước). Trọng số bằng nhau cho kết quả **giống hệt** `splitTotalPoints` cũ, nên tiết JP cũ (mọi `points` null) không đổi điểm.
4. Sửa trọng số **không chấm lại**: bài đã bắt đầu giữ `points_possible` snapshot; trọng số mới chỉ áp cho bài bắt đầu sau.

## Considered options

- **Enum `AttemptScoring.weighted_100`:** rõ ràng hơn trong DB nhưng thêm migration + nhánh chấm, trong khi chấm (so snapshot `points_possible`) không khác gì `equal_100`.
- **Trọng số trên `questions`:** đơn giản hơn nhưng khoá trọng số theo câu gốc, không cho đề khác cân lại.
- **Điểm tuyệt đối (tổng = Σ points):** phá quy ước thang 100 mà UI và báo cáo JP đang dùng.

## Consequences

- IT (`absolute_it`) và ENG (`equal_100` không trọng số) bỏ qua `question_links.points` khi chấm như trước.
- Tổng điểm hiển thị trong màn soạn đề JP là **tổng trọng số** (`totalWeight` trên summary), không phải tổng điểm.
- Muốn áp trọng số mới cho bài đã nộp phải để học sinh làm lại; không có regrade.
