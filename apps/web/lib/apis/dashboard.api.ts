import {
  AdminDashboardActionAlertGroup,
  AdminDashboardActionAlertList,
  AdminDashboardDto,
  AdminDashboardFinancialDetail,
  AdminDashboardFinancialDetailRowKey,
  AdminDashboardFinancialExport,
  AdminDashboardMonthlyStatistics,
  AdminDashboardActiveClassBreakdown,
  AdminDashboardStudentBalanceItem,
  AdminDashboardStudentChurnItem,
  AdminDashboardStudentChurnType,
  AdminDashboardTopupHistoryItem,
} from "@/dtos/dashboard.dto";
import { api } from "../client";

export async function getAdminDashboard(params?: {
  month?: string;
  year?: string;
  alertLimit?: number;
  topClassLimit?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminDashboardDto> {
  const response = await api.get<AdminDashboardDto>("/dashboard", {
    params: {
      ...(params?.month ? { month: params.month } : {}),
      ...(params?.year ? { year: params.year } : {}),
      ...(typeof params?.alertLimit === "number" ? { alertLimit: params.alertLimit } : {}),
      ...(typeof params?.topClassLimit === "number" ? { topClassLimit: params.topClassLimit } : {}),
      ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
    },
  });

  return response.data;
}

export async function getAdminDashboardActionAlerts(params: {
  group: AdminDashboardActionAlertGroup;
  month?: string;
  year?: string;
  page?: number;
  limit?: number;
}): Promise<AdminDashboardActionAlertList> {
  const response = await api.get<AdminDashboardActionAlertList>("/dashboard/action-alerts", {
    params: {
      group: params.group,
      ...(params.month ? { month: params.month } : {}),
      ...(params.year ? { year: params.year } : {}),
      ...(typeof params.page === "number" ? { page: params.page } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
    },
  });

  return response.data;
}

export async function getAdminTopupHistory(params?: {
  month?: string;
  year?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminDashboardTopupHistoryItem[]> {
  const response = await api.get<AdminDashboardTopupHistoryItem[]>("/dashboard/topup-history", {
    params: {
      ...(params?.month ? { month: params.month } : {}),
      ...(params?.year ? { year: params.year } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
    },
  });

  return response.data;
}

export async function getAdminStudentBalanceDetails(params?: {
  limit?: number;
  month?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminDashboardStudentBalanceItem[]> {
  const response = await api.get<AdminDashboardStudentBalanceItem[]>("/dashboard/student-balance-details", {
    params: {
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(params?.month ? { month: params.month } : {}),
      ...(params?.year ? { year: params.year } : {}),
      ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
    },
  });

  return response.data;
}

export async function getAdminStudentChurnDetails(params: {
  type: AdminDashboardStudentChurnType;
  month?: string;
  year?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminDashboardStudentChurnItem[]> {
  const response = await api.get<AdminDashboardStudentChurnItem[]>("/dashboard/student-churn-details", {
    params: {
      type: params.type,
      ...(params.month ? { month: params.month } : {}),
      ...(params.year ? { year: params.year } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
      ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params.dateTo ? { dateTo: params.dateTo } : {}),
    },
  });

  return response.data;
}

export async function getAdminActiveClassBreakdown(): Promise<AdminDashboardActiveClassBreakdown> {
  const response = await api.get<AdminDashboardActiveClassBreakdown>(
    "/dashboard/active-class-breakdown",
  );
  return response.data;
}

export async function getAdminMonthlyStatistics(params: {
  fromMonth: string;
  fromYear: string;
  toMonth: string;
  toYear: string;
}): Promise<AdminDashboardMonthlyStatistics> {
  const response = await api.get<AdminDashboardMonthlyStatistics>("/dashboard/monthly-statistics", {
    params: {
      fromMonth: params.fromMonth,
      fromYear: params.fromYear,
      toMonth: params.toMonth,
      toYear: params.toYear,
    },
  });

  return response.data;
}

/** Tải PDF thống kê theo tháng (charts + bảng), trả Blob + filename để download trực tiếp. */
export async function downloadAdminMonthlyStatisticsPdf(params: {
  fromMonth: string;
  fromYear: string;
  toMonth: string;
  toYear: string;
}): Promise<{ blob: Blob; filename: string }> {
  const response = await api.get<Blob>("/dashboard/monthly-statistics/pdf", {
    params: {
      fromMonth: params.fromMonth,
      fromYear: params.fromYear,
      toMonth: params.toMonth,
      toYear: params.toYear,
    },
    responseType: "blob",
  });

  const contentDisposition = response.headers["content-disposition"] as string | undefined;
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
  const filename =
    filenameMatch?.[1] ??
    `thong-ke-thang-${params.fromYear}-${params.fromMonth}_${params.toYear}-${params.toMonth}.pdf`;

  return { blob: response.data, filename };
}

export async function getAdminDashboardFinancialDetail(params: {
  rowKey: AdminDashboardFinancialDetailRowKey;
  month?: string;
  year?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  customerSource?: string;
}): Promise<AdminDashboardFinancialDetail> {
  const response = await api.get<AdminDashboardFinancialDetail>("/dashboard/financial-detail", {
    params: {
      rowKey: params.rowKey,
      ...(params.month ? { month: params.month } : {}),
      ...(params.year ? { year: params.year } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
      ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params.dateTo ? { dateTo: params.dateTo } : {}),
      ...(params.customerSource ? { customerSource: params.customerSource } : {}),
    },
  });

  return response.data;
}

export async function getAdminDashboardFinancialExport(params?: {
  month?: string;
  year?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminDashboardFinancialExport> {
  const response = await api.get<AdminDashboardFinancialExport>("/dashboard/financial-export", {
    params: {
      ...(params?.month ? { month: params.month } : {}),
      ...(params?.year ? { year: params.year } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
      ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
    },
  });

  return response.data;
}

async function downloadFinancialExportFile(
  path: string,
  fallbackFilename: string,
  params?: {
    month?: string;
    year?: string;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.get<Blob>(path, {
    params: {
      ...(params?.month ? { month: params.month } : {}),
      ...(params?.year ? { year: params.year } : {}),
      ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
      ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
    },
    responseType: "blob",
  });

  const contentDisposition = response.headers["content-disposition"] as string | undefined;
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  return { blob: response.data, filename };
}

/** Tải PDF báo cáo tài chính render sẵn ở server, trả Blob + filename để download trực tiếp (không mở popup). */
export async function downloadAdminDashboardFinancialExportPdf(params?: {
  month?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ blob: Blob; filename: string }> {
  return downloadFinancialExportFile(
    "/dashboard/financial-export/pdf",
    "bao-cao-tai-chinh.pdf",
    params,
  );
}

/** Tải Excel báo cáo tài chính (sheet 1: Doanh thu, sheet 2: Chi phí), trả Blob + filename để download trực tiếp. */
export async function downloadAdminDashboardFinancialExportExcel(params?: {
  month?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ blob: Blob; filename: string }> {
  return downloadFinancialExportFile(
    "/dashboard/financial-export/excel",
    "bao-cao-tai-chinh.xlsx",
    params,
  );
}
