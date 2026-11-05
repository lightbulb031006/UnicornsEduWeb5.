# Plan: Câu hỏi Tin học (IT) — Đúng/Sai, nhóm tự chọn, điểm tuyệt đối

- **Ngày:** 2026-10-07
- **Phạm vi:** chỉ hồ sơ IT. JP / ENG giữ nguyên hành vi.
- **Nguồn quyết định:** `CONTEXT.md` (mục Ngân hàng câu hỏi và bài làm), ADR `2026-10-07-instance-subject-profile.md`, ADR `2026-10-07-it-absolute-scoring-and-answer-key-regrade.md`.

Mỗi phase merge được độc lập vào `dev`, theo thứ tự. Phase 0 phải lên trước mọi phase khác, vì nó quyết định API có khởi động không.

---

## Phase 0 — Hồ sơ môn (`LMS_PROFILE`)

**API**

- `apps/api/src/lms-profile/lms-profile.ts`: hàm thuần `loadLmsProfile(env)` → ném lỗi nếu thiếu hoặc không thuộc `it | jp | eng`. Trả object cấu hình:
  ```ts
  interface LmsProfileConfig {
    profile: 'it' | 'jp' | 'eng';
    questionTypes: QuestionType[];          // IT: single_choice, true_false_group; JP/ENG: single_choice, essay
    optionCount: { min: 2; max: 6; default: 4 };
    scoring: 'absolute_it' | 'equal_100';
    electiveGroups: boolean;                // chỉ IT
  }
  ```
- Gọi `loadLmsProfile(process.env)` ở **đầu** `main.ts`, trước `NestFactory.create` → sai biến thì process thoát với thông báo rõ ràng.
- `LmsProfileModule` (global) cung cấp token `LMS_PROFILE` cho service khác inject.
- `GET /public/app-config` (`@Public()`, `@ApiTags('public')`, `@ApiOperation`, `@ApiResponse`) trả `LmsProfileConfig`.
- Jest: đặt `LMS_PROFILE=jp` mặc định trong setup test để spec cũ không đổi; spec IT tự override.

**Web**

- `apps/web/dtos/app-config.dto.ts`: `LmsProfile`, `LmsScoring`, `AppConfigDto`.
- `apps/web/lib/apis/app-config.api.ts` + hook `useAppConfig()` (`useQuery`, `staleTime: Infinity`, `gcTime: Infinity`).

**Env / docs**

- Thêm `LMS_PROFILE` vào `.env.example`, `.env.production*.example` (IT = `it`, JP = `jp`, ENG = `eng`).
- `docs/ops/vps-multi-instance-runbook.md`: bước bắt buộc "đặt `LMS_PROFILE` trên cả ba VPS **trước** khi CD chạy".

---

## Phase 1 — Prisma schema + migration

| Bảng | Thay đổi | Ghi chú |
|---|---|---|
| `QuestionType` enum | thêm `true_false_group` | |
| `questions` | dùng lại `options` cho 4 nhận định a–d; thêm `tf_answer_key Boolean[]` | `correct_index` null với Đúng/Sai. Dùng lại `options` để snapshot, AI import, preview không phải nhân đôi cột. |
| `QuestionSlot` enum (mới) | `required`, `elective_1`, `elective_2` | |
| `question_links` | thêm `slot QuestionSlot @default(required)` | |
| `lessons` | thêm `elective_1_name String?`, `elective_2_name String?` | chỉ có nghĩa với `kind = practice` |
| `attempts` | thêm `scoring` (`equal_100` \| `absolute_it`), `elective_voided Boolean @default(false)` | `scoring` cho biết đọc điểm theo thang nào; bài cũ backfill `equal_100` |
| `attempt_answers` | thêm `tf_answer_key Boolean[]`, `tf_choices Json?`, `slot QuestionSlot @default(required)` | `tf_choices` = `(boolean \| null)[4]`; Prisma `Boolean[]` không chứa được `null` nên phải dùng `Json` |
| `lesson_quiz_answers` | thêm `tf_choices Json?` | |

- Migration trong `apps/api/prisma/schema/migrations/`, tên `20261007xxxxxx_it_true_false_group`.
- Backfill: `attempts.scoring = 'equal_100'` cho mọi dòng cũ (default cột rồi gỡ default, để bài mới luôn phải ghi rõ).
- Cập nhật `docs/Database Schema.md`.

---

## Phase 2 — API ngân hàng câu hỏi

- `dtos/question.dto.ts`: thêm `true_false_group` vào enum; `tfAnswerKey?: boolean[]` (`@ArrayMinSize(4) @ArrayMaxSize(4)`).
- `QuestionService.assertAllowedByProfile(dto)` (decorator class-validator tĩnh nên phần phụ thuộc hồ sơ kiểm ở service):
  - loại câu ∉ `profile.questionTypes` → 400 tiếng Việt.
  - `single_choice`: options 2–6, `correctIndex < options.length`, không có `tfAnswerKey`.
  - `true_false_group`: đúng 4 `options`, đủ 4 `tfAnswerKey`, không có `correctIndex`.
