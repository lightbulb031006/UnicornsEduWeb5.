export interface SurveyRecord {
  id: string;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  notificationTitle: string | null;
  notificationContent: string | null;
  notificationInstructions: string | null;
  notificationNotes: string | null;
  notificationTeacherNote: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  excludedClassIds: string[];
  totalRunningClasses: number;
  reportedCount: number;
  missingCount: number;
}

export interface SurveyListResponse {
  data: SurveyRecord[];
  meta: { total: number; page: number; limit: number };
}

export interface CreateSurveyPayload {
  name: string;
  start_date: string;
  end_date: string;
  notification_title?: string;
  notification_content?: string;
  notification_instructions?: string;
  notification_notes?: string;
  notification_teacher_note?: string;
  excluded_class_ids?: string[];
}

export type UpdateSurveyPayload = Partial<CreateSurveyPayload>;

export interface SurveyMissingClass {
  classId: string;
  name: string;
  teachers: string[];
}

export interface SurveyMissingClassList {
  data: SurveyMissingClass[];
  meta: { total: number; page: number; limit: number };
}

export interface SurveyReportedClass {
  classId: string;
  name: string;
  teachers: string[];
  reportDate: string | null;
  reportedByTeacherName: string | null;
  knowledgeAssessment: string | null;
}

export interface SurveyReportedClassList {
  data: SurveyReportedClass[];
  meta: { total: number; page: number; limit: number };
}

export interface TeacherSurveyPendingItem {
  surveyId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface TeacherSurveyWarning {
  classId: string;
  className: string;
  pendingSurveys: TeacherSurveyPendingItem[];
}

export interface AccountantSurveyWarning {
  staffId: string;
  staffName: string;
  surveyId: string;
  surveyName: string;
  endDate: string | null;
  classes: { classId: string; name: string }[];
}

export interface DismissSurveyWarningPayload {
  staff_id: string;
  survey_id: string;
  permanent?: boolean;
}
