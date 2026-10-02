export interface StudentClassItem {
  id: string;
  studentId: string;
  classId: string;
  status: string | null;
  customStudentTuitionPerSession: number | null;
  customTuitionPackageTotal: number | null;
  customTuitionPackageSession: number | null;
  totalAttendedSession: number | null;
  createdAt: Date;
  class: {
    id: string;
    name: string;
    status: string;
    course: {
      id: string;
      name: string;
    };
    teachers: Array<{
      teacher: {
        id: string;
        user: {
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
      };
    }>;
    sessions: Array<{
      id: string;
      date: Date;
    }>;
    _count: {
      sessions: number;
    };
  };
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
