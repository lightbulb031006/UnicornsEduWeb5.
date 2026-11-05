import { QuestionSlot, QuestionType } from 'generated/enums';
import { examGroupRank, orderExamLinks } from 'src/attempt/exam-form';
import { renderMathInHtml } from './math-render';

/**
 * Đề in (CONTEXT.md): HTML đề trắng của một tiết thực hành, dựng theo form đề
 * thi tốt nghiệp THPT môn Tin học — Phần I trắc nghiệm, Phần II Đúng/Sai
 * (bắt buộc + hai Nhóm tự chọn). Thuần (không IO): renderer PDF lo ký ảnh,
 * đếm trang và footer.
 */

export interface ExamPrintQuestion {
  type: QuestionType;
  slot: QuestionSlot;
  content: string;
  options: string[];
  correctIndex: number | null;
  tfAnswerKey: boolean[] | null;
}

export interface ExamPrintInput {
  courseName: string;
  lessonTitle: string;
  durationMinutes: number | null;
  elective1Name: string | null;
  elective2Name: string | null;
  /** Câu theo thứ tự gốc của tiết; builder tự xếp lại theo form đề. */
  questions: ExamPrintQuestion[];
  withAnswers: boolean;
}

export const BRAND_NAME = 'UNIEDU';
export const SUBJECT_NAME = 'TIN HỌC';
/** Renderer thay bằng số trang của phần đề (2 chữ số) sau lượt đếm trang. */
export const PAGE_COUNT_PLACEHOLDER = '00';
export const PAGE_COUNT_ELEMENT_ID = 'exam-page-count';
export const ANSWER_SECTION_ID = 'exam-answers';

