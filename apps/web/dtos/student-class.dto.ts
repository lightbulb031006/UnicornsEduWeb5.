import type { ClassStatus } from "@/dtos/class.dto";

/** Thẻ lớp đang học trên trang chủ học sinh (`GET /users/me/student-classes`). */
export interface StudentClassCardItem {
  classId: string;
  className: string;
  courseName: string;
  teacherNames: string[];
  /** Signed URL ảnh bìa lớp; null = hiện mascot theo ID lớp. */
  coverImageUrl: string | null;
}

/** Đầu trang lớp học sinh (`GET /users/me/student-classes/:classId/detail`). */
export interface StudentClassDetail {
  classId: string;
  className: string;
  classStatus: ClassStatus;
  courseName: string;
  /** Họ tên Gia sư đứng lớp đang hoạt động; rỗng = ẩn khối. */
  teacherNames: string[];
}

export interface StudentSessionItem {
  id: string;
  teacherId: string;
  classId: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  lessonContent: string | null;
  homework: string | null;
  tutorial: string | null;
  recordingUrl: string | null;
  coefficient: number;
  attendance: Array<{
    id: string;
    studentId: string;
    status: string;
    notes: string | null;
  }>;
  teacher: {
    id: string;
    user: {
      first_name: string | null;
      last_name: string | null;
    };
  };
}

export interface StudentSurveyItem {
  id: string;
  classId: string | null;
  surveyId: string | null;
  teacherId: string | null;
  reportDate: Date;
  knowledgeAssessment: string | null;
  survey: {
    id: string;
    name: string | null;
    startDate: Date | null;
    endDate: Date | null;
  } | null;
  studentAssessments: Array<{
    id: string;
    studentId: string;
    knowledgeAssessment: string | null;
    comment: string | null;
  }>;
}
