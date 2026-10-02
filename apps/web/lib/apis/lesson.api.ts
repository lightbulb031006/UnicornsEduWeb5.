import type {
  BulkUpdateLessonOutputPaymentStatusPayload,
  BulkUpdateLessonOutputPaymentStatusResult,
  CreateLessonOutputPayload,
  CreateLessonResourcePayload,
  CreateLessonTaskPayload,
  LessonOutputItem,
  LessonOutputStaffStatsResponse,
  LessonOutputListItem,
  LessonOutputStaff,
  LessonOutputStaffOption,
  LessonOutputTaskSummary,
  LessonOverviewQueryParams,
  LessonOverviewResponse,
  LessonResourceOption,
  LessonTaskOption,
  LessonResourceItem,
  LessonResourcePreview,
  LessonTaskAssignee,
  LessonTaskDetail,
  LessonTaskItem,
  LessonTaskStaffOption,
  LessonWorkQueryParams,
  LessonWorkOutputItem,
  LessonWorkResponse,
  UpdateLessonOutputPayload,
  UpdateLessonResourcePayload,
  UpdateLessonTaskPayload,
} from "@/dtos/lesson.dto";
import { isLessonOutputDifficultyBand } from "@/lib/lesson-output-pricing";
import { api } from "../client";

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const text = String(item).trim();
    return text ? [text] : [];
  });
}

function normalizeLessonStaffReference(
  value:
    | Partial<LessonTaskAssignee>
    | Partial<LessonTaskStaffOption>
    | Partial<LessonOutputStaff>
    | Partial<LessonOutputStaffOption>
    | undefined,
) {
  if (!value?.id || !value?.fullName) {
    return null;
  }

  const status: "active" | "inactive" =
    value.status === "inactive" ? "inactive" : "active";

  return {
    id: value.id,
    fullName: value.fullName,
    roles: Array.isArray(value.roles) ? value.roles : [],
    status,
  };
}

function normalizeLessonTask(
  value: Partial<LessonTaskItem> | undefined,
): LessonTaskItem {
  const createdByStaff = normalizeLessonStaffReference(
    value?.createdByStaff ?? undefined,
  );
  const directAssignees = Array.isArray(value?.assignees)
    ? value.assignees
        .map((item) => normalizeLessonStaffReference(item))
        .filter((item): item is LessonTaskAssignee => item !== null)
    : [];
  const outputAssignees = Array.isArray(value?.outputAssignees)
    ? value.outputAssignees
        .map((item) => normalizeLessonStaffReference(item))
        .filter((item): item is LessonTaskAssignee => item !== null)
    : [];
  const mergedAssigneeMap = new Map<string, LessonTaskAssignee>();

  for (const assignee of [
    createdByStaff,
    ...directAssignees,
    ...outputAssignees,
  ]) {
    if (!assignee || mergedAssigneeMap.has(assignee.id)) {
      continue;
    }

    mergedAssigneeMap.set(assignee.id, assignee);
  }

  return {
    id: value?.id ?? "",
    title: value?.title ?? null,
    description: value?.description ?? null,
    status: value?.status ?? "pending",
    priority: value?.priority ?? "medium",
    dueDate: value?.dueDate ?? null,
    createdByStaff,
    assignees: Array.from(mergedAssigneeMap.values()),
    outputAssignees,
  };
}

function normalizeLessonTaskStaffOption(
  value: Partial<LessonTaskStaffOption> | undefined,
): LessonTaskStaffOption | null {
  return normalizeLessonStaffReference(value) as LessonTaskStaffOption | null;
}

function normalizeLessonTaskOption(
  value: Partial<LessonTaskOption> | undefined,
): LessonTaskOption | null {
  if (!value?.id) {
    return null;
  }

  return {
    id: value.id,
    title: value.title ?? null,
    status: value.status ?? "pending",
    priority: value.priority ?? "medium",
    dueDate: value.dueDate ?? null,
  };
}

function normalizeLessonOutputStaffOption(
  value: Partial<LessonOutputStaffOption> | undefined,
): LessonOutputStaffOption | null {
  return normalizeLessonStaffReference(value) as LessonOutputStaffOption | null;
}

