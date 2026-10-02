"use client";

import {
  ClipboardDocumentIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import * as surveysApi from "@/lib/apis/surveys.api";
import { DateInput } from "@/components/ui/DateInput";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  buildSurveyZaloMessage,
  copyTextToClipboard,
} from "@/lib/survey-notification";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { courseKeys } from "@/lib/query-keys";
import type {
  CreateSurveyPayload,
  SurveyRecord,
  SurveyReportedClass,
  UpdateSurveyPayload,
} from "@/dtos/survey.dto";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const SURVEYS_QUERY_KEY = ["surveys", "list"] as const;

function getErrorMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getTodayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

async function copySurveyNotification(survey: {
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  notificationContent: string | null;
  notificationInstructions: string | null;
  notificationNotes: string | null;
  notificationTeacherNote: string | null;
}) {
  const message = buildSurveyZaloMessage({
    title: survey.name,
    startDate: survey.startDate,
    endDate: survey.endDate,
    content: survey.notificationContent,
    instructions: survey.notificationInstructions,
    notes: survey.notificationNotes,
    teacherNote: survey.notificationTeacherNote,
  });
  if (!message.trim()) {
    toast.error("Chưa có nội dung thông báo để sao chép.");
    return;
  }
  try {
    await copyTextToClipboard(message);
    toast.success("Đã sao chép nội dung thông báo. Dán vào Zalo để gửi.");
  } catch {
    toast.error("Không thể sao chép. Vui lòng thử lại.");
  }
}

/**
 * Quản lý "Bài khảo sát": CRUD, loại trừ lớp, soạn thông báo có cấu trúc
 * (Title/Thời gian/Nội dung/Hướng dẫn/Lưu ý/Gia sư) và sao chép để dán vào Zalo.
 * Dùng chung cho `/admin/surveys` (admin) và `/staff/surveys` (đội giáo án).
 */