- Áp dụng ở `create`, `update`, `bulkCreate`.
- Swagger cập nhật ví dụ cho Đúng/Sai.

---

## Phase 3 — Chấm điểm, nhóm tự chọn, chấm lại

### 3.1 Hàm chấm thuần (`apps/api/src/attempt/grading.ts`)

```ts
gradeTrueFalse(key: boolean[], choices: (boolean | null)[]): number // trả 0 | 10 | 25 | 50 | 100
gradeAnswers(answers, scoring): { patches; autoGradedScore; autoGradedMax; electiveVoided }
```

- Bậc thang: số nhận định đúng 0→0, 1→10, 2→25, 3→50, 4→100. `null` không tính đúng.
- Trắc nghiệm IT: đúng → 25.
- Luật tự chọn: nếu **cả** nhóm `elective_1` **và** `elective_2` đều có ≥1 nhận định khác `null` → mọi câu tự chọn `pointsAwarded = 0`, `electiveVoided = true`.
- `autoGradedMax` (IT) = tổng `pointsPossible` câu bắt buộc + tổng một nhóm tự chọn (hai nhóm cùng số câu nên bằng nhau). Không cộng cả hai nhóm.
- `claimAndGrade` gọi hàm này thay cho vòng lặp hiện tại (`attempt.service.ts` ~dòng 316).

### 3.2 Start (snapshot)

- `scoring` lấy từ hồ sơ; `pointsPossible`: IT = 25 / 100 theo loại câu, JP/ENG = `splitTotalPoints(100, N)` như cũ.
- Snapshot thêm `tfAnswerKey`, `slot`.
- Thứ tự snapshot: Phần I (trắc nghiệm theo `order`) → Phần II (Đúng/Sai: bắt buộc → tự chọn 1 → tự chọn 2, mỗi nhóm theo `order`).
- Chặn start nếu đề sai form (lỗi tiếng Việt): nhóm tự chọn chứa câu không phải Đúng/Sai, hoặc hai nhóm khác số câu, hoặc chỉ có một nhóm.

### 3.3 Lưu câu trả lời

- DTO autosave thêm `tfChoices: (boolean | null)[]` (độ dài 4). Câu trắc nghiệm vẫn dùng `choiceIndex`.

### 3.4 Chấm lại khi sửa đáp án

- Trong `QuestionService.update`, nếu `correctIndex` hoặc `tfAnswerKey` đổi: cùng transaction
  1. `attempt_answers.updateMany({ where: { questionId } })` ghi đáp án mới vào snapshot (cả lượt `in_progress`).
  2. Với các attempt đã đóng chứa câu: đọc lại toàn bộ answers → `gradeAnswers` → ghi `pointsAwarded`, `isCorrect`, `autoGradedScore`, `electiveVoided`.
- Không thông báo, không hỏi xác nhận (ADR).
- Ngoại lệ snapshot chỉ cho đáp án; nội dung / phương án / thứ tự không đụng.
- Nếu số attempt lớn: chạy theo lô 200; đo trên dữ liệu thật trước khi quyết có cần job nền.

### 3.5 Thống kê

- `staff-attempt.controller.ts` (`practice-stats`): bỏ mô tả "thang 100"; trả `scoring` + `maxScore` để web tự hiển thị.
- "Đúng" của câu Đúng/Sai = `pointsAwarded === pointsPossible`.

---

## Phase 4 — Bài tập ôn nhẹ (`lesson-quiz.service.ts`)

- Nhận Đúng/Sai; hoàn thành khi **đủ 4 nhận định** có lựa chọn.
- Không có nhóm tự chọn trong ôn nhẹ (`slot` luôn `required`).

---

## Phase 5 — Web: soạn câu hỏi

- `QuestionFormFields.tsx`: `UpgradedSelect` loại câu lấy từ `useAppConfig().questionTypes`. Đúng/Sai → 4 ô `MathRichTextEditor` (a–d) + công tắc Đúng/Sai mỗi ô. Trắc nghiệm: mặc định 4 phương án, thêm/bớt trong 2–6.
- `QuestionPreview.tsx`: render Đúng/Sai.
- `PracticeLessonQuestionsCard.tsx` / `ClassPracticeQuestionComposer.tsx` (tiết thực hành, chỉ IT):
  - chọn vị trí mỗi câu bằng `UpgradedSelect` (Bắt buộc / Tự chọn 1 / Tự chọn 2);
  - 2 ô tên nhóm tự chọn;
  - cảnh báo inline khi sai form (nhóm lệch số câu, câu trắc nghiệm trong nhóm tự chọn) — cùng luật API chặn lúc start.
- DTO mới vào `apps/web/dtos/question.dto.ts`, `course-content.dto.ts`.

---

## Phase 6 — Web: làm bài, xem lại, thống kê

