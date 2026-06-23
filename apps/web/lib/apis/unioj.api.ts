import { api } from "../client";
import type { UniojReportDto } from "@/dtos/unioj.dto";

export async function getUniojReport(
  name: string,
  days?: number
): Promise<UniojReportDto> {
  const response = await api.get<UniojReportDto>("/unioj/report", {
    params: { name, days },
  });
  return response.data;
}

export async function getUniojReportPdfBlob(
  name: string,
  days?: number
): Promise<Blob> {
  const response = await api.get<Blob>("/unioj/report/pdf", {
    params: { name, days },
    responseType: "blob",
  });
  return response.data;
}

export async function getClassesLevels(
  classIds: string[]
): Promise<Record<string, string | null>> {
  const response = await api.get<Record<string, string | null>>("/unioj/classes-levels", {
    params: { classIds: classIds.join(",") },
  });
  return response.data;
}