function normalizeLessonResourcePreview(
  value: Partial<LessonResourcePreview> | undefined,
): LessonResourcePreview | null {
  if (!value?.id || !value?.resourceLink) {
    return null;
  }

  return {
    id: value.id,
    title: value.title ?? null,
    resourceLink: value.resourceLink,
  };
}

function normalizeLessonResourceItem(
  value: Partial<LessonResourceItem> | undefined,
): LessonResourceItem | null {
  if (!value?.id || !value?.resourceLink) {
    return null;
  }

  return {
    id: value.id,
    title: value.title ?? null,
    description: value.description ?? null,
    resourceLink: value.resourceLink,
    lessonTaskId: value.lessonTaskId ?? null,
    tags: normalizeStringList(value.tags),
    createdBy: value.createdBy ?? null,
    createdAt: value.createdAt ?? "",
    updatedAt: value.updatedAt ?? "",
  };
}

function normalizeLessonResourceOption(
  value: Partial<LessonResourceOption> | undefined,
): LessonResourceOption | null {
  if (!value?.id || !value?.resourceLink) {
    return null;
  }

  return {
    id: value.id,
    title: value.title ?? null,
    resourceLink: value.resourceLink,
    tags: normalizeStringList(value.tags),
    lessonTaskId: value.lessonTaskId ?? null,
    lessonTaskTitle: value.lessonTaskTitle ?? null,
  };
}

function normalizeLessonOutputListItem(
  value: Partial<LessonOutputListItem> | undefined,
): LessonOutputListItem | null {
  if (!value?.id || !value?.lessonName) {
    return null;
  }

  return {
    id: value.id,
    lessonName: value.lessonName,
    contestUploaded: value.contestUploaded ?? null,
    date: value.date ?? "",
    staffId: value.staffId ?? null,
    staffDisplayName: value.staffDisplayName ?? null,
    status:
      value.status === "completed" || value.status === "cancelled"
        ? value.status
        : "pending",
    paymentStatus: value.paymentStatus === "paid" ? "paid" : "pending",
  };
}

function normalizeLessonTaskDetail(
  value: Partial<LessonTaskDetail> | undefined,
): LessonTaskDetail {
  const baseTask = normalizeLessonTask(value);

  return {
    ...baseTask,
    outputs: Array.isArray(value?.outputs)
      ? value.outputs
          .map((item) => normalizeLessonOutputListItem(item))
          .filter((item): item is LessonOutputListItem => item !== null)
      : [],
    outputProgress: {
      total: value?.outputProgress?.total ?? 0,
      completed: value?.outputProgress?.completed ?? 0,
    },
    resourcePreview: Array.isArray(value?.resourcePreview)
      ? value.resourcePreview
          .map((item) => normalizeLessonResourcePreview(item))
          .filter((item): item is LessonResourcePreview => item !== null)
      : [],
    contestUploadedSummary: normalizeStringList(value?.contestUploadedSummary),
  };
}

function normalizeLessonOutputTaskSummary(
  value: Partial<LessonOutputTaskSummary> | undefined,
): LessonOutputTaskSummary | null {
  if (!value?.id) {
    return null;
  }

  return {
    id: value.id,
    title: value.title ?? null,
    status: value.status ?? "pending",
    priority: value.priority ?? "medium",
  };
}

function normalizeLessonOutputItem(
  value: Partial<LessonOutputItem> | undefined,
): LessonOutputItem {
  return {
    id: value?.id ?? "",
    lessonTaskId: value?.lessonTaskId ?? null,
    lessonName: value?.lessonName ?? "",
    originalTitle: value?.originalTitle ?? null,
    source: value?.source ?? null,
    originalLink: value?.originalLink ?? null,
    level: value?.level ?? null,
    difficultyBand: (() => {
      const band = value?.difficultyBand;
      return isLessonOutputDifficultyBand(band) ? band : null;
    })(),
    includesTest: value?.includesTest === true,
    includesSolution: value?.includesSolution === true,
    includesLectureVideo: value?.includesLectureVideo === true,
    tags: normalizeStringList(value?.tags),
    cost:
      typeof value?.cost === "number" && Number.isFinite(value.cost)
        ? value.cost
        : 0,
    date: value?.date ?? "",
    contestUploaded: value?.contestUploaded ?? null,
    link: value?.link ?? null,
    staffId: value?.staffId ?? null,
    staff: normalizeLessonStaffReference(value?.staff ?? undefined),
    status:
      value?.status === "completed" || value?.status === "cancelled"
        ? value.status
        : "pending",
    paymentStatus: value?.paymentStatus === "paid" ? "paid" : "pending",
    task: normalizeLessonOutputTaskSummary(value?.task ?? undefined),
    createdAt: value?.createdAt ?? "",
    updatedAt: value?.updatedAt ?? "",
  };
}

