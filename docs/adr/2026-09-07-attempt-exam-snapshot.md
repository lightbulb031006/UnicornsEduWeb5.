# ADR: Snapshot đề khi bắt đầu Attempt

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Đề luyện tập ở cấp khoá là **liên kết sống** (ADR `2026-09-05-live-link-course-content`): đội giáo án sửa `topics` / `question_links` / `questions` thì mọi lớp thấy ngay. Điều đó đúng cho soạn đề, nhưng sai cho một lượt đang làm: `gradeAndClose` từng so `choiceIndex === question.correctIndex` trên bản live, nên staff đảo `options` / `correctIndex` giữa chừng làm lệch điểm lượt `in_progress`. Thang điểm từng câu lấy `question_links.points ?? 1` nên tổng bài = N, không phải 100 (PRD 3.6).

## Decision

Khi học sinh `start` một Attempt:

1. Copy toàn bộ đề vào `attempt_answers`: thứ tự, `type`, `content`, `options`, `correctIndex`, `explanation`, `answerGuide`, `difficultyLabel`, và `pointsPossible`.
2. `pointsPossible` = chia **100** đều cho N câu bằng phương pháp Hamilton (`floor(100/N)` + phần dư +1 từ câu đầu). Tổng luôn đúng 100 với N = 3, 6, 7. Không dùng `question_links.points` khi chấm.
3. N = 0 → không tạo Attempt; trả lỗi tiếng Việt: *Đề chưa có câu hỏi, không thể bắt đầu làm bài.*
4. `gradeAndClose` và chấm tự luận chỉ đọc snapshot trên `attempt_answers`. Không join `Question` live để lấy đáp án, options, barem hay loại câu.

Liên kết sống **vẫn giữ** cho lần giao (`class_content_items.topic_id`) và cho lượt *mới*. Snapshot chỉ đóng băng **một Bài làm**.

## Considered options

- **Decimal 100/N (33.33…):** tránh phần dư nguyên nhưng dễ 99.99 vì float; schema hiện dùng `Int`.
- **Snapshot lúc nộp, không lúc start:** học sinh đang làm vẫn thấy options live lệch với đáp án lúc chấm.
- **Version đề cấp topic:** an toàn nhưng PRD không muốn tầng duyệt/version.

## Consequences

- Sửa đề sau `start` không đổi điểm / thứ tự / options của lượt đó.
- Ô chấm tự luận giới hạn `[0, pointsPossible]` với `pointsPossible` = 100/N snapshot.
- Thống kê và màn chấm hiển thị thang 100.
- Lượt cũ được backfill best-effort từ ngân hàng hiện hành (migration `20260918000000_attempt_answer_exam_snapshot`).
