# Nhập câu hỏi từ AI

Cổng nhập câu hỏi hàng loạt cho Ngân hàng câu hỏi của một Khoá học. Người dùng chép một prompt dựng sẵn sang ChatGPT/Claude, dán JSON kết quả vào hệ thống, soát lại từng câu, rồi nhập.

Hai chỗ gọi cùng một component:

- Đội giáo án: tab **Câu hỏi** trên workspace khoá (`/admin/courses/:id?tab=cau-hoi` hoặc `/staff/courses/:id?tab=cau-hoi`) → **Nhập từ AI**. `courseId` lấy từ route; khoá chưa có chương thì tab hiện empty state (không mở form/import).
- Gia sư: panel **Thêm chuyên đề → Tạo riêng cho lớp** → khối câu hỏi → **✨ Nhập từ AI** (mở inline trong panel; `courseId` đã có từ lớp).

Câu hỏi nhập vào luôn thuộc **ngân hàng của khoá**, kể cả khi gia sư nhập từ một chuyên đề riêng lớp.

## Định dạng JSON

Đầu vào là một **JSON array**. Mỗi phần tử là một **object** câu hỏi — không phải chuỗi.

**Lỗi phổ biến:** mô hình trả mảng các chuỗi đã stringify từng câu:

```json
[
  "{\"type\":\"single_choice\",...}",
  "{\"type\":\"essay\",...}"
]
```

Cấu trúc này khiến `JSON.parse` hỏng (hoặc parse ra array of string, validate fail). Đúng là mảng object trực tiếp:

```json
[
  {"type":"single_choice",...},
  {"type":"essay",...}
]
```

Prompt dựng sẵn có mục **CẤU TRÚC BẮT BUỘC** với ví dụ ĐÚNG/SAI để giảm lỗi này.

```json
[
  {
    "type": "single_choice",
    "content": "Đạo hàm của hàm số $y = \\ln(2x+1)$ là:",
    "options": ["$\\frac{1}{2x+1}$", "$\\frac{2}{2x+1}$", "$\\frac{2x}{2x+1}$", "$\\frac{\\ln 2}{2x+1}$"],
    "correctIndex": 1,
    "explanation": "Áp dụng công thức đạo hàm hàm hợp $(\\ln u)' = u'/u$.",
    "difficulty": "Thông hiểu"
  },
  {
    "type": "essay",
    "content": "Chứng minh rằng phương trình $x^5 + x - 1 = 0$ có nghiệm duy nhất.",
    "answerGuide": "Xét tính đơn điệu bằng đạo hàm, kết hợp định lý giá trị trung gian.",
    "difficulty": "Vận dụng cao"
  }
]
```

| Trường | Bắt buộc | Áp dụng cho | Ràng buộc |
|---|---|---|---|
| `type` | có | mọi câu | `"single_choice"` hoặc `"essay"` |
| `content` | có | mọi câu | chuỗi không rỗng |
| `options` | có | chỉ `single_choice` | mảng 2–6 **chuỗi** (không phải object `{text}`). API `POST/PATCH /questions` và `POST /questions/bulk` validate `@IsString({ each: true })`. Không tự đánh A/B/C/D. |
| `correctIndex` | có | chỉ `single_choice` | số nguyên, đếm từ 0, `< options.length` |
| `explanation` | không | `single_choice` | chuỗi |
| `answerGuide` | không | chỉ `essay` | chuỗi, dùng làm barem cho gia sư chấm |
| `difficulty` | có | mọi câu | khớp tuyệt đối một giá trị trong `difficulty_levels` của khoá |

Trường lạ ngoài danh sách trên bị từ chối, không bị bỏ qua im lặng.

Công thức toán viết bằng LaTeX đặt giữa hai dấu `$`, khớp với extension `@tiptap/extension-mathematics` đang dùng ở editor.

## Prompt dựng sẵn

Hệ thống sinh prompt theo khoá đang mở, không hard-code. Các tham số hệ thống tự điền:

- Tên khoá học
- Danh sách `difficulty_levels` của khoá (in nguyên chuỗi để mô hình khớp tuyệt đối)
- Tỉ lệ độ khó mặc định

Hai tham số người dùng chỉnh trên panel: **số câu cần sinh** và **chuyên đề**. Chuyên đề lấy từ danh sách Chuyên đề hiện có của khoá; nếu chưa có, người dùng gõ tên mới và chọn mục **Tạo chuyên đề “…”** ngay trong dropdown. Chuyên đề được chọn ở bước lấy prompt cũng là nơi các câu hỏi sẽ được gắn khi lưu.

```
Bạn là trợ lý soạn câu hỏi cho khoá {{TÊN KHOÁ}} của Unicorns Edu.

NHIỆM VỤ
Sinh {{SỐ CÂU}} câu hỏi về: {{CHUYÊN ĐỀ}}.

ĐẦU RA — CHỈ MỘT JSON ARRAY THUẦN
- In ra đúng một mảng JSON: ký tự đầu là [ và ký tự cuối là ].
- Không markdown, không rào ```json, không lời dẫn, không giải thích.

CẤU TRÚC BẮT BUỘC (đọc kỹ)
Mỗi phần tử của mảng phải là OBJECT JSON {...}, KHÔNG phải chuỗi.

