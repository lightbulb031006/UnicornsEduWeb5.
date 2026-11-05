# ADR: Điểm tuyệt đối theo loại câu (IT) và chấm lại khi sửa đáp án

- **Status:** Accepted
- **Date:** 2026-10-07
- **Amends:** `docs/adr/2026-09-07-attempt-exam-snapshot.md` — mục 2 (thang 100/N) cho hồ sơ IT, và tính bất biến của snapshot đối với đáp án đúng.

## Context

Đề Tin tốt nghiệp THPT: Phần I 24 câu trắc nghiệm × 0,25đ; Phần II câu Đúng/Sai 1đ/câu, chấm bậc thang theo số nhận định đúng (1 → 0,1; 2 → 0,25; 3 → 0,5; 4 → 1). Câu Đúng/Sai nặng gấp 4 câu trắc nghiệm, nên chia đều 100/N làm sai tỉ trọng (6:4 thành 86:14 với đề 24 + 4).

Snapshot đề lúc `start` đóng băng cả đáp án đúng, nên đáp án đặt nhầm trong ngân hàng không thể sửa cho bài đã nộp.

## Decision

1. **Hồ sơ IT dùng điểm tuyệt đối theo loại câu:** trắc nghiệm 0,25đ, nhóm câu Đúng/Sai 1đ (bậc thang như trên). Tổng tối đa của bài = tổng điểm các câu, không quy về thang 10 hay 100; đề chuẩn 24 + 2 + 2 mới ra đúng 10. JP / ENG giữ 100/N.
2. **Lưu điểm bằng `Int` đơn vị 1/100 điểm** (trắc nghiệm 25; Đúng/Sai 10 / 25 / 50 / 100). Mọi mức điểm của IT đều nguyên ở đơn vị này, nên vẫn tránh được `Decimal` như ADR cũ.
3. **Sửa đáp án đúng của một câu thì chấm lại mọi bài làm chứa câu đó**, kể cả lượt đang làm (khi nộp sẽ dùng đáp án mới). Chấm lại im lặng, không hỏi xác nhận. Thêm / bớt câu và sửa nội dung vẫn không đụng snapshot.

## Considered options

- **Quy về thang 10 (trọng số 1:4):** mọi đề tối đa 10, so sánh được giữa các tiết, nhưng 0,25 / 1 chỉ đúng với đề chuẩn. Bị loại: người dùng muốn con số 0,25 / 1 xuất hiện ở mọi đề.
- **Gia sư nhập điểm từng câu (`question_links.points`):** linh hoạt nhất nhưng thêm thao tác và tự cân tổng.
- **Nút chấm lại thủ công / xác nhận trước khi lưu:** an toàn hơn, bị loại vì người dùng muốn chấm lại tự động.

## Consequences

- Tổng tối đa khác nhau giữa các tiết thực hành; UI không được hard-code `/100` (`PracticeStatsView.tsx`), phải đọc tổng tối đa từ bài làm.
- Điểm học sinh có thể đổi sau khi nộp mà không có thông báo.
