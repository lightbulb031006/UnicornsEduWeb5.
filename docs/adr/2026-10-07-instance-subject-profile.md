# ADR: Hồ sơ môn theo instance, đọc từ env API, dừng khi thiếu

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Ba instance IT / ENG / JP chạy chung một web image và một api image (`deploy/instances.json`), chỉ khác `.env` runtime. Web image build một lần với `NEXT_PUBLIC_BACKEND_URL=/api`, nên mọi biến `NEXT_PUBLIC_*` bị inline lúc build và không thể khác nhau giữa các instance.

Đặc tả câu hỏi Tin học (nhóm câu Đúng/Sai, nhóm tự chọn, điểm tuyệt đối 0,25 / 1, bỏ tự luận) chỉ áp dụng cho IT; JP và ENG giữ hành vi cũ. Instance IT cũng chứa khoá Toán THPT, không chỉ khoá Tin.

## Decision

1. **Đơn vị quyết định luật câu hỏi là instance, không phải khoá.** Mọi khoá trên một instance dùng chung một **Hồ sơ môn** (loại câu được phép, số phương án, thang điểm, luật nhóm tự chọn). Khoá Toán THPT trên IT theo hồ sơ IT.
2. **API là nguồn sự thật duy nhất.** API đọc `LMS_PROFILE=it|jp|eng|math`; validator DTO và logic chấm đọc hồ sơ từ đây. Web lấy hồ sơ qua `GET /public/app-config` (TanStack Query, `staleTime: Infinity`), không đọc env riêng.
3. **Thiếu hoặc sai `LMS_PROFILE` thì API không khởi động.** Không có giá trị mặc định.

## Considered options

- **Cột trên `Course`:** linh hoạt (Toán và Tin trên cùng IT có thể khác luật) nhưng mỗi DB đã tách theo instance, và hiện không ai cần hai luật trong một instance.
- **`NEXT_PUBLIC_*`:** không chạy được với image dùng chung.
- **Mặc định `legacy` khi thiếu biến:** deploy không vỡ, nhưng quên đặt biến trên VPS IT thì IT lặng lẽ chấm sai điểm.
- **Web đọc env runtime riêng:** phải đặt biến ở hai nơi, có rủi ro lệch nhau.

## Bản Toán

Instance Toán đặt `LMS_PROFILE=math`. Hồ sơ này giữ trắc nghiệm một đáp án, tự luận, thang 100 chia đều và mục Kiểm tra trong buổi. Workspace Giáo án học sinh giỏi mở trên IT và Toán.

## Consequences

- Lên bản này phải thêm `LMS_PROFILE` vào `.env` của **cả ba** VPS trước khi CD chạy, nếu không API của instance đó không lên.
- Muốn một khoá trên IT dùng luật khác IT thì phải đảo ADR này (chuyển hồ sơ xuống `Course`).
