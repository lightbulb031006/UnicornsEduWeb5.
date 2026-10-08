import {
  classRequiredForSurveyWhere,
  isSurveyRequiredFor,
} from './survey-requirement';

const utcDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('isSurveyRequiredFor', () => {
  // 20/09 08:00 giờ Việt Nam.
  const surveyCreatedAt = new Date('2026-09-20T01:00:00.000Z');

  it('exempts a class without any session', () => {
    expect(isSurveyRequiredFor(surveyCreatedAt, { sessions: [] })).toBe(false);
  });

  it('exempts a class whose first session is after the survey creation date', () => {
    expect(
      isSurveyRequiredFor(surveyCreatedAt, {
        sessions: [{ date: utcDate('2026-09-21') }],
      }),
    ).toBe(false);
  });

  it('requires a class whose first session is on the creation date', () => {
    expect(
      isSurveyRequiredFor(surveyCreatedAt, {
        sessions: [{ date: utcDate('2026-09-20') }],
      }),
    ).toBe(true);
  });

  it('compares dates in Vietnam time, not UTC', () => {
    // 20/09 23:30 UTC = 21/09 06:30 giờ Việt Nam.
    const createdLateUtc = new Date('2026-09-20T23:30:00.000Z');
    expect(
      isSurveyRequiredFor(createdLateUtc, {
        sessions: [{ date: utcDate('2026-09-21') }],
      }),
    ).toBe(true);
  });

  it('exempts a teacher who joined the class after the creation date', () => {
    const sessions = [{ date: utcDate('2026-09-01') }];
    expect(
      isSurveyRequiredFor(surveyCreatedAt, {
        sessions,
        // 21/09 01:00 giờ Việt Nam.
        teacherJoinedAt: new Date('2026-09-20T18:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      isSurveyRequiredFor(surveyCreatedAt, {
        sessions,
        // 20/09 23:00 giờ Việt Nam: cùng ngày tạo bài.
        teacherJoinedAt: new Date('2026-09-20T16:00:00.000Z'),
      }),
    ).toBe(true);
  });
});

describe('classRequiredForSurveyWhere', () => {
  it('filters classes with a session on or before the Vietnam creation date', () => {
    expect(
      classRequiredForSurveyWhere(new Date('2026-09-20T23:30:00.000Z')),
    ).toEqual({
      sessions: { some: { date: { lte: utcDate('2026-09-21') } } },
    });
  });
});
