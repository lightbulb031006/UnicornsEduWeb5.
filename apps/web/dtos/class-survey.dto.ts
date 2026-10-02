export interface ClassSurveyTeacher {
  id: string;
  fullName: string;
  status?: string | null;
}

export interface ClassSurveySummary {
  id: string;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface ClassSurveyStudentAssessment {
  studentId: string;
  fullName: string;
  comment: string | null;
}

export interface ClassSurveyRecord {
  id: string;
  classId: string | null;
  surveyId: string | null;
  survey?: ClassSurveySummary | null;
  testNumber: number | null;
  teacherId: string | null;
  reportDate: string;
  content: string | null;
  /** Đánh giá kiến thức dùng chung cho cả báo cáo (không phải theo từng học sinh). */
  knowledgeAssessment: string | null;
  createdAt?: string | null;
  teacher?: ClassSurveyTeacher | null;
  students: ClassSurveyStudentAssessment[];
}

export interface ClassSurveyMonthYearParams {
  month: string;
  year: string;
}

export interface ClassSurveyStudentAssessmentPayload {
  student_id: string;
  comment?: string;
}

export interface CreateClassSurveyPayload {
  survey_id: string;
  report_date?: string;
  teacher_id: string;
  knowledge_assessment?: string;
  students: ClassSurveyStudentAssessmentPayload[];
}

export type UpdateClassSurveyPayload = Partial<CreateClassSurveyPayload>;
