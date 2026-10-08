import { getUserFullNameFromParts } from 'src/common/user-name.util';
import type { StudentClassCardDto } from 'src/dtos/student.dto';

export type StudentClassCardSource = {
  class: {
    id: string;
    name: string;
    coverImagePath: string | null;
    course: { name: string };
    teachers: Array<{
      teacher: {
        user: { first_name: string | null; last_name: string | null } | null;
      };
    }>;
  };
};

export type StandingTeacherSource = StudentClassCardSource['class']['teachers'];

/**
 * Họ tên Gia sư đứng lớp (bỏ trùng, sắp theo tên). Caller lọc phân công
 * `class_teachers.status = active` trong query; chỉ lấy họ tên, không email.
 */
export function standingTeacherNames(
  teachers: StandingTeacherSource,
): string[] {
  return Array.from(
    new Set(
      teachers
        .map(({ teacher }) => getUserFullNameFromParts(teacher.user))
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'vi'));
}

export function mapStudentClassCard(
  row: StudentClassCardSource,
  coverImageUrl: string | null,
): StudentClassCardDto {
  return {
    classId: row.class.id,
    className: row.class.name,
    courseName: row.class.course.name,
    teacherNames: standingTeacherNames(row.class.teachers),
    coverImageUrl,
  };
}
