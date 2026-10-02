# Seed Ngân hàng câu hỏi & Đề luyện tập

Script sinh dữ liệu mẫu cho **ngân hàng câu hỏi** và **đề luyện tập** của các Khoá học đã có trong DB.

> Schema vật lý và Prisma client: `modules` / `lessons` (`LessonKind`). Pack seed dùng field `module` / `modules`. UUID tất định vẫn salt `'chapter'` / `'topic'` để id không đổi sau rename bảng.

- Runner: `apps/api/scripts/seed-question-bank.ts`
- Dữ liệu: `apps/api/scripts/seed-data/` (`types.ts`, `algorithms.ts`, `math-thpt.ts`)
- Lệnh: `pnpm seed:question-bank` (chạy từ `apps/api`)

## Chạy

```bash
cd apps/api

pnpm seed:question-bank                        # dry-run: in kế hoạch, KHÔNG ghi DB
pnpm seed:question-bank --apply                # ghi vào DB
pnpm seed:question-bank --apply --course=VIP   # giới hạn một khoá (tên hoặc id)
pnpm seed:question-bank --apply --pack=algorithms
pnpm seed:question-bank --apply --reset        # xoá dữ liệu seed cũ rồi seed lại
```

Dry-run là mặc định; phải có `--apply` mới ghi. Script đọc `DIRECT_URL` trước, sau đó `DATABASE_URL`.

## Script tạo gì

Với **mỗi khoá khớp pack**:

| Bảng | Nội dung |
| --- | --- |
| `course_difficulty_levels` | 4 mức: Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao |
| `modules` | 5 chuyên đề nội dung + 1 chuyên đề `Ôn tập & Đề tổng hợp` |
| `questions` | 30 câu (25 `single_choice` + 5 `essay`), HTML TipTap, LaTeX `$…$` |
| `lessons` (`kind = practice`) | 12 đề (xem bảng dưới) |
| `question_links` | 83 liên kết câu ↔ đề, kèm `order` |

Danh sách đề mỗi khoá:

| Đề | Số câu | Nguồn câu |
| --- | --- | --- |
| 5 đề luyện tập theo chương | 4 mỗi đề | chương tương ứng |
| Đề kiểm tra giữa khoá | 10 | 3 chương đầu |
| Đề thi cuối khoá | 15 | toàn bộ |
| Đề khởi động — Kiểm tra 10 phút | 5 | toàn bộ, chỉ Nhận biết |
| Đề kiểm tra cụm 2 | 6 | 2 chương cuối |
| Đề nâng cao | 7 | toàn bộ, chỉ Vận dụng + Vận dụng cao |
| Đề tự luận | 5 | toàn bộ, chỉ Vận dụng cao (5 câu essay) |
| Đề thi cuối khoá (đề số 2) | 15 | toàn bộ, `rotate: 1` |

Đề tổng hợp đặt trong chuyên đề `Ôn tập & Đề tổng hợp`; đề theo chuyên đề đặt trong chính chuyên đề đó.

Script **không** đụng tới `classes`, `class_content_items`, `students` hay `attempts`. Muốn học sinh làm được đề, gia sư vẫn phải tự giao đề vào lớp (tạo `class_content_items` với `open_at` + `duration_minutes`).

## Pack và khoá tương ứng

| Pack | Khoá (khớp theo tên, không phân biệt hoa/thường) | Nội dung |
| --- | --- | --- |
| `algorithms` | VIP, Basic, Advance, Hardcore | Độ phức tạp, Tìm kiếm nhị phân, Sắp xếp, Quy hoạch động, Đồ thị |
| `math-thpt` | THPT Basic, THPT Advanced, THPT Luyện Đề | Đạo hàm, Mũ–logarit, Tổ hợp–Xác suất, Tích phân, Oxyz |

Khoá không khớp tên pack nào sẽ bị bỏ qua (in log, không lỗi).

## Tính idempotent

Mọi bản ghi dùng **UUID tất định** sinh từ `sha1(namespace | courseId | kind | key)` rồi ép về định dạng UUID v5, nên chạy lại là `upsert` — không nhân bản. Namespace cố định trong `SEED_NAMESPACE`; đổi giá trị này sẽ sinh ra một bộ id hoàn toàn mới (coi như seed khác).

Ngoại lệ có chủ đích:

- **`modules`** được dò theo tiêu đề, **không phân biệt hoa/thường**, trước khi tạo — để không đẻ module trùng với chuyên đề người dùng đã nhập tay (ví dụ `tìm kiếm nhị phân` có sẵn ở khoá VIP được tái dùng, không tạo thêm bản `Tìm kiếm nhị phân`).
- **`course_difficulty_levels`** upsert theo khoá tự nhiên `unique(course_id, name)`.

## Ràng buộc phải tuân theo

- **`lessons_owner_check`**: tiết cấp khoá **bắt buộc** có `module_id`. Vì vậy hai đề tổng hợp được gắn vào chuyên đề `Ôn tập & Đề tổng hợp` thay vì treo ở gốc khoá. Runner có guard ném lỗi nếu một `SeedExam` thiếu `module`. UUID salt vẫn là `'chapter'` / `'topic'` để id seed không đổi sau rename bảng.
- **`onDelete: Restrict`** từ `attempt_answers` / `lesson_quizzes` / `lesson_quiz_answers` sang `questions`: `--reset` không xoá cứng được câu đã có bài làm, nên script **xoá mềm** (`deleted_at`) các câu đó và báo trong log.
- Thang điểm khi chấm là **100 chia Hamilton** theo snapshot `attempt_answers` (ADR `2026-09-07-attempt-exam-snapshot`), **không** đọc `question_links.points`. Script vẫn ghi `points = 1` cho tương thích dữ liệu cũ; giá trị này không ảnh hưởng điểm.

## Thêm / sửa nội dung

1. Mở pack tương ứng trong `apps/api/scripts/seed-data/`.
2. Thêm phần tử vào `questions` với `key` **mới và không đổi về sau** (`key` là đầu vào sinh id — đổi `key` = tạo câu mới, câu cũ ở lại DB).
3. Nội dung viết HTML (`<p>`, `<ul>`, `<code>`, `<pre>`), công thức toán đặt giữa hai dấu `$` — khớp `@tiptap/extension-mathematics` ở editor và `MathContent.tsx` khi render.
4. `difficulty` và `module` phải khớp tuyệt đối chuỗi khai báo trong `difficultyLevels` / `modules` của pack.
5. Đề khai báo trong `exams` theo **blueprint độ khó** (`{ 'Nhận biết': 1, 'Thông hiểu': 2 }`), không liệt kê từng câu.

6. `rotate` (tuỳ chọn) tránh trùng câu giữa hai đề cùng blueprint trên cùng pool.

Hàm chọn câu là `pickExamQuestions()`: lọc theo `modules`, nhóm theo độ khó, sắp theo `key`, rồi rải **round-robin qua các chuyên đề** để đề tổng hợp không dồn câu vào một chuyên đề. Đổi hàm này nếu muốn chiến lược khác (ưu tiên chuyên đề cuối khoá, chọn ngẫu nhiên có seed, …). Nếu nguồn không đủ câu cho một mức độ khó, script in cảnh báo và lấy hết số có.

### `rotate` hoạt động thế nào

`rotate` là **hệ số**, không phải số bước cố định: offset thực của mỗi mức độ khó = `rotate × số câu cần lấy ở mức đó`. Nhờ vậy `rotate: 1` lấy đúng khối kế tiếp của `rotate: 0` ở *mọi* mức, dù mỗi mức có kích thước pool khác nhau.

Ví dụ `exam-final` (`rotate` mặc định `0`) và `exam-final-2` (`rotate: 1`), blueprint `{NB:5, TH:6, VD:3, VDC:1}` trên pool `{NB:10, TH:10, VD:5, VDC:5}`:

| Mức | Pool | Lấy | Trùng |
| --- | --- | --- | --- |
| Nhận biết | 10 | 5 | 0 |
| Thông hiểu | 10 | 6 | 2 |
| Vận dụng | 5 | 3 | 1 |
| Vận dụng cao | 5 | 1 | 0 |

Tổng trùng 3/15 — đúng mức tối thiểu `max(0, 2 × lấy − pool)` mỗi mức. Muốn hai đề rời hoàn toàn thì phải thêm câu vào pool, không phải chỉnh `rotate`.

## Kiểm tra nhanh sau khi seed

```sql
SELECT c.name,
       count(DISTINCT q.id) AS cau,
       count(DISTINCT t.id) AS de
FROM courses c
LEFT JOIN questions q ON q.course_id = c.id
LEFT JOIN topics t ON t.course_id = c.id AND t.kind = 'practice'
GROUP BY c.name ORDER BY c.name;
```