function normalizeLessonWorkOutputItem(
  value: Partial<LessonWorkOutputItem> | undefined,
): LessonWorkOutputItem | null {
  const baseOutput = normalizeLessonOutputListItem(value);
  if (!baseOutput) {
    return null;
  }

  return {
    ...baseOutput,
    updatedAt: value?.updatedAt ?? "",
    task: normalizeLessonOutputTaskSummary(value?.task ?? undefined),
    tags: normalizeStringList(value?.tags),
    level: value?.level ?? null,
    link: value?.link ?? null,
    originalLink: value?.originalLink ?? null,
    cost:
      typeof value?.cost === "number" && Number.isFinite(value.cost)
        ? value.cost
        : 0,
  };
}

export async function getLessonOverview(
  params: LessonOverviewQueryParams,
): Promise<LessonOverviewResponse> {
  const response = await api.get("/lesson-overview", {
    params: {
      resourcePage: params.resourcePage,
      resourceLimit: params.resourceLimit,
      taskPage: params.taskPage,
      taskLimit: params.taskLimit,
    },
  });
  const payload = response.data as Partial<LessonOverviewResponse> | undefined;

  return {
    summary: {
      resourceCount: payload?.summary?.resourceCount ?? 0,
      taskCount: payload?.summary?.taskCount ?? 0,
      openTaskCount: payload?.summary?.openTaskCount ?? 0,
      completedTaskCount: payload?.summary?.completedTaskCount ?? 0,
    },
    resources: Array.isArray(payload?.resources)
      ? payload.resources
          .map((resource) => normalizeLessonResourceItem(resource))
          .filter((resource): resource is LessonResourceItem => resource !== null)
      : [],
    resourcesMeta: {
      total: payload?.resourcesMeta?.total ?? 0,
      page: payload?.resourcesMeta?.page ?? params.resourcePage,
      limit: payload?.resourcesMeta?.limit ?? params.resourceLimit,
      totalPages: payload?.resourcesMeta?.totalPages ?? 1,
    },
    tasks: Array.isArray(payload?.tasks)
      ? payload.tasks.map((task) => normalizeLessonTask(task))
      : [],
    tasksMeta: {
      total: payload?.tasksMeta?.total ?? 0,
      page: payload?.tasksMeta?.page ?? params.taskPage,
      limit: payload?.tasksMeta?.limit ?? params.taskLimit,
      totalPages: payload?.tasksMeta?.totalPages ?? 1,
    },
  };
}

export async function getLessonWork(
  params: LessonWorkQueryParams,
): Promise<LessonWorkResponse> {
  const response = await api.get("/lesson-work", {
    params: {
      page: params.page,
      limit: params.limit,
      ...(typeof params.year === "number" && typeof params.month === "number"
        ? { year: params.year, month: params.month }
        : {}),
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
      ...(params.tag?.trim() ? { tag: params.tag.trim() } : {}),
      ...(params.staffId?.trim() ? { staffId: params.staffId.trim() } : {}),
      ...(params.outputStatus &&
      params.outputStatus !== "all" &&
      params.outputStatus.trim()
        ? { outputStatus: params.outputStatus.trim() }
        : {}),
      ...(params.dateFrom?.trim() ? { dateFrom: params.dateFrom.trim() } : {}),
      ...(params.dateTo?.trim() ? { dateTo: params.dateTo.trim() } : {}),
      ...(params.level && /^[0-5]$/.test(params.level.trim())
        ? { level: params.level.trim() }
        : {}),
    },
  });
  const payload = response.data as Partial<LessonWorkResponse> | undefined;

  return {
    summary: {
      taskCount: payload?.summary?.taskCount ?? 0,
      outputCount: payload?.summary?.outputCount ?? 0,
      pendingOutputCount: payload?.summary?.pendingOutputCount ?? 0,
      completedOutputCount: payload?.summary?.completedOutputCount ?? 0,
      cancelledOutputCount: payload?.summary?.cancelledOutputCount ?? 0,
    },
    outputs: Array.isArray(payload?.outputs)
      ? payload.outputs
          .map((output) => normalizeLessonWorkOutputItem(output))
          .filter((output): output is LessonWorkOutputItem => output !== null)
      : [],
    outputsMeta: {
      total: payload?.outputsMeta?.total ?? 0,
      page: payload?.outputsMeta?.page ?? params.page,
      limit: payload?.outputsMeta?.limit ?? params.limit,
      totalPages: payload?.outputsMeta?.totalPages ?? 1,
    },
  };
}

