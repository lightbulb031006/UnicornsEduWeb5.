import {
  AccountantSurveyWarning,
  CreateSurveyPayload,
  DismissSurveyWarningPayload,
  SurveyListResponse,
  SurveyMissingClassList,
  SurveyRecord,
  SurveyReportedClassList,
  TeacherSurveyWarning,
  UpdateSurveyPayload,
} from "@/dtos/survey.dto";
import { api } from "../client";

export async function getSurveys(params?: {
  page?: number;
  limit?: number;
}): Promise<SurveyListResponse> {
  const response = await api.get<SurveyListResponse>("/surveys", {
    params: {
      ...(typeof params?.page === "number" ? { page: params.page } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
    },
  });
  return response.data;
}

export async function getSurveyById(id: string): Promise<SurveyRecord> {
  const response = await api.get<SurveyRecord>(
    `/surveys/${encodeURIComponent(id)}`,
  );
  return response.data;
}

export async function createSurvey(
  payload: CreateSurveyPayload,
): Promise<SurveyRecord> {
  const response = await api.post<SurveyRecord>("/surveys", payload);
  return response.data;
}

export async function updateSurvey(
  id: string,
  payload: UpdateSurveyPayload,
): Promise<SurveyRecord> {
  const response = await api.patch<SurveyRecord>(
    `/surveys/${encodeURIComponent(id)}`,
    payload,
  );
  return response.data;
}

export async function deleteSurvey(id: string): Promise<void> {
  await api.delete(`/surveys/${encodeURIComponent(id)}`);
}

export async function getSurveyMissingClasses(
  id: string,
  params?: { page?: number; limit?: number },
): Promise<SurveyMissingClassList> {
  const response = await api.get<SurveyMissingClassList>(
    `/surveys/${encodeURIComponent(id)}/missing-classes`,
    {
      params: {
        ...(typeof params?.page === "number" ? { page: params.page } : {}),
        ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      },
    },
  );
  return response.data;
}

export async function getSurveyReportedClasses(
  id: string,
  params?: { page?: number; limit?: number },
): Promise<SurveyReportedClassList> {
  const response = await api.get<SurveyReportedClassList>(
    `/surveys/${encodeURIComponent(id)}/reported-classes`,
    {
      params: {
        ...(typeof params?.page === "number" ? { page: params.page } : {}),
        ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      },
    },
  );
  return response.data;
}

export async function getOpenSurveys(): Promise<
  { id: string; name: string | null; startDate: string | null; endDate: string | null }[]
> {
  const response = await api.get<
    { id: string; name: string | null; startDate: string | null; endDate: string | null }[]
  >("/survey-warnings/open-surveys");
  return response.data;
}

export async function getMyTeacherSurveyWarnings(): Promise<
  TeacherSurveyWarning[]
> {
  const response = await api.get<TeacherSurveyWarning[]>(
    "/survey-warnings/my-warnings",
  );
  return response.data;
}

export async function getAccountantSurveyWarnings(): Promise<
  AccountantSurveyWarning[]
> {
  const response = await api.get<AccountantSurveyWarning[]>(
    "/survey-warnings/accountant-warnings",
  );
  return response.data;
}

export async function dismissAccountantSurveyWarning(
  payload: DismissSurveyWarningPayload,
): Promise<void> {
  await api.post("/survey-warnings/accountant-warnings/dismiss", payload);
}
