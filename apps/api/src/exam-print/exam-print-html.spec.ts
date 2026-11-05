import { QuestionSlot, QuestionType } from 'generated/enums';
import { countPdfPages, formatPageCount } from './exam-pdf-renderer.service';
import {
  buildExamPrintHtml,
  numberExamQuestions,
  questionRangeLabel,
  sanitizeContentHtml,
  type ExamPrintInput,
  type ExamPrintQuestion,
} from './exam-print-html';

const sc = (content: string, correctIndex = 0): ExamPrintQuestion => ({
  type: QuestionType.single_choice,
  slot: QuestionSlot.required,
  content,
  options: ['<p>x</p>', '<p>y</p>', '<p>z</p>', '<p>t</p>'],
  correctIndex,
  tfAnswerKey: null,
});
const tf = (
  content: string,
  slot: QuestionSlot = QuestionSlot.required,
  key = [true, false, true, false],
): ExamPrintQuestion => ({
  type: QuestionType.true_false_group,
  slot,
  content,
  options: ['<p>s1</p>', '<p>s2</p>', '<p>s3</p>', '<p>s4</p>'],
  correctIndex: null,
  tfAnswerKey: key,
});

const input = (
  questions: ExamPrintQuestion[],
  overrides: Partial<ExamPrintInput> = {},
): ExamPrintInput => ({
  courseName: 'Tin 12',
  lessonTitle: 'Đề ôn số 1',
  durationMinutes: 50,
  elective1Name: 'Khoa học máy tính',
  elective2Name: 'Tin học ứng dụng',
  questions,
  withAnswers: false,
  ...overrides,
});

describe('numberExamQuestions', () => {
  it('Phần I đánh từ 1; Phần II đánh lại từ 1, liên tục qua bắt buộc → TC1 → TC2', () => {
    const numbered = numberExamQuestions([
      tf('e2', QuestionSlot.elective_2),
      sc('c1'),
      tf('r1'),
      tf('e1', QuestionSlot.elective_1),
      sc('c2'),
    ]);
    expect(numbered.map((q) => [q.question.content, q.number, q.rank])).toEqual(
      [
        ['c1', 1, 0],
        ['c2', 2, 0],
        ['r1', 1, 1],
        ['e1', 2, 2],
        ['e2', 3, 3],
      ],
    );
  });
});

describe('questionRangeLabel', () => {
  it('một, hai, nhiều câu', () => {
    expect(questionRangeLabel([3])).toBe('Câu 3');
    expect(questionRangeLabel([3, 4])).toBe('Câu 3 và Câu 4');
    expect(questionRangeLabel([3, 4, 5])).toBe('Câu 3 đến Câu 5');
  });
});

describe('sanitizeContentHtml', () => {
  it('bỏ script, iframe, handler sự kiện và javascript: URL', () => {
    const html = sanitizeContentHtml(
      '<p onclick="x()">a</p><script>fetch("http://x")</script><iframe src="http://x"></iframe><a href="javascript:alert(1)">b</a><link rel="stylesheet" href="http://x">',
    );
    expect(html).toBe('<p>a</p><a>b</a>');
  });
});

