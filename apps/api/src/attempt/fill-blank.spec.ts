import { QuestionType } from 'generated/enums';
import { blankFieldsOf, normalizeBlankAnswer } from './fill-blank';

describe('normalizeBlankAnswer — luật so khớp ô trống', () => {
  it('bỏ khoảng trắng đầu/cuối, kể cả khoảng trắng toàn góc', () => {
    expect(normalizeBlankAnswer('　 がっこう 　')).toBe('がっこう');
  });

  it('coi chữ số và Latin toàn góc như nửa góc, không phân biệt hoa/thường', () => {
    expect(normalizeBlankAnswer('１２３')).toBe('123');
    expect(normalizeBlankAnswer('ＮＨＫ')).toBe('nhk');
    expect(normalizeBlankAnswer('Nhk')).toBe('nhk');
  });

  it('không coi hiragana, katakana, kanji là tương đương', () => {
    const forms = ['がっこう', 'ガッコウ', '学校'].map(normalizeBlankAnswer);
    expect(new Set(forms).size).toBe(3);
  });
});

describe('blankFieldsOf — ô trống trả cho client', () => {
  it('câu điền ô trống: số ô theo đáp án, chữ đã gõ đủ độ dài', () => {
    expect(
      blankFieldsOf(QuestionType.fill_blank, [['a'], ['b'], ['c']], ['x']),
    ).toEqual({ blankCount: 3, blankAnswers: ['x', null, null] });
  });

  it('loại khác không có ô', () => {
    expect(blankFieldsOf(QuestionType.essay, null, null)).toEqual({
      blankCount: null,
      blankAnswers: null,
    });
  });
});
