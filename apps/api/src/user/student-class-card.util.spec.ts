import {
  mapStudentClassCard,
  standingTeacherNames,
} from './student-class-card.util';

const teacher = (first_name: string | null, last_name: string | null) => ({
  teacher: { user: { first_name, last_name } },
});

describe('mapStudentClassCard', () => {
  it('maps class, course and teacher full names (last name first)', () => {
    expect(
      mapStudentClassCard(
        {
          class: {
            id: 'c1',
            name: 'Lớp A',
            coverImagePath: null,
            course: { name: 'Khoá X' },
            teachers: [teacher('An', 'Nguyễn Văn')],
          },
        },
        'https://signed/cover',
      ),
    ).toEqual({
      classId: 'c1',
      className: 'Lớp A',
      courseName: 'Khoá X',
      teacherNames: ['Nguyễn Văn An'],
      coverImageUrl: 'https://signed/cover',
    });
  });

  it('drops empty names, dedupes and sorts teacher names', () => {
    const card = mapStudentClassCard(
      {
        class: {
          id: 'c1',
          name: 'Lớp A',
          coverImagePath: null,
          course: { name: 'Khoá X' },
          teachers: [
            teacher('Bình', 'Trần'),
            teacher(null, null),
            { teacher: { user: null } },
            teacher('An', 'Lê'),
            teacher('Bình', 'Trần'),
          ],
        },
      },
      null,
    );
    expect(card.teacherNames).toEqual(['Lê An', 'Trần Bình']);
  });
});

describe('standingTeacherNames', () => {
  it('dedupes, drops empty names and sorts by Vietnamese collation', () => {
    expect(
      standingTeacherNames([
        teacher('Bình', 'Trần'),
        teacher(null, null),
        teacher('An', 'Lê'),
        teacher('Bình', 'Trần'),
      ]),
    ).toEqual(['Lê An', 'Trần Bình']);
  });

  it('returns empty list when class has no standing teacher', () => {
    expect(standingTeacherNames([])).toEqual([]);
  });
});