describe('buildExamPrintHtml', () => {
  it('header UniEdu, không có chữ Bộ GD&ĐT / Đề thi chính thức', () => {
    const html = buildExamPrintHtml(input([sc('c1')]));
    expect(html).toContain('UNIEDU');
    expect(html).toContain('Tin 12');
    expect(html).toContain('ĐỀ ÔN SỐ 1');
    expect(html).toContain('Môn: TIN HỌC');
    expect(html).toContain(
      'Thời gian làm bài: 50 phút, không kể thời gian phát đề',
    );
    expect(html).toContain(
      '(Đề có <span id="exam-page-count">00</span> trang)',
    );
    expect(html).not.toMatch(/BỘ GIÁO DỤC|CHÍNH THỨC/i);
    expect(html).toContain('—— HẾT ——');
  });

  it('không có thời gian thì bỏ dòng thời gian', () => {
    const html = buildExamPrintHtml(
      input([sc('c1')], { durationMinutes: null }),
    );
    expect(html).not.toContain('Thời gian làm bài');
  });

  it('đề một loại câu không có tiêu đề Phần', () => {
    expect(buildExamPrintHtml(input([sc('a'), sc('b')]))).not.toContain(
      'PHẦN I',
    );
    expect(buildExamPrintHtml(input([tf('a'), tf('b')]))).not.toContain(
      'PHẦN II',
    );
  });

  it('đề đủ hai phần + nhóm tự chọn theo form Bộ', () => {
    const html = buildExamPrintHtml(
      input([
        sc('c1'),
        sc('c2'),
        tf('r1'),
        tf('r2'),
        tf('a1', QuestionSlot.elective_1),
        tf('a2', QuestionSlot.elective_1),
        tf('b1', QuestionSlot.elective_2),
        tf('b2', QuestionSlot.elective_2),
      ]),
    );
    expect(html).toContain(
      '<b>PHẦN I:</b> Thí sinh trả lời từ câu 1 đến câu 2.',
    );
    expect(html).toContain('<b>PHẦN II:</b> Thí sinh trả lời 4 câu hỏi.');
    expect(html).toContain('A. Phần chung dành cho tất cả các thí sinh');
    expect(html).toContain(
      'Thí sinh chỉ được phép chọn một trong hai phần: Khoa học máy tính (Câu 3 và Câu 4) hoặc Tin học ứng dụng (Câu 5 và Câu 6).',
    );
    expect(html).toContain('B1. Khoa học máy tính');
    expect(html).toContain('B2. Tin học ứng dụng');
    expect(html).not.toContain('exam-answers');
  });

  it('nhóm tự chọn chưa đặt tên thì dùng Tự chọn 1/2', () => {
    const html = buildExamPrintHtml(
      input(
        [tf('a1', QuestionSlot.elective_1), tf('b1', QuestionSlot.elective_2)],
        { elective1Name: null, elective2Name: '  ' },
      ),
    );
    expect(html).toContain('B1. Tự chọn 1');
    expect(html).toContain('B2. Tự chọn 2');
  });

  it('bản có đáp án: Phần I chữ cái đúng, Phần II Đ/S theo nhóm', () => {
    const html = buildExamPrintHtml(
      input(
        [
          sc('c1', 2),
          tf('r1'),
          tf('a1', QuestionSlot.elective_1, [false, false, true, true]),
          tf('b1', QuestionSlot.elective_2),
        ],
        { withAnswers: true },
      ),
    );
    expect(html).toContain('id="exam-answers"');
    expect(html).toContain('<tr><td>1</td><td>C</td></tr>');
    expect(html).toContain(
      '<tr><td>1</td><td>Đ</td><td>S</td><td>Đ</td><td>S</td></tr>',
    );
    expect(html).toContain(
      '<tr><td>2</td><td>S</td><td>S</td><td>Đ</td><td>Đ</td></tr>',
    );
    expect(html).toContain('<td colspan="5">Bắt buộc</td>');
    expect(html).toContain('<td colspan="5">Khoa học máy tính</td>');
  });

  it('escape tên khoá / tiết', () => {
    const html = buildExamPrintHtml(
      input([sc('c1')], { courseName: '<b>x</b>', lessonTitle: 'a & b' }),
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('render công thức KaTeX', () => {
    const html = buildExamPrintHtml(input([sc('<p>$x^2$</p>')]));
    expect(html).toContain('class="katex"');
  });
});

describe('countPdfPages / formatPageCount', () => {
  it('lấy /Count của nút gốc', () => {
    const pdf = Buffer.from(
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 5 >> << /Type /Pages /Count 2 /Parent 1 0 R >>',
      'latin1',
    );
    expect(countPdfPages(pdf)).toBe(5);
    expect(formatPageCount(4)).toBe('04');
    expect(formatPageCount(12)).toBe('12');
  });
});