export default function SurveysManager() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<SurveyRecord | null>(null);
  const [deletingSurvey, setDeletingSurvey] = useState<SurveyRecord | null>(null);
  const [viewingClasses, setViewingClasses] = useState<{
    survey: SurveyRecord;
    tab: "reported" | "missing";
  } | null>(null);

  const listQuery = useQuery({
    queryKey: [...SURVEYS_QUERY_KEY, page, PAGE_SIZE],
    queryFn: () => surveysApi.getSurveys({ page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: SURVEYS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (payload: CreateSurveyPayload) => surveysApi.createSurvey(payload),
    onSuccess: async () => {
      toast.success("Đã tạo bài khảo sát.");
      setFormOpen(false);
      await invalidateList();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Không thể tạo bài khảo sát."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; payload: UpdateSurveyPayload }) =>
      surveysApi.updateSurvey(params.id, params.payload),
    onSuccess: async () => {
      toast.success("Đã cập nhật bài khảo sát.");
      setEditingSurvey(null);
      await invalidateList();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Không thể cập nhật bài khảo sát."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => surveysApi.deleteSurvey(id),
    onSuccess: async () => {
      toast.success("Đã xóa bài khảo sát.");
      setDeletingSurvey(null);
      await invalidateList();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Không thể xóa bài khảo sát."));
    },
  });

  const list = listQuery.data?.data ?? [];
  const total = listQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-6 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Khảo sát
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Bài khảo sát
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Tạo bài khảo sát có thời gian bắt đầu/kết thúc, loại trừ lớp không
              cần báo cáo, soạn thông báo kèm theo và sao chép để dán vào Zalo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition hover:opacity-90"
          >
            <PlusIcon className="size-4" aria-hidden />
            Tạo bài khảo sát
          </button>
        </header>

        <section className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
          {listQuery.isError ? (
            <div className="px-4 py-8 text-sm text-error">
              {getErrorMessage(listQuery.error, "Không thể tải danh sách bài khảo sát.")}
            </div>
          ) : (
            <>
              <div className="grid gap-3 p-3 md:hidden">
                {listQuery.isLoading
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-32 animate-pulse rounded-lg border border-border-default bg-bg-secondary"
                      />
                    ))
                  : list.map((survey) => (
                      <SurveyCard
                        key={survey.id}
                        survey={survey}
                        onEdit={() => setEditingSurvey(survey)}
                        onDelete={() => setDeletingSurvey(survey)}
                        onCopy={() => copySurveyNotification(survey)}
                        onOpenClasses={(tab) => setViewingClasses({ survey, tab })}
                      />
                    ))}
                {!listQuery.isLoading && list.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border-default px-4 py-10 text-center text-sm text-text-muted">
                    Chưa có bài khảo sát nào.
                  </div>
                ) : null}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-border-default text-sm">
                  <thead className="bg-bg-secondary/70 text-left text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                    <tr>
                      <th className="px-4 py-3">Bài khảo sát</th>
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3">Lớp chạy</th>
                      <th className="px-4 py-3">Đã báo cáo</th>
                      <th className="px-4 py-3">Chưa báo cáo</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {listQuery.isLoading
                      ? Array.from({ length: 5 }).map((_, index) => (
                          <tr key={index} className="animate-pulse">
                            <td className="px-4 py-4" colSpan={6}>
                              <div className="h-4 rounded bg-bg-secondary" />
                            </td>
                          </tr>
                        ))
                      : list.map((survey) => (
                          <tr key={survey.id} className="align-top hover:bg-bg-secondary/50">
                            <td className="px-4 py-4">
                              <p className="font-semibold text-text-primary">
                                {survey.name}
                              </p>
                              {survey.excludedClassIds.length > 0 ? (
                                <p className="mt-1 text-xs text-text-muted">
                                  Loại trừ {survey.excludedClassIds.length} lớp
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 text-text-secondary">
                              {formatDate(survey.startDate)} → {formatDate(survey.endDate)}
                            </td>
                            <td className="px-4 py-4 text-text-secondary">
                              {survey.totalRunningClasses}
                            </td>
                            <td className="px-4 py-4">
                              <button
                                type="button"
                                onClick={() => setViewingClasses({ survey, tab: "reported" })}
                                className="group inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-success transition hover:bg-success/10 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-success"
                                title="Bấm để xem danh sách lớp đã báo cáo"
                              >
                                <span>{survey.reportedCount}</span>
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <button
                                type="button"
                                onClick={() => setViewingClasses({ survey, tab: "missing" })}
                                className="group inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-warning transition hover:bg-warning/10 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
                                title="Bấm để xem danh sách lớp chưa báo cáo"
                              >
                                <span>{survey.missingCount}</span>
                              </button>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => copySurveyNotification(survey)}
                                  title="Sao chép thông báo (Zalo)"
                                  aria-label="Sao chép thông báo bài khảo sát"
                                  className="flex size-9 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-secondary hover:text-text-primary"
                                >
                                  <ClipboardDocumentIcon className="size-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSurvey(survey)}
                                  title="Sửa"
                                  aria-label="Sửa bài khảo sát"
                                  className="flex size-9 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-secondary hover:text-text-primary"
                                >
                                  <PencilSquareIcon className="size-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingSurvey(survey)}
                                  title="Xóa"
                                  aria-label="Xóa bài khảo sát"
                                  className="flex size-9 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-secondary hover:text-error"
                                >
                                  <TrashIcon className="size-4" aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    {!listQuery.isLoading && list.length === 0 ? (
                      <tr>
                        <td className="px-4 py-10 text-center text-sm text-text-muted" colSpan={6}>
                          Chưa có bài khảo sát nào.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 border-t border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted">Tổng {total} bài khảo sát</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        </section>
      </div>

      <SurveyFormDialog
        key={formOpen ? "create-open" : "create-closed"}
        mode="create"
        open={formOpen}
        saving={createMutation.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={(payload) => createMutation.mutateAsync(payload)}
      />

      <SurveyFormDialog
        key={editingSurvey?.id ?? "edit-closed"}
        mode="edit"
        open={Boolean(editingSurvey)}
        survey={editingSurvey}
        saving={updateMutation.isPending}
        onClose={() => setEditingSurvey(null)}
        onSubmit={(payload) =>
          editingSurvey
            ? updateMutation.mutateAsync({ id: editingSurvey.id, payload })
            : Promise.resolve()
        }
      />

      <DeleteSurveyDialog
        survey={deletingSurvey}
        deleting={deleteMutation.isPending}
        onClose={() => setDeletingSurvey(null)}
        onConfirm={() => deletingSurvey ? deleteMutation.mutateAsync(deletingSurvey.id) : Promise.resolve()}
      />

      <SurveyClassesDialog
        key={`${viewingClasses?.survey.id ?? "none"}-${viewingClasses?.tab ?? "none"}`}
        survey={viewingClasses?.survey ?? null}
        initialTab={viewingClasses?.tab}
        onClose={() => setViewingClasses(null)}
      />
    </div>
  );
}

function SurveyCard({
  survey,
  onEdit,
  onDelete,
  onCopy,
  onOpenClasses,
}: {
  survey: SurveyRecord;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onOpenClasses: (tab: "reported" | "missing") => void;
}) {
  return (
    <article className="rounded-lg border border-border-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{survey.name}</p>
          <p className="mt-1 text-xs text-text-muted">
            {formatDate(survey.startDate)} → {formatDate(survey.endDate)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onCopy}
            aria-label="Sao chép thông báo bài khảo sát"
            className="flex size-9 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-tertiary hover:text-text-primary"
          >
            <ClipboardDocumentIcon className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Sửa bài khảo sát"
            className="flex size-9 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-tertiary hover:text-text-primary"
          >
            <PencilSquareIcon className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Xóa bài khảo sát"
            className="flex size-9 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-tertiary hover:text-error"
          >
            <TrashIcon className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-3 text-xs text-text-secondary">
        <div>
          <dt className="text-text-muted">Lớp chạy</dt>
          <dd className="mt-0.5 font-semibold text-text-primary">{survey.totalRunningClasses}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Đã báo cáo</dt>
          <dd className="mt-0.5">
            <button
              type="button"
              onClick={() => onOpenClasses("reported")}
              className="font-semibold text-success hover:underline hover:opacity-80 transition rounded px-1 py-0.5 hover:bg-success/10"
              title="Xem danh sách lớp đã báo cáo"
            >
              {survey.reportedCount}
            </button>
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Chưa báo cáo</dt>
          <dd className="mt-0.5">
            <button
              type="button"
              onClick={() => onOpenClasses("missing")}
              className="font-semibold text-warning hover:underline hover:opacity-80 transition rounded px-1 py-0.5 hover:bg-warning/10"
              title="Xem danh sách lớp chưa báo cáo"
            >
              {survey.missingCount}
            </button>
          </dd>
        </div>
      </dl>
    </article>
  );
}

const CLASS_PICKER_PAGE_SIZE = 20;
const CLASS_PICKER_FULL_FETCH_LIMIT = 100;

async function fetchAllMatchingClasses(params: {
  search?: string;
  courseId?: string;
  total: number;
}): Promise<{ id: string; name: string }[]> {
  const pageCount = Math.max(
    1,
    Math.ceil(params.total / CLASS_PICKER_FULL_FETCH_LIMIT),
  );
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) =>
      classApi.getClasses({
        page: index + 1,
        limit: CLASS_PICKER_FULL_FETCH_LIMIT,
        search: params.search,
        courseId: params.courseId || undefined,
      }),
    ),
  );
  return pages.flatMap((page) =>
    page.data.map((item) => ({ id: item.id, name: item.name })),
  );
}

function ClassExclusionDialog({
  open,
  selectedIds,
  onToggle,
  onSelectAll,
  onClose,
  onNamesLoaded,
}: {
  open: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[], select: boolean) => void;
  onClose: () => void;
  onNamesLoaded: (entries: { id: string; name: string }[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const { data: courses = [] } = useQuery({
    queryKey: courseKeys.list(),
    queryFn: () => classApi.getCourses(),
  });
  const classTypeFilterOptions = useMemo(
    () => [
      { value: "", label: "Tất cả loại lớp" },
      ...courses.map((course) => ({
        value: course.id,
        label: course.name,
      })),
    ],
    [courses],
  );
  const [selectingAll, setSelectingAll] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setTypeFilter("");
    }
  }, [open]);

  const classesQuery = useInfiniteQuery({
    queryKey: ["classes", "picker", "survey-exclusion", debouncedSearch, typeFilter],
    queryFn: ({ pageParam }) =>
      classApi.getClasses({
        page: pageParam,
        limit: CLASS_PICKER_PAGE_SIZE,
        search: debouncedSearch || undefined,
        courseId: typeFilter || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.meta.page * lastPage.meta.limit;
      return loaded < lastPage.meta.total ? lastPage.meta.page + 1 : undefined;
    },
    enabled: open,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => (classesQuery.data?.pages ?? []).flatMap((page) => page.data),
    [classesQuery.data],
  );
  const totalCount = classesQuery.data?.pages[0]?.meta.total ?? 0;
  const isLoading = classesQuery.isLoading;
  const isFetchingNextPage = classesQuery.isFetchingNextPage;
  const hasNextPage = classesQuery.hasNextPage;

  useEffect(() => {
    if (items.length === 0) return;
    onNamesLoaded(items.map((item) => ({ id: item.id, name: item.name })));
  }, [items, onNamesLoaded]);

  useEffect(() => {
    if (!open || !hasNextPage || isLoading || isFetchingNextPage) {
      return;
    }
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void classesQuery.fetchNextPage();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [open, hasNextPage, isLoading, isFetchingNextPage, classesQuery]);

  if (!open) return null;

  // Set: danh sách lớp có thể tới hàng nghìn, tra cứu O(1) thay vì quét mảng.
  const selectedIdSet = new Set(selectedIds);
  const allLoadedSelected =
    items.length > 0 && items.every((item) => selectedIdSet.has(item.id));
  const someLoadedSelected = items.some((item) => selectedIdSet.has(item.id));

  const handleSelectAll = async () => {
    if (totalCount === 0 || selectingAll) return;
    setSelectingAll(true);
    try {
      const matching = await fetchAllMatchingClasses({
        search: debouncedSearch || undefined,
        courseId: typeFilter,
        total: totalCount,
      });
      onNamesLoaded(matching);
      onSelectAll(matching.map((item) => item.id), !allLoadedSelected);
    } catch {
      toast.error("Không thể tải toàn bộ danh sách lớp. Vui lòng thử lại.");
    } finally {
      setSelectingAll(false);
    }
  };

  return (
    <ResponsiveDialog
      labelledBy="class-exclusion-dialog-title"
      onBackdropClick={onClose}
      contentClassName="sm:max-w-lg"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border-default px-4 py-4">
        <div className="min-w-0">
          <h3
            id="class-exclusion-dialog-title"
            className="text-base font-semibold text-text-primary"
          >
            Chọn lớp cần loại trừ
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {isLoading
              ? "Đang tải…"
              : `${totalCount} lớp • đã chọn ${selectedIds.length}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary hover:text-text-primary"
        >
          <XMarkIcon className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-b border-border-default px-4 py-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Tìm lớp cần loại trừ"
          placeholder="Tìm lớp cần loại trừ…"
          autoFocus
          className="w-full flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
        />
        <UpgradedSelect
          name="class-exclusion-type-filter"
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value)}
          options={classTypeFilterOptions}
          ariaLabel="Lọc theo loại lớp"
          buttonClassName="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none sm:w-40"
        />
      </div>

      <ResponsiveDialogBody className="space-y-1">
        {isLoading ? (
          <p className="px-2 py-6 text-center text-sm text-text-muted">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-text-muted">
            Không có lớp phù hợp.
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-md border-b border-border-subtle px-2 py-2 text-sm font-medium text-text-primary hover:bg-bg-secondary">
              <SelectionCheckbox
                checked={allLoadedSelected}
                indeterminate={!allLoadedSelected && someLoadedSelected}
                onChange={() => void handleSelectAll()}
                disabled={selectingAll}
                ariaLabel="Chọn tất cả lớp phù hợp"
              />
              <span>
                {selectingAll
                  ? "Đang chọn tất cả…"
                  : `Chọn tất cả (${totalCount})`}
              </span>
            </label>
            {items.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-bg-secondary"
              >
                <SelectionCheckbox
                  checked={selectedIdSet.has(item.id)}
                  onChange={() => onToggle(item.id)}
                  ariaLabel={`Chọn ${item.name}`}
                />
                <span className="text-text-primary">{item.name}</span>
              </label>
            ))}
            <div ref={loadMoreRef} className="h-1" aria-hidden />
            {isFetchingNextPage ? (
              <p className="py-2 text-center text-xs text-text-muted">Đang tải thêm…</p>
            ) : null}
          </>
        )}
      </ResponsiveDialogBody>

      <div className="flex justify-end gap-2 border-t border-border-default px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition hover:opacity-90"
        >
          Xong
        </button>
      </div>
    </ResponsiveDialog>
  );
}

function NotificationFormFields({
  title,
  notificationContent,
  setNotificationContent,
  notificationInstructions,
  setNotificationInstructions,
  notificationNotes,
  setNotificationNotes,
  notificationTeacherNote,
  setNotificationTeacherNote,
  startDate,
  endDate,
}: {
  title: string;
  notificationContent: string;
  setNotificationContent: (value: string) => void;
  notificationInstructions: string;
  setNotificationInstructions: (value: string) => void;
  notificationNotes: string;
  setNotificationNotes: (value: string) => void;
  notificationTeacherNote: string;
  setNotificationTeacherNote: (value: string) => void;
  startDate: string;
  endDate: string;
}) {
  const previewMessage = buildSurveyZaloMessage({
    title,
    startDate,
    endDate,
    content: notificationContent,
    instructions: notificationInstructions,
    notes: notificationNotes,
    teacherNote: notificationTeacherNote,
  });

  const textareaClass =
    "min-h-[72px] rounded-md border border-border-default bg-bg-secondary/30 px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-text-secondary">
        Thông báo khảo sát (tùy chọn)
      </p>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        <span>Nội dung</span>
        <textarea
          value={notificationContent}
          onChange={(event) => setNotificationContent(event.target.value)}
          placeholder={
            "Có nhiều contest, gia sư sẽ hướng dẫn chọn contest phù hợp với lớp.\nMỗi học sinh bắt buộc làm tối thiểu 01 contest."
          }
          className={textareaClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        <span>Hướng dẫn</span>
        <textarea
          value={notificationInstructions}
          onChange={(event) => setNotificationInstructions(event.target.value)}
          placeholder={"Contest mở trong 1 tuần.\nTrước khi làm: bấm Register."}
          className={textareaClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        <span>Lưu ý</span>
        <textarea
          value={notificationNotes}
          onChange={(event) => setNotificationNotes(event.target.value)}
          placeholder={"KHÔNG dùng AI.\nKHÔNG chép bài."}
          className={textareaClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        <span>Gia sư</span>
        <textarea
          value={notificationTeacherNote}
          onChange={(event) => setNotificationTeacherNote(event.target.value)}
          placeholder={
            "Đưa thông tin về lớp và hướng dẫn học sinh tham gia kì thi.\nThả rct nếu đã thực hiện xong."
          }
          className={textareaClass}
        />
      </label>

      {previewMessage.trim() ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-muted">Xem trước</span>
          <pre className="whitespace-pre-wrap rounded-md border border-dashed border-border-default bg-bg-surface p-3 text-xs text-text-secondary">
            {previewMessage}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function SurveyFormDialog({
  mode,
  open,
  survey,
  saving,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  open: boolean;
  survey?: SurveyRecord | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateSurveyPayload) => Promise<unknown>;
}) {
  const [name, setName] = useState(survey?.name ?? "");
  const [startDate, setStartDate] = useState(
    () => survey?.startDate?.slice(0, 10) ?? getTodayInputValue(),
  );
  const [endDate, setEndDate] = useState(
    () => survey?.endDate?.slice(0, 10) ?? getTodayInputValue(),
  );
  const [notificationContent, setNotificationContent] = useState(
    survey?.notificationContent ?? "",
  );
  const [notificationInstructions, setNotificationInstructions] = useState(
    survey?.notificationInstructions ?? "",
  );
  const [notificationNotes, setNotificationNotes] = useState(
    survey?.notificationNotes ?? "",
  );
  const [notificationTeacherNote, setNotificationTeacherNote] = useState(
    survey?.notificationTeacherNote ?? "",
  );
  const [excludedClassIds, setExcludedClassIds] = useState<string[]>(
    survey?.excludedClassIds ?? [],
  );
  const [excludedClassNames, setExcludedClassNames] = useState<
    Record<string, string>
  >({});
  const [classExclusionOpen, setClassExclusionOpen] = useState(false);

  const handleNamesLoaded = useCallback(
    (entries: { id: string; name: string }[]) => {
      setExcludedClassNames((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const entry of entries) {
          if (next[entry.id] !== entry.name) {
            next[entry.id] = entry.name;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [],
  );

  const toggleExcludedClass = useCallback((id: string) => {
    setExcludedClassIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAllExcluded = useCallback(
    (ids: string[], select: boolean) => {
      setExcludedClassIds((prev) => {
        if (select) {
          const merged = new Set(prev);
          ids.forEach((id) => merged.add(id));
          return Array.from(merged);
        }
        const toRemove = new Set(ids);
        return prev.filter((id) => !toRemove.has(id));
      });
    },
    [],
  );

  const missingExcludedClassNameIds = useMemo(
    () => excludedClassIds.filter((id) => !excludedClassNames[id]),
    [excludedClassIds, excludedClassNames],
  );

  const resolveExcludedClassNamesQuery = useQuery({
    queryKey: ["classes", "resolve-names", missingExcludedClassNameIds],
    queryFn: () =>
      Promise.all(
        missingExcludedClassNameIds.map((id) =>
          classApi.getClassById(id).catch(() => null),
        ),
      ),
    enabled: missingExcludedClassNameIds.length > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    const results = resolveExcludedClassNamesQuery.data;
    if (!results) return;
    const entries = results
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({ id: item.id, name: item.name }));
    if (entries.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleNamesLoaded(entries);
    }
  }, [resolveExcludedClassNamesQuery.data, handleNamesLoaded]);

  if (!open) return null;

  const title = mode === "create" ? "Tạo bài khảo sát" : "Sửa bài khảo sát";
  const formId = mode === "create" ? "survey-create-form" : "survey-edit-form";

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Tên bài khảo sát là bắt buộc.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Chọn ngày bắt đầu và kết thúc.");
      return;
    }
    if (endDate < startDate) {
      toast.error("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
      return;
    }

    await onSubmit({
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      notification_title: name.trim() || undefined,
      notification_content: notificationContent.trim() || undefined,
      notification_instructions: notificationInstructions.trim() || undefined,
      notification_notes: notificationNotes.trim() || undefined,
      notification_teacher_note: notificationTeacherNote.trim() || undefined,
      excluded_class_ids: excludedClassIds,
    });
  };

  const handleCopy = async () => {
    const message = buildSurveyZaloMessage({
      title: name,
      startDate,
      endDate,
      content: notificationContent,
      instructions: notificationInstructions,
      notes: notificationNotes,
      teacherNote: notificationTeacherNote,
    });
    if (!message.trim()) {
      toast.error("Điền thông báo khảo sát để sao chép.");
      return;
    }
    try {
      await copyTextToClipboard(message);
      toast.success("Đã sao chép nội dung thông báo. Dán vào Zalo để gửi.");
    } catch {
      toast.error("Không thể sao chép. Vui lòng thử lại.");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-xl sm:w-full"
      >
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h2 id={`${formId}-title`} className="text-base font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary hover:text-text-primary"
          >
            <XMarkIcon className="size-5" aria-hidden />
          </button>
        </div>

        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            <span>Tên bài khảo sát</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Kiểm tra định kì lần 7"
              className="rounded-md border border-border-default bg-bg-secondary/30 px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Thời gian bắt đầu</span>
              <DateInput
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded-md border border-border-default bg-bg-secondary/30 px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Thời gian kết thúc</span>
              <DateInput
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="rounded-md border border-border-default bg-bg-secondary/30 px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none"
                required
              />
            </label>
          </div>

          <NotificationFormFields
            title={name}
            notificationContent={notificationContent}
            setNotificationContent={setNotificationContent}
            notificationInstructions={notificationInstructions}
            setNotificationInstructions={setNotificationInstructions}
            notificationNotes={notificationNotes}
            setNotificationNotes={setNotificationNotes}
            notificationTeacherNote={notificationTeacherNote}
            setNotificationTeacherNote={setNotificationTeacherNote}
            startDate={startDate}
            endDate={endDate}
          />

          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <span>Loại trừ lớp khỏi yêu cầu báo cáo (tùy chọn)</span>
            <button
              type="button"
              onClick={() => setClassExclusionOpen(true)}
              className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-bg-secondary/30 px-3 py-2 text-sm text-text-primary transition hover:bg-bg-secondary"
            >
              <span>Chọn lớp cần loại trừ</span>
              <span className="text-xs font-semibold text-text-muted">
                {excludedClassIds.length > 0
                  ? `${excludedClassIds.length} lớp`
                  : "Chưa chọn"}
              </span>
            </button>
            {excludedClassIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {excludedClassIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary"
                  >
                    {excludedClassNames[id] ?? "Lớp đã chọn"}
                    <button
                      type="button"
                      onClick={() => toggleExcludedClass(id)}
                      aria-label={`Bỏ loại trừ ${excludedClassNames[id] ?? "lớp"}`}
                      className="text-text-muted hover:text-text-primary"
                    >
                      <XMarkIcon className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </form>

        <div className="flex items-center justify-between gap-2 border-t border-border-default px-4 py-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
          >
            <ClipboardDocumentIcon className="size-3.5" aria-hidden />
            Sao chép để dán Zalo
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-secondary"
            >
              Hủy
            </button>
            <button
              type="submit"
              form={formId}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu bài khảo sát"}
            </button>
          </div>
        </div>
      </div>

      <ClassExclusionDialog
        open={classExclusionOpen}
        selectedIds={excludedClassIds}
        onToggle={toggleExcludedClass}
        onSelectAll={handleSelectAllExcluded}
        onClose={() => setClassExclusionOpen(false)}
        onNamesLoaded={handleNamesLoaded}
      />
    </>
  );
}

function DeleteSurveyDialog({
  survey,
  deleting,
  onClose,
  onConfirm,
}: {
  survey: SurveyRecord | null;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  if (!survey) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-survey-title"
        className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-xl sm:w-full sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="delete-survey-title" className="text-base font-semibold text-text-primary">
            Xóa bài khảo sát
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary hover:text-text-primary"
          >
            <XMarkIcon className="size-5" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-text-secondary">
          Xóa bài khảo sát &quot;{survey.name}&quot;? Các báo cáo lớp đã nộp cho
          bài này sẽ bị xóa theo. Hành động này không thể hoàn tác.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className={cn(
              "rounded-md bg-error px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:opacity-90 disabled:opacity-60",
            )}
          >
            {deleting ? "Đang xóa…" : "Xóa"}
          </button>
        </div>
      </div>
    </>
  );
}

function SurveyClassesDialog({
  survey,
  initialTab = "reported",
  onClose,
}: {
  survey: SurveyRecord | null;
  initialTab?: "reported" | "missing";
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"reported" | "missing">(initialTab);
  const [search, setSearch] = useState("");
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);

  const reportedQuery = useQuery({
    queryKey: ["surveys", survey?.id, "reported-classes"],
    queryFn: () =>
      survey?.id
        ? surveysApi.getSurveyReportedClasses(survey.id, { page: 1, limit: 100 })
        : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 100 } }),
    enabled: Boolean(survey?.id) && tab === "reported",
  });

  const missingQuery = useQuery({
    queryKey: ["surveys", survey?.id, "missing-classes"],
    queryFn: () =>
      survey?.id
        ? surveysApi.getSurveyMissingClasses(survey.id, { page: 1, limit: 100 })
        : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 100 } }),
    enabled: Boolean(survey?.id) && tab === "missing",
  });

  if (!survey) return null;

  const currentQuery = tab === "reported" ? reportedQuery : missingQuery;
  const rawItems = currentQuery.data?.data ?? [];

  const filteredItems = rawItems.filter((item) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const matchName = item.name.toLowerCase().includes(q);
    const matchTeacher = item.teachers.some((t) => t.toLowerCase().includes(q));
    return matchName || matchTeacher;
  });

  return (
    <ResponsiveDialog
      labelledBy="survey-classes-dialog-title"
      onBackdropClick={onClose}
      contentClassName="sm:max-w-2xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-default px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="survey-classes-dialog-title" className="text-lg font-semibold text-text-primary">
            {survey.name}
          </h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Thời gian: {formatDate(survey.startDate)} → {formatDate(survey.endDate)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary hover:text-text-primary"
        >
          <XMarkIcon className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-b border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTab("reported");
              setSearch("");
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              tab === "reported"
                ? "bg-success text-text-inverse"
                : "border border-border-default bg-bg-surface text-text-secondary hover:bg-bg-secondary",
            )}
          >
            Đã báo cáo ({survey.reportedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("missing");
              setSearch("");
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              tab === "missing"
                ? "bg-warning text-text-inverse"
                : "border border-border-default bg-bg-surface text-text-secondary hover:bg-bg-secondary",
            )}
          >
            Chưa báo cáo ({survey.missingCount})
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm lớp, gia sư"
            placeholder="Tìm lớp, gia sư…"
            className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs text-text-primary focus:border-border-focus focus:outline-none sm:w-48"
          />
        </div>
      </div>

      <ResponsiveDialogBody className="space-y-2">
        {currentQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-lg border border-border-default bg-bg-secondary/40"
              />
            ))}
          </div>
        ) : currentQuery.isError ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-xs text-error">
            {getErrorMessage(currentQuery.error, "Không thể tải danh sách lớp.")}
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="divide-y divide-border-subtle rounded-lg border border-border-default bg-bg-surface">
            {filteredItems.map((item) => {
              const reportedItem = tab === "reported" ? (item as SurveyReportedClass) : null;
              return (
                <article key={item.classId} className="p-3.5 transition-colors hover:bg-bg-secondary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={buildAdminLikePath(routeBase, `classes/${item.classId}`)}
                        className="font-medium text-sm text-text-primary hover:text-primary hover:underline transition-colors"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-1 text-xs text-text-secondary">
                        <span className="text-text-muted">Gia sư: </span>
                        {item.teachers.length > 0 ? item.teachers.join(", ") : "Chưa phân công"}
                      </p>
                      {reportedItem?.knowledgeAssessment ? (
                        <p className="mt-1.5 line-clamp-2 rounded bg-bg-secondary/60 px-2 py-1 text-xs text-text-secondary">
                          <span className="font-semibold text-text-primary">Đánh giá: </span>
                          {reportedItem.knowledgeAssessment}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {tab === "reported" ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                            Đã báo cáo
                          </span>
                          {reportedItem?.reportDate ? (
                            <span className="text-[11px] text-text-muted">
                              Ngày: {formatDate(reportedItem.reportDate)}
                            </span>
                          ) : null}
                          {reportedItem?.reportedByTeacherName ? (
                            <span className="text-[11px] text-text-muted">
                              Bởi: {reportedItem.reportedByTeacherName}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                          Chưa báo cáo
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border-default px-4 py-8 text-center text-sm text-text-muted">
            {search.trim()
              ? "Không tìm thấy lớp phù hợp với từ khóa."
              : tab === "reported"
                ? "Chưa có lớp nào nộp báo cáo cho bài khảo sát này."
                : "Tất cả các lớp đã hoàn thành báo cáo khảo sát!"}
          </div>
        )}
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