- `StudentAttemptQuestion.tsx` → tách component `TrueFalseGroupQuestion` (4 hàng, mỗi hàng 2 nút Đúng / Sai; bấm lại để bỏ chọn).
- Trang bài làm: tiêu đề **PHẦN I** / **PHẦN II** (chỉ khi đề có cả hai loại); số câu Phần II đánh lại từ 1; tiêu đề nhóm "Tự chọn — {tên nhóm}". Không cảnh báo khi làm cả hai nhóm.
- Xem lại sau nộp: hiện đáp án từng nhận định, điểm câu; nếu `electiveVoided` → ghi chú "Làm cả hai nhóm tự chọn nên phần tự chọn không được tính điểm".
- `attempt-autosave.helpers.ts`: lưu `tfChoices`.
- Định dạng điểm: helper `formatAttemptScore(score, scoring)` — `absolute_it` hiện `score / 100` với dấu phẩy (`7,35`); `equal_100` hiện như cũ.
- `PracticeStatsView.tsx`: bỏ 5 chỗ hard-code `/100` (dòng 99, 102, 236, 300, 334), dùng `maxScore` + `formatAttemptScore`.

---

## Phase 7 — Rich text: tư liệu trong nội dung câu

Context7 kiểm tra API TipTap hiện hành trước khi code.

- `@tiptap/extension-table` (+ row/cell/header) — bảng SQL.
- `@tiptap/extension-image` + upload qua Supabase storage có sẵn (`apps/api/src/storage/supabase-storage.ts`); endpoint upload ảnh câu hỏi mới, có Swagger.
- Code block có số dòng (node view; HTML/CSS không cần số dòng → thuộc tính `lineNumbers` bật/tắt).
- Node **Code song song** `parallelCode` (`rows: [py, cpp][]`): desktop 2 cột chung cột số dòng; mobile chuyển tab Python / C++ nhưng giữ số dòng; cuộn ngang, không wrap.
- Dùng được trong nội dung câu, phương án và nhận định.
- **Bảo mật:** `MathContent.tsx` đang `dangerouslySetInnerHTML` không qua sanitizer. Thêm sanitizer (allowlist có `table`, `img[src]` giới hạn domain Supabase, node code) trước khi mở ảnh — ảnh/HTML do gia sư nhập là đường XSS.

---

## Phase 8 — Nhập từ AI + seed

- `AiImportModal.tsx`, `ai-import-review.helpers.ts`: chấp nhận `true_false_group` (`statements` 4 chuỗi + `answers` 4 bool, map sang `options` / `tfAnswerKey`); khối code `code: { rows: [[py, cpp], …] }`. Trên IT từ chối `essay` với lỗi "Câu N: hồ sơ Tin học không có câu tự luận".
- Prompt dựng sẵn sinh theo hồ sơ (IT không nhắc essay).
- Seed: pack chạy trên IT bỏ 5 câu essay và "Đề tự luận".
- Cập nhật `docs/AI Question Import.md`, `docs/Seed Question Bank.md`.

---

## Phase 9 — Docs, deploy, verify

- Docs: `Database Schema.md`, `docs/api/courses.md` (hoặc tài liệu attempt/question tương ứng), runbook, `.env*.example`, CHANGELOG.
- Deploy: đặt `LMS_PROFILE` trên 3 VPS → merge → CD. Kiểm tra `GET /api/public/app-config` từng instance.
- Verify:
  - unit: `loadLmsProfile`, `gradeTrueFalse` (0–4 đúng, có `null`), luật tự chọn (một nhóm / cả hai nhóm / không nhóm nào), chấm lại (lượt đóng + đang làm), start chặn đề sai form;
  - spec cũ của JP (100/N, essay) vẫn xanh;
  - thủ công trên IT local: tạo đề 24 + 2 + 2 + 2, làm đủ → 10,00; làm cả hai nhóm tự chọn → tối đa 8,00; sửa đáp án → điểm đổi.

---

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Quên `LMS_PROFILE` trên VPS → API không lên | Phase 0 lên riêng, runbook ghi bước bắt buộc, kiểm tra trước merge |
| Bài cũ trên IT hiển thị sai thang | cột `attempts.scoring` backfill `equal_100` |
| Chấm lại nhiều attempt trong một transaction chậm | xử lý theo lô, đo trước |
| XSS qua HTML câu hỏi | sanitizer ở Phase 7 trước khi bật ảnh |

## Việc sửa trong bản đặc tả gốc (gửi lại người soạn)

- Trắc nghiệm 2–6 phương án (mặc định 4), không cố định A–D.
- Ghi luật chấm cụ thể (0,25; bậc thang 0,1 / 0,25 / 0,5 / 1).
- Thêm mục nhóm tự chọn và luật "làm cả hai nhóm → 0 điểm phần tự chọn".
- Tư liệu nhúng trong nội dung câu, chưa dùng chung giữa nhiều câu. (Hồ sơ JP đã có Tư liệu dùng chung — ADR `2026-10-09-shared-material`.)
- Code song song Python / C++ chia theo hàng, chung số dòng.
- Một lời giải chung cho cả nhóm Đúng/Sai.
- Hồ sơ Tin học không có câu tự luận.