const OPTION_LETTERS = 'ABCDEFGH';
const STATEMENT_LETTERS = 'abcdefgh';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DANGEROUS_ELEMENT_RE =
  /<(script|iframe|object|embed|frame|frameset|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const DANGEROUS_VOID_RE = /<(link|meta|base)\b[^>]*>/gi;
const EVENT_ATTR_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE =
  /\s+(href|src|xlink:href)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi;

/**
 * Nội dung câu do phía dạy soạn được nạp vào Chromium phía server: bỏ script,
 * khung nhúng và handler sự kiện. Lớp thứ hai là chặn request ở renderer.
 */
export function sanitizeContentHtml(html: string): string {
  return html
    .replace(DANGEROUS_ELEMENT_RE, '')
    .replace(DANGEROUS_VOID_RE, '')
    .replace(EVENT_ATTR_RE, '')
    .replace(JS_URL_RE, '');
}

function contentHtml(html: string): string {
  return renderMathInHtml(sanitizeContentHtml(html ?? ''));
}

function electiveName(name: string | null, fallback: string): string {
  return name?.trim() || fallback;
}

/** "Câu 3", "Câu 3 và Câu 4", "Câu 3 đến Câu 5". */
export function questionRangeLabel(numbers: number[]): string {
  if (numbers.length === 0) return '';
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  if (numbers.length === 1) return `Câu ${first}`;
  if (numbers.length === 2) return `Câu ${first} và Câu ${last}`;
  return `Câu ${first} đến Câu ${last}`;
}

interface NumberedQuestion {
  number: number;
  rank: number;
  question: ExamPrintQuestion;
}

/** Đánh số theo form Bộ: Phần I từ 1; Phần II đánh lại từ 1, liên tục qua bắt buộc → TC1 → TC2. */
export function numberExamQuestions(
  questions: ExamPrintQuestion[],
): NumberedQuestion[] {
  const ordered = orderExamLinks(
    questions.map((question) => ({
      slot: question.slot,
      question: { type: question.type },
      source: question,
    })),
  );
  let part1 = 0;
  let part2 = 0;
  return ordered.map((link) => {
    const rank = examGroupRank(link);
    const number = rank === 0 ? ++part1 : ++part2;
    return { number, rank, question: link.source };
  });
}

function questionLabel(number: number): string {
  return `<span class="q-label">Câu ${number}.</span>`;
}

function renderSingleChoice(item: NumberedQuestion): string {
  const options = item.question.options
    .map(
      (option, index) =>
        `<div class="opt"><span class="opt-label">${OPTION_LETTERS[index] ?? '?'}.</span><div class="opt-body content">${contentHtml(option)}</div></div>`,
    )
    .join('');
  return `<div class="q">${questionLabel(item.number)}<div class="q-body content">${contentHtml(item.question.content)}</div><div class="options">${options}</div></div>`;
}

function renderTrueFalse(item: NumberedQuestion): string {
  const statements = item.question.options
    .map(
      (statement, index) =>
        `<div class="stmt"><span class="stmt-label">${STATEMENT_LETTERS[index] ?? '?'})</span><div class="stmt-body content">${contentHtml(statement)}</div></div>`,
    )
    .join('');
  return `<div class="q">${questionLabel(item.number)}<div class="q-body content">${contentHtml(item.question.content)}</div><div class="statements">${statements}</div></div>`;
}

function renderQuestion(item: NumberedQuestion): string {
  return item.question.type === QuestionType.true_false_group
    ? renderTrueFalse(item)
    : renderSingleChoice(item);
}

function renderHeader(input: ExamPrintInput): string {
  const duration =
    input.durationMinutes != null && input.durationMinutes > 0
      ? `<div class="hdr-duration">Thời gian làm bài: ${input.durationMinutes} phút, không kể thời gian phát đề</div>`
      : '';
  return `<table class="hdr">
<tr>
<td class="hdr-left">
<div class="hdr-brand">${BRAND_NAME}</div>
<div class="hdr-course">${escapeHtml(input.courseName)}</div>
<div class="hdr-rule"></div>
<div class="hdr-pages">(Đề có <span id="${PAGE_COUNT_ELEMENT_ID}">${PAGE_COUNT_PLACEHOLDER}</span> trang)</div>
</td>
<td class="hdr-right">
<div class="hdr-title">${escapeHtml(input.lessonTitle.toLocaleUpperCase('vi'))}</div>
<div class="hdr-subject">Môn: ${SUBJECT_NAME}</div>
${duration}
</td>
</tr>
</table>
<div class="candidate">
<div>Họ, tên thí sinh: ${'.'.repeat(70)}</div>
<div>Số báo danh: ${'.'.repeat(76)}</div>
</div>`;
}

function renderExamBody(
  input: ExamPrintInput,
  numbered: NumberedQuestion[],
): string {
  const part1 = numbered.filter((q) => q.rank === 0);
  const part2 = numbered.filter((q) => q.rank > 0);
  const required = numbered.filter((q) => q.rank === 1);
  const tc1 = numbered.filter((q) => q.rank === 2);
  const tc2 = numbered.filter((q) => q.rank === 3);
  const hasParts = part1.length > 0 && part2.length > 0;
  const hasElectives = tc1.length > 0 || tc2.length > 0;
  const out: string[] = [];

  if (part1.length > 0) {
    if (hasParts) {
      out.push(
        `<p class="part-head"><b>PHẦN I:</b> Thí sinh trả lời từ câu 1 đến câu ${part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.</p>`,
      );
    }
    out.push(...part1.map(renderQuestion));
  }

  if (part2.length > 0) {
    if (hasParts || hasElectives) {
      const answered = required.length + Math.max(tc1.length, tc2.length);
      out.push(
        `<p class="part-head"><b>PHẦN II:</b> Thí sinh trả lời ${answered} câu hỏi. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.</p>`,
      );
    }
    if (!hasElectives) {
      out.push(...part2.map(renderQuestion));
    } else {
      const tc1Name = electiveName(input.elective1Name, 'Tự chọn 1');
      const tc2Name = electiveName(input.elective2Name, 'Tự chọn 2');
      if (required.length > 0) {
        out.push(
          `<p class="section-head">A. Phần chung dành cho tất cả các thí sinh</p>`,
          ...required.map(renderQuestion),
        );
      }
      out.push(
        `<p class="section-head">B. Phần riêng</p>`,
        `<p class="section-note">Thí sinh chỉ được phép chọn một trong hai phần: ${escapeHtml(tc1Name)} (${questionRangeLabel(tc1.map((q) => q.number))}) hoặc ${escapeHtml(tc2Name)} (${questionRangeLabel(tc2.map((q) => q.number))}). Thí sinh không được tính điểm nếu làm cả hai phần.</p>`,
        `<p class="section-head">B1. ${escapeHtml(tc1Name)}</p>`,
        ...tc1.map(renderQuestion),
        `<p class="section-head">B2. ${escapeHtml(tc2Name)}</p>`,
        ...tc2.map(renderQuestion),
      );
    }
  }

  out.push(
    `<div class="end"><div class="end-mark">—— HẾT ——</div><div class="end-note">Thí sinh không được sử dụng tài liệu; Giám thị không giải thích gì thêm.</div></div>`,
  );
  return out.join('\n');
}

const ANSWER_CHUNK = 10;

function renderPart1Answers(part1: NumberedQuestion[]): string {
  const chunks: NumberedQuestion[][] = [];
  for (let i = 0; i < part1.length; i += ANSWER_CHUNK) {
    chunks.push(part1.slice(i, i + ANSWER_CHUNK));
  }
  const tables = chunks
    .map(
      (chunk) =>
        `<table class="ans"><thead><tr><th>Câu</th><th>Đáp án</th></tr></thead><tbody>${chunk
          .map((q) => {
            const index = q.question.correctIndex;
            const letter = index != null ? (OPTION_LETTERS[index] ?? '') : '';
            return `<tr><td>${q.number}</td><td>${letter}</td></tr>`;
          })
          .join('')}</tbody></table>`,
    )
    .join('');
  return `<div class="ans-grid">${tables}</div>`;
}

function renderPart2Answers(
  input: ExamPrintInput,
  part2: NumberedQuestion[],
): string {
  const columns = Math.max(4, ...part2.map((q) => q.question.options.length));
  const hasElectives = part2.some((q) => q.rank > 1);
  const groupTitle = (rank: number) =>
    rank === 1
      ? 'Bắt buộc'
      : rank === 2
        ? electiveName(input.elective1Name, 'Tự chọn 1')
        : electiveName(input.elective2Name, 'Tự chọn 2');
  const rows: string[] = [];
  let lastRank = -1;
  for (const q of part2) {
    if (hasElectives && q.rank !== lastRank) {
      rows.push(
        `<tr class="ans-group"><td colspan="${columns + 1}">${escapeHtml(groupTitle(q.rank))}</td></tr>`,
      );
      lastRank = q.rank;
    }
    const cells = Array.from({ length: columns }, (_, i) => {
      const value = q.question.tfAnswerKey?.[i];
      return `<td>${value === true ? 'Đ' : value === false ? 'S' : ''}</td>`;
    }).join('');
    rows.push(`<tr><td>${q.number}</td>${cells}</tr>`);
  }
  const head = Array.from(
    { length: columns },
    (_, i) => `<th>${STATEMENT_LETTERS[i]}</th>`,
  ).join('');
  return `<table class="ans ans-tf"><thead><tr><th>Câu</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderAnswers(
  input: ExamPrintInput,
  numbered: NumberedQuestion[],
): string {
  const part1 = numbered.filter((q) => q.rank === 0);
  const part2 = numbered.filter((q) => q.rank > 0);
  const hasParts = part1.length > 0 && part2.length > 0;
  const out = [
    `<section id="${ANSWER_SECTION_ID}" class="answers">`,
    `<div class="ans-title">ĐÁP ÁN</div>`,
    `<div class="ans-subtitle">${escapeHtml(input.lessonTitle)}</div>`,
  ];
  if (part1.length > 0) {
    if (hasParts) out.push(`<p class="part-head"><b>PHẦN I</b></p>`);
    out.push(renderPart1Answers(part1));
  }
  if (part2.length > 0) {
    if (hasParts) out.push(`<p class="part-head"><b>PHẦN II</b></p>`);
    out.push(renderPart2Answers(input, part2));
  }
  out.push('</section>');
  return out.join('\n');
}

const EXAM_CSS = `
html,body{margin:0;padding:0;background:#fff}
body{font-family:"Times New Roman","Liberation Serif",FreeSerif,Times,serif;font-size:12pt;line-height:1.35;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
code,pre,kbd,samp{font-family:"Courier New","Liberation Mono",FreeMono,monospace;font-size:11pt}
pre{white-space:pre-wrap;margin:2pt 0}
img{max-width:100%;height:auto}
.katex{font-size:1.05em}
.content p{margin:0 0 2pt}
.content ul,.content ol{margin:0 0 2pt;padding-left:20pt}
.content table{border-collapse:collapse;margin:3pt 0}
.content td,.content th{border:1px solid #000;padding:2pt 5pt;vertical-align:top}
.hdr{width:100%;border-collapse:collapse;margin-bottom:6pt}
.hdr td{vertical-align:top;text-align:center;padding:0 2pt}
.hdr-left{width:40%}
.hdr-brand,.hdr-title,.hdr-subject{font-weight:bold}
.hdr-course{font-weight:bold}
.hdr-pages,.hdr-duration{font-style:italic}
.hdr-rule{width:35%;margin:3pt auto;border-top:1px solid #000}
.candidate{margin:4pt 0 8pt}
.candidate div{white-space:nowrap;overflow:hidden}
.part-head{margin:8pt 0 4pt;text-align:justify}
.section-head{margin:6pt 0 3pt;font-weight:bold}
.section-note{margin:0 0 4pt;font-style:italic;text-align:justify}
.q{margin:0 0 5pt}
.q::after{content:"";display:block;clear:both}
.q-label{float:left;font-weight:bold;margin-right:4pt}
.q-body{text-align:justify}
.options{display:grid;grid-template-columns:minmax(0,1fr);column-gap:10pt;row-gap:1pt;margin-top:1pt;clear:both}
.options[data-cols="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.options[data-cols="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}
.options.measuring .opt{width:max-content}
.opt,.stmt{display:flex;gap:4pt;break-inside:avoid}
.opt-label{font-weight:bold;flex:none}
.stmt-label{flex:none}
.opt-body,.stmt-body{min-width:0;flex:1 1 auto}
.statements{margin-top:1pt;clear:both}
.end{margin-top:12pt;text-align:center;break-inside:avoid}
.end-mark{font-weight:bold}
.end-note{font-style:italic;margin-top:2pt}
.answers{break-before:page}
.answers.hidden{display:none}
.ans-title{text-align:center;font-weight:bold;font-size:14pt}
.ans-subtitle{text-align:center;margin-bottom:8pt}
.ans-grid{display:flex;flex-wrap:wrap;gap:12pt;align-items:flex-start}
table.ans{border-collapse:collapse}
table.ans th,table.ans td{border:1px solid #000;padding:2pt 10pt;text-align:center}
table.ans tr{break-inside:avoid}
.ans-group td{text-align:left;font-weight:bold;font-style:italic}
`;

/**
 * Tài liệu HTML đầy đủ của Đề in. `katexCss` do renderer nạp (font nhúng
 * base64) — tham số để builder thuần, test không cần đọc file.
 */
export function buildExamPrintHtml(
  input: ExamPrintInput,
  katexCss = '',
): string {
  const numbered = numberExamQuestions(input.questions);
  const answers = input.withAnswers ? renderAnswers(input, numbered) : '';
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.lessonTitle)}</title>
<style>${katexCss}</style>
<style>${EXAM_CSS}</style>
</head>
<body>
${renderHeader(input)}
<main class="exam">
${renderExamBody(input, numbered)}
</main>
${answers}
</body>
</html>`;
}

/** Footer mỗi trang: "Trang x/N – <tên tiết>" (span `pageNumber`/`totalPages` của Chromium). */
export function buildExamFooterTemplate(lessonTitle: string): string {
  return `<div style="width:100%;font-family:'Times New Roman','Liberation Serif',FreeSerif,serif;font-size:10pt;text-align:center;color:#000;padding:0 15mm;">Trang <span class="pageNumber"></span>/<span class="totalPages"></span> – ${escapeHtml(lessonTitle)}</div>`;
}