ĐÚNG — mảng các object:
[
  {"type":"single_choice",...},
  {"type":"essay",...}
]

SAI — tuyệt đối không bọc mỗi câu trong dấu ngoặc kép:
[
  "{"type":"single_choice",...}",
  "{"type":"essay",...}"
]

SCHEMA + QUY TẮC TRƯỜNG + CÔNG THỨC TOÁN + TỶ LỆ ĐỘ KHÓ
(xem bản đầy đủ trong `AiImportModal.tsx` — sinh theo khoá đang mở)

TỰ KIỂM TRA
1. JSON.parse thành công.
2. Mỗi phần tử là object, không phải string.
3. single_choice / essay đúng schema.
4. difficulty khớp tuyệt đối {{DANH SÁCH ĐỘ KHÓ}}.
```

Các ràng buộc dễ bị coi là thừa nhưng xử lý lỗi có thật:

- **Mảng object, không mảng string** — mô hình hay stringify từng câu rồi bọc trong `[...]`; prompt có ví dụ ĐÚNG/SAI cụ thể.
- **Cấm rào ` ```json `** — không dặn thì mô hình gần như luôn bọc markdown và `JSON.parse` hỏng ngay.
- **Dặn nhân đôi gạch chéo ngược** — lỗi phổ biến khi nội dung có LaTeX.
- **Liệt kê nguyên chuỗi độ khó** — mô hình hay tự chế `"Khó"`, `"cực khó"`, trong khi validate khớp tuyệt đối với `difficulty_levels` của khoá.

## Luồng nhập

1. **Lấy prompt** — panel prompt, nhập số câu và chọn hoặc tạo chuyên đề bằng `UpgradedSelect`, bấm **Sao chép & Tiếp tục**. `handleCopy` `await navigator.clipboard.writeText` trong try/catch: thành công mới toast `"Đã sao chép prompt."` và sang bước dán; thất bại → toast error, không báo đã copy, ở lại bước prompt.
2. **Dán JSON** — validate ngay tại client. Lỗi parse (JSON hỏng, không phải array, trống, quá 50 câu) hiện toast. Lỗi từng câu báo rõ **câu số mấy** và **trường nào sai** (ví dụ `Câu 2: essay không được có options`); câu lỗi vẫn vào bước soát để sửa, không bị bỏ qua im lặng.
3. **Soát từng câu (cổng review bắt buộc)** — sau parse thành công, UI chuyển sang chế độ tuần tự: đúng **một câu** trên màn hình, chỉ số **câu X / N**, thanh tiến độ đã review, và danh sách tổng quan (ô số câu) hiện **đã xem / chưa xem**. Câu đang hiển thị được đánh dấu đã xem. Footer dùng hai nút **Trước / Sau** màu xanh nước biển để điều hướng trong khi chưa ở câu cuối hoặc chưa review đủ; nút **Lưu vào ngân hàng** chỉ xuất hiện tại câu cuối sau khi mọi câu trong danh sách đã được xem ít nhất một lần. Khi chưa thể lưu, UI nhắc `Còn k câu chưa review` hoặc lý do khác nếu thiếu chuyên đề / không còn câu hợp lệ. Sửa nội dung ngay trong bước này (`revalidate` cùng rule lúc parse — essay còn `options` thì không `_valid`). Đóng rồi mở lại modal phải soát lại từ đầu (state review không persist).
   - Select **Gắn vào Chuyên đề** (bước soát) và select **Độ khó** (trên từng câu) đều `searchable` và cho **tạo mới ngay trong dropdown**: gõ tên chưa có → chọn mục `Tạo chuyên đề “…”` / `Tạo độ khó “…”` → `POST /course/:courseId/modules` hoặc `POST /courses/:id/difficulty-levels`, invalidate `courseKeys.modules` / `courseKeys.difficultyLevelsPrefix`, rồi tự chọn giá trị vừa tạo (hook chung `useModuleCreateOption` / `useDifficultyCreateOption` ở `apps/web/lib/hooks/useCourseTaxonomyCreate.ts`). Độ khó mới tạo được `revalidate` chấp nhận vì `difficultyNames` refetch theo query key.
4. **Nhập** — một request duy nhất tạo toàn bộ câu hợp lệ. Sau lưu, TanStack Query invalidate `questionKeys.course(courseId)` (không chỉ `questionKeys.all`).

Câu lỗi **không nhập được**. Người dùng sửa trong bước soát, sửa JSON rồi dán lại, hoặc bỏ những câu đó.

Mọi chuỗi UI/toast/lỗi validate trên `AiImportModal` viết đủ dấu tiếng Việt (không ASCII không dấu).

Không có bảng draft: toàn bộ bước soát diễn ra ở client, chỉ một lần ghi khi bấm **Lưu vào ngân hàng**.

## Quyền

- Đội giáo án được gán vào khoá (`course_editors`) và `lesson_plan_head`: nhập vào mọi khoá mình có quyền.
- Gia sư: nhập vào ngân hàng của khoá mà lớp mình đang dạy thuộc về. Backend chặn `create`/`bulkCreate`/`update` nếu không phải manager/đội giáo án của khoá và không có `class_teachers` active trên lớp thuộc khoá đó.
