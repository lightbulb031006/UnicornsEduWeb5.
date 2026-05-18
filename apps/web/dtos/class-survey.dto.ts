export interface ClassSurveyTeacher {
  id: string;
  fullName: string;
  status?: string | null;
}

export interface ClassSurveyRecord {
  id: string;
  classId: string | null;
  testNumber: number;
  teacherId: string | null;
  reportDate: string;
  content: string;
  createdAt?: string | null;
  teacher?: ClassSurveyTeacher | null;
}

export interface ClassSurveyMonthYearParams {
  month: string;
  year: string;
}

export interface CreateClassSurveyPayload {
  test_number: number;
  report_date?: string;
  teacher_id: string;
  content: string;
}

export type UpdateClassSurveyPayload = Partial<CreateClassSurveyPayload>;