export async function getLessonOutputStatsByStaff(
  staffId: string,
  params?: {
    days?: number;
  },
): Promise<LessonOutputStaffStatsResponse> {
  const response = await api.get(
    `/lesson-output-stats/staff/${encodeURIComponent(staffId)}`,
    {
      params: {
        ...(typeof params?.days === "number" ? { days: params.days } : {}),
      },
    },
  );
  const payload = response.data as Partial<LessonOutputStaffStatsResponse> | undefined;
  const normalizedStaff = normalizeLessonStaffReference(
    payload?.summary?.staff ?? undefined,
  ) as LessonOutputStaff | null;

  return {
    summary: {
      days: payload?.summary?.days ?? (params?.days ?? 30),
      staff:
        normalizedStaff ??
        ({
          id: staffId,
          fullName: "—",
          roles: [],
          status: "active",
        } satisfies LessonOutputStaff),
      outputCount: payload?.summary?.outputCount ?? 0,
      pendingOutputCount: payload?.summary?.pendingOutputCount ?? 0,
      completedOutputCount: payload?.summary?.completedOutputCount ?? 0,
      cancelledOutputCount: payload?.summary?.cancelledOutputCount ?? 0,
      unpaidCostTotal: payload?.summary?.unpaidCostTotal ?? 0,
    },
    outputs: Array.isArray(payload?.outputs)
      ? payload.outputs
          .map((output) => normalizeLessonWorkOutputItem(output))
          .filter((output): output is LessonWorkOutputItem => output !== null)
      : [],
  };
}

export async function createLessonResource(
  data: CreateLessonResourcePayload,
): Promise<LessonResourceItem> {
  const response = await api.post("/lesson-resources", data);
  const resource = normalizeLessonResourceItem(
    response.data as Partial<LessonResourceItem>,
  );
  if (!resource) {
    throw new Error("Invalid lesson resource response.");
  }
  return resource;
}

export async function updateLessonResource(
  id: string,
  data: UpdateLessonResourcePayload,
): Promise<LessonResourceItem> {
  const response = await api.patch(
    `/lesson-resources/${encodeURIComponent(id)}`,
    data,
  );
  const resource = normalizeLessonResourceItem(
    response.data as Partial<LessonResourceItem>,
  );
  if (!resource) {
    throw new Error(`Invalid lesson resource response for ${id}.`);
  }
  return resource;
}

export async function getLessonResourceById(
  id: string,
): Promise<LessonResourceItem> {
  const response = await api.get(`/lesson-resources/${encodeURIComponent(id)}`);
  const resource = normalizeLessonResourceItem(
    response.data as Partial<LessonResourceItem>,
  );
  if (!resource) {
    throw new Error(`Invalid lesson resource response for ${id}.`);
  }
  return resource;
}

export async function deleteLessonResource(id: string) {
  const response = await api.delete(
    `/lesson-resources/${encodeURIComponent(id)}`,
  );
  return response.data;
}

export async function createLessonTask(
  data: CreateLessonTaskPayload,
): Promise<LessonTaskItem> {
  const response = await api.post("/lesson-tasks", data);
  return normalizeLessonTask(response.data as Partial<LessonTaskItem>);
}

export async function getLessonTaskById(id: string): Promise<LessonTaskDetail> {
  const response = await api.get(`/lesson-tasks/${encodeURIComponent(id)}`);
  return normalizeLessonTaskDetail(response.data as Partial<LessonTaskDetail>);
}

