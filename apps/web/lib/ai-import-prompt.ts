import { QuestionTypeDto } from "@/dtos/question.dto";

/**
 * Prompt "Nhập từ AI": schema, ví dụ, quy tắc và tự kiểm tra sinh theo đúng các
 * loại câu hồ sơ môn cho phép — AI không thấy loại câu môn không có.
 */
export interface AiImportPromptInput {
  courseName: string;
  topic: string;
  questionCount: number;
  difficultyNames: string[];
  allowedTypes: readonly QuestionTypeDto[];
  /** Hồ sơ có kiểu ô tự luận ngắn/dài (JP). */
  essayInputSizes?: boolean;
}

interface TypeSpec {
  example: string;
  schema: string;
  rules: string[];
  check: string;
}

function typeSpecs(
  essayInputSizes: boolean,
): Record<QuestionTypeDto, TypeSpec> {
  return {
    [QuestionTypeDto.single_choice]: {
      example: `{"type":"single_choice","content":"Câu 1","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","difficulty":"<độ khó>"}`,
      schema: `single_choice (trắc nghiệm một đáp án):
  type, content, options (mảng 2–6 chuỗi), correctIndex (số nguyên 0-based),
  explanation (tuỳ chọn), difficulty`,
      rules: [
        "options       single_choice: 2–6 phương án; không thêm A./B./1./2. đầu dòng",
        "correctIndex  chỉ single_choice; số nguyên; 0 ≤ correctIndex < options.length",
      ],
      check: "single_choice: có options hợp lệ + correctIndex trong khoảng.",
    },
    [QuestionTypeDto.true_false_group]: {
      example: `{"type":"true_false_group","content":"Đoạn dẫn","options":["nhận định a","nhận định b","nhận định c","nhận định d"],"tfAnswerKey":[true,false,true,false],"explanation":"...","difficulty":"<độ khó>"}`,
      schema: `true_false_group (Đúng/Sai 4 nhận định):
  type, content (đoạn dẫn chung), options (ĐÚNG 4 nhận định a–d),
  tfAnswerKey (mảng 4 true/false theo thứ tự a–d), explanation (tuỳ chọn), difficulty
  KHÔNG có correctIndex`,
      rules: [
        "options       true_false_group: đúng 4 nhận định; không thêm a)/b) đầu dòng",
        "tfAnswerKey   true_false_group: mảng 4 giá trị true/false",
      ],
      check: "true_false_group: đúng 4 options + tfAnswerKey 4 phần tử boolean.",
    },
    [QuestionTypeDto.true_false]: {
      example: `{"type":"true_false","content":"日本の首都は東京です。","tfAnswerKey":[true],"tfLabelStyle":"maru_batsu","explanation":"...","difficulty":"<độ khó>"}`,
      schema: `true_false (Đúng/Sai một nhận định):
  type, content (chính nhận định cần đánh giá), tfAnswerKey (mảng ĐÚNG 1 phần tử: [true] = Đúng, [false] = Sai),
  tfLabelStyle (tuỳ chọn: "maru_batsu" = ○/× — mặc định, "dung_sai" = Đúng/Sai, "true_false" = True/False),
  explanation (tuỳ chọn), difficulty
  KHÔNG có options, KHÔNG có correctIndex`,
      rules: [
        "tfAnswerKey   true_false: mảng đúng 1 giá trị true/false",
        'tfLabelStyle  chỉ true_false; "maru_batsu" | "dung_sai" | "true_false"',
      ],
      check: "true_false: không có options; tfAnswerKey đúng 1 phần tử boolean.",
    },
    [QuestionTypeDto.fill_blank]: {
      example: `{"type":"fill_blank","content":"毎朝[[___]]に起きて、夜[[___]]に寝ます。","blankAnswerKey":[["七時","7時"],["十一時","11時"]],"explanation":"...","difficulty":"<độ khó>"}`,
      schema: `fill_blank (điền vào ô trống):
  type, content (đề có ô trống viết đúng chuỗi [[___]], 1–10 ô),
  blankAnswerKey (mảng, mỗi phần tử là MẢNG các đáp án chấp nhận của một ô, theo thứ tự ô trong content),
  explanation (tuỳ chọn), difficulty
  KHÔNG có options, KHÔNG có correctIndex`,
      rules: [
        "content       fill_blank: mỗi ô trống viết đúng [[___]] (3 gạch dưới)",
        "blankAnswerKey chỉ fill_blank; số phần tử = số ô [[___]]; mỗi ô 1–10 đáp án không rỗng (vd [\"九時\",\"9時\"] — liệt kê đủ cách viết kanji/kana/số chấp nhận)",
      ],
      check:
        "fill_blank: số ô [[___]] trong content bằng blankAnswerKey.length; mỗi ô có ≥1 đáp án.",
    },
    [QuestionTypeDto.ordering]: {
      example: `{"type":"ordering","content":"正しい順に並べてください。","options":["わたしは","毎朝","コーヒーを","飲みます"],"explanation":"...","difficulty":"<độ khó>"}`,
      schema: `ordering (sắp xếp thẻ):
  type, content (yêu cầu), options (2–12 thẻ, viết THEO ĐÚNG THỨ TỰ ĐÁP ÁN — hệ thống tự xáo khi học sinh làm),
  explanation (tuỳ chọn), difficulty
  KHÔNG có correctIndex, KHÔNG có tfAnswerKey`,
      rules: [
        "options       ordering: 2–12 thẻ không rỗng, đúng thứ tự đáp án; không tự xáo trộn",
      ],
      check: "ordering: 2–12 thẻ theo thứ tự đúng, không có correctIndex.",
    },
    [QuestionTypeDto.essay]: {
      example: essayInputSizes
        ? `{"type":"essay","content":"Câu tự luận","answerGuide":"...","essayInputSize":"short","difficulty":"<độ khó>"}`
        : `{"type":"essay","content":"Câu tự luận","answerGuide":"...","difficulty":"<độ khó>"}`,
      schema: `essay (tự luận):
  type, content, answerGuide (barem chấm),${essayInputSizes ? '\n  essayInputSize (tuỳ chọn: "short" = ô một dòng cho câu trả lời ngắn, "long" = ô nhiều dòng — mặc định),' : ""} difficulty
  KHÔNG có options, KHÔNG có correctIndex`,
      rules: [
        "answerGuide   essay; ý chính để gia sư chấm",
        ...(essayInputSizes
          ? ['essayInputSize chỉ essay; "short" | "long"']
          : []),
      ],
      check: "essay: không có options, không có correctIndex.",
    },
  };
}

