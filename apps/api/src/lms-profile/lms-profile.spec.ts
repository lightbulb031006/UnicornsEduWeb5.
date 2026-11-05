import { loadLmsProfile } from './lms-profile';

describe('loadLmsProfile', () => {
  it.each(['it', 'jp', 'eng', 'math', ' IT '])('chấp nhận %p', (value) => {
    expect(loadLmsProfile({ LMS_PROFILE: value }).profile).toBe(
      value.trim().toLowerCase(),
    );
  });

  it.each([undefined, '', 'legacy'])('từ chối %p', (value) => {
    expect(() => loadLmsProfile({ LMS_PROFILE: value })).toThrow(/LMS_PROFILE/);
  });

  it('IT chấm điểm tuyệt đối, không có tự luận', () => {
    const it = loadLmsProfile({ LMS_PROFILE: 'it' });
    expect(it.scoring).toBe('absolute_it');
    expect(it.questionTypes).not.toContain('essay');
    expect(it.questionTypes).toContain('true_false_group');
  });

  it('Toán giữ thang 100, trắc nghiệm và tự luận', () => {
    const math = loadLmsProfile({ LMS_PROFILE: 'math' });
    expect(math.scoring).toBe('equal_100');
    expect(math.questionTypes).toEqual(['single_choice', 'essay']);
    expect(math.examPrint).toBe(false);
  });

  it('JP giữ 100/N và tự luận', () => {
    const jp = loadLmsProfile({ LMS_PROFILE: 'jp' });
    expect(jp.scoring).toBe('equal_100');
    expect(jp.questionTypes).toContain('essay');
  });
});