export async function updateLessonTask(
  id: string,
  data: UpdateLessonTaskPayload,
): Promise<LessonTaskItem> {
  const response = await api.patch(
    `/lesson-tasks/${encodeURIComponent(id)}`,
    data,
  );
  return normalizeLessonTask(response.data as Partial<LessonTaskItem>);
}

export async function deleteLessonTask(id: string) {
  const response = await api.delete(`/lesson-tasks/${encodeURIComponent(id)}`);
  return response.data;
}

export async function createLessonOutput(
  data: CreateLessonOutputPayload,
): Promise<LessonOutputItem> {
  const response = await api.post("/lesson-outputs", data);
  return normalizeLessonOutputItem(response.data as Partial<LessonOutputItem>);
}

export async function getLessonOutputById(id: string): Promise<LessonOutputItem> {
  const response = await api.get(`/lesson-outputs/${encodeURIComponent(id)}`);
  return normalizeLessonOutputItem(response.data as Partial<LessonOutputItem>);
}

export async function updateLessonOutput(
  id: string,
  data: UpdateLessonOutputPayload,
): Promise<LessonOutputItem> {
  const response = await api.patch(
    `/lesson-outputs/${encodeURIComponent(id)}`,
    data,
  );
  return normalizeLessonOutputItem(response.data as Partial<LessonOutputItem>);
}

export async function bulkUpdateLessonOutputPaymentStatus(
  data: BulkUpdateLessonOutputPaymentStatusPayload,
): Promise<BulkUpdateLessonOutputPaymentStatusResult> {
  const response = await api.patch("/lesson-outputs/payment-status/bulk", data);
  const payload =
    response.data as Partial<BulkUpdateLessonOutputPaymentStatusResult> | undefined;

  return {
    requestedCount: payload?.requestedCount ?? data.outputIds.length,
    updatedCount: payload?.updatedCount ?? 0,
  };
}

export async function deleteLessonOutput(id: string) {
  const response = await api.delete(
    `/lesson-outputs/${encodeURIComponent(id)}`,
  );
  return response.data;
}

export async function searchLessonTaskStaffOptions(params: {
  search?: string;
  limit?: number;
}): Promise<LessonTaskStaffOption[]> {
  const response = await api.get("/lesson-task-staff-options", {
    params: {
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
    },
  });

  return Array.isArray(response.data)
    ? response.data
        .map((item) =>
          normalizeLessonTaskStaffOption(
            item as Partial<LessonTaskStaffOption> | undefined,
          ),
        )
        .filter((item): item is LessonTaskStaffOption => item !== null)
    : [];
}

export async function searchLessonTaskOptions(params: {
  search?: string;
  limit?: number;
}): Promise<LessonTaskOption[]> {
  const response = await api.get("/lesson-task-options", {
    params: {
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
    },
  });

  return Array.isArray(response.data)
    ? response.data
        .map((item) =>
          normalizeLessonTaskOption(
            item as Partial<LessonTaskOption> | undefined,
          ),
        )
        .filter((item): item is LessonTaskOption => item !== null)
    : [];
}

export async function searchLessonResourceOptions(params: {
  search?: string;
  limit?: number;
  excludeTaskId?: string;
}): Promise<LessonResourceOption[]> {
  const response = await api.get("/lesson-resource-options", {
    params: {
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
      ...(params.excludeTaskId?.trim()
        ? { excludeTaskId: params.excludeTaskId.trim() }
        : {}),
    },
  });

  return Array.isArray(response.data)
    ? response.data
        .map((item) =>
          normalizeLessonResourceOption(
            item as Partial<LessonResourceOption> | undefined,
          ),
        )
        .filter((item): item is LessonResourceOption => item !== null)
    : [];
}

export async function searchLessonOutputStaffOptions(params: {
  search?: string;
  limit?: number;
}): Promise<LessonOutputStaffOption[]> {
  const response = await api.get("/lesson-output-staff-options", {
    params: {
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
      ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
    },
  });

  return Array.isArray(response.data)
    ? response.data
        .map((item) =>
          normalizeLessonOutputStaffOption(
            item as Partial<LessonOutputStaffOption> | undefined,
          ),
        )
        .filter((item): item is LessonOutputStaffOption => item !== null)
    : [];
}