export function buildAiImportPrompt(input: AiImportPromptInput): string {
  const specs = typeSpecs(input.essayInputSizes ?? false);
  const types = input.allowedTypes;
  const firstDiff = input.difficultyNames[0] ?? "Nhận biết";
  const diffList = input.difficultyNames.length
    ? input.difficultyNames.map((name) => `  - ${name}`).join("\n")
    : "  (chưa có level)";
  const typeList = types.map((t) => `"${t}"`).join(" | ");
  const examples = types
    .map((t) => `  ${specs[t].example.replace("<độ khó>", firstDiff)}`)
    .join(",\n");
  const schemas = types.map((t) => specs[t].schema).join("\n\n");
  const rules = types.flatMap((t) => specs[t].rules).map((r) => `- ${r}`);
  const checks = types.map((t, i) => `${i + 3}. ${specs[t].check}`);
  const mixNote =
    types.length > 1
      ? `\nTrộn các loại câu hợp lý với nội dung (không bắt buộc đủ mọi loại).`
      : "";

  return `Bạn là trợ lý soạn câu hỏi cho khoá ${input.courseName} của UniEdu.

NHIỆM VỤ
Sinh ${input.questionCount} câu hỏi về: ${input.topic || "(chọn chuyên đề)"}.${mixNote}

ĐẦU RA — CHỈ MỘT JSON ARRAY THUẦN
- In ra đúng một mảng JSON: ký tự đầu là [ và ký tự cuối là ].
- Không markdown, không rào \`\`\`json, không lời dẫn, không giải thích.

CẤU TRÚC BẮT BUỘC (đọc kỹ)
Mỗi phần tử của mảng phải là OBJECT JSON {...}, KHÔNG phải chuỗi.

ĐÚNG — mảng các object (mỗi loại câu một ví dụ):
[
${examples}
]

SAI — tuyệt đối không làm thế này:
[
  "{"type":"${types[0]}",...}"
]
Lỗi trên là bọc mỗi câu trong dấu ngoặc kép → JSON.parse sẽ hỏng.
KHÔNG JSON.stringify từng câu. KHÔNG xuất từng dòng object rời rồi bọc vào array string.

SCHEMA MỖI OBJECT THEO LOẠI
${schemas}

QUY TẮC TỪNG TRƯỜNG
- type          ${typeList}
- content       chuỗi không rỗng
${rules.join("\n")}
- explanation   tuỳ chọn
- difficulty    bắt buộc; khớp TUYỆT ĐỐI một trong:
${diffList}
Không thêm trường nào khác ngoài các trường trong schema của loại câu đó.

CODE / BẢNG
- Đoạn code: HTML <pre><code class="language-python">…</code></pre> (hoặc language-cpp), escape < > &.
- Cùng đoạn code viết bằng Python và C++ đặt cạnh nhau: <div data-code-parallel><pre><code class="language-python">…</code></pre><pre><code class="language-cpp">…</code></pre></div>.
- Bảng: HTML <table><tr><th>…</th></tr><tr><td>…</td></tr></table>.
- Ảnh: <img src="https://…">, chỉ dùng link ảnh có sẵn trong đề.

CÔNG THỨC TOÁN
- LaTeX giữa hai dấu $, ví dụ: $y = x^3 - 3x + 2$.
- Trong chuỗi JSON, gạch chéo ngược nhân đôi:
  đúng   "$\\\\frac{1}{2}$"
  sai    "$\\frac{1}{2}$"

TỶ LỆ ĐỘ KHÓ
Phân bổ hợp lý giữa các mức độ khó.

TỰ KIỂM TRA (bắt buộc trước khi trả lời)
1. JSON.parse(output) thành công.
2. output là Array; mỗi phần tử là object (typeof item === "object"), không phải string.
${checks.join("\n")}
${checks.length + 3}. Mọi difficulty khớp danh sách trên.`;
}
