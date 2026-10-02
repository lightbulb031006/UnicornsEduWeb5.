"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import type { Course, ClassListItem, ClassStatus } from "@/dtos/class.dto";
import type { StudentDetail } from "@/dtos/student.dto";
import * as classApi from "@/lib/apis/class.api";
import * as studentApi from "@/lib/apis/student.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  student: StudentDetail;
  onSuccess?: () => void | Promise<void>;
};

type SelectedClassItem = {
  id: string;
  name: string;
  status?: ClassStatus;
  course?: Course;
};

const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  running: "Đang chạy",
  ended: "Đã kết thúc",
};

const EMPTY_CLASS_OPTIONS: ClassListItem[] = [];
const SEARCH_RESULT_LIMIT = 3;

function normalizeStudentClasses(student: StudentDetail): SelectedClassItem[] {
  const classes = new Map<string, SelectedClassItem>();

  for (const item of student.studentClasses ?? []) {
    const classId = item.class?.id;
    const className = item.class?.name?.trim();
    if (!classId || !className || classes.has(classId)) continue;
    classes.set(classId, {
      id: classId,
      name: className,
    });
  }

  return Array.from(classes.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function classStatusBadgeClass(status?: ClassStatus): string {
  if (status === "running") return "bg-primary/10 text-primary ring-primary/20";
  if (status === "ended") return "bg-text-muted/10 text-text-secondary ring-border-default";
  return "bg-bg-tertiary text-text-secondary ring-border-default";
}

function CountCard({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: number;
  toneClass: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-text-muted sm:text-[11px] sm:tracking-[0.18em]">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold leading-none sm:mt-2 sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function EditStudentClassesPopup({
  open,
  onClose,
  student,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const currentClasses = useMemo(() => normalizeStudentClasses(student), [student]);

  const [selectedClasses, setSelectedClasses] = useState<SelectedClassItem[]>(currentClasses);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebounce(searchInput.trim(), 250);

  const { data: classResponse, isLoading: isClassSearchLoading } = useQuery({
    queryKey: ["class", "picker", { page: 1, limit: 12, search: debouncedSearch }],
    queryFn: () =>
      classApi.getClasses({
        page: 1,
        limit: 12,
        search: debouncedSearch || undefined,
      }),
    enabled: open,
  });

  const classOptions = useMemo(
    () => classResponse?.data ?? EMPTY_CLASS_OPTIONS,
    [classResponse?.data],
  );
  const classOptionMetaById = useMemo(
    () => new Map(classOptions.map((item) => [item.id, item])),
    [classOptions],
  );

  const selectedClassIds = useMemo(
    () => new Set(selectedClasses.map((item) => item.id)),
    [selectedClasses],
  );
  const currentClassIds = useMemo(
    () => new Set(currentClasses.map((item) => item.id)),
    [currentClasses],
  );

  const searchableClasses = useMemo(
    () =>
      classOptions
        .filter((item) => !selectedClassIds.has(item.id))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [classOptions, selectedClassIds],
  );
  const visibleSearchableClasses = useMemo(
    () => searchableClasses.slice(0, SEARCH_RESULT_LIMIT),
    [searchableClasses],
  );

  const classesToAdd = useMemo(
    () => selectedClasses.filter((item) => !currentClassIds.has(item.id)),
    [selectedClasses, currentClassIds],
  );

  const classesToRemove = useMemo(
    () => currentClasses.filter((item) => !selectedClassIds.has(item.id)),
    [currentClasses, selectedClassIds],
  );

  const hasChanges = classesToAdd.length > 0 || classesToRemove.length > 0;

  const selectedClassesWithMeta = useMemo(
    () =>
      selectedClasses.map((item) => {
        const matched = classOptionMetaById.get(item.id);
        return {
          ...item,
          status: matched?.status ?? item.status,
          course: matched?.course ?? item.course,
        };
      }),
    [selectedClasses, classOptionMetaById],
  );

  const classesToAddWithMeta = useMemo(
    () =>
      classesToAdd.map((item) => {
        const matched = classOptionMetaById.get(item.id);
        return {
          ...item,
          status: matched?.status ?? item.status,
          course: matched?.course ?? item.course,
        };
      }),
    [classesToAdd, classOptionMetaById],
  );

  const handleAddClass = (classItem: ClassListItem) => {
    setSelectedClasses((prev) => {
      if (prev.some((item) => item.id === classItem.id)) return prev;
      return [...prev, classItem].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    });
    setSearchInput("");
  };

  const handleRemoveClass = (classId: string) => {
    setSelectedClasses((prev) => prev.filter((item) => item.id !== classId));
  };

  const handleSubmit = () => {
    if (!hasChanges) {
      onClose();
      return;
    }
    const nextClassIds = selectedClasses.map((item) => item.id);
    const nextClassIdSet = new Set(nextClassIds);
    const changedClassIds = Array.from(
      new Set([...currentClassIds, ...nextClassIds]),
    ).filter((classId) => currentClassIds.has(classId) !== nextClassIdSet.has(classId));

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang đồng bộ danh sách lớp...",
      successMessage: "Đã cập nhật phân bổ lớp học cho học sinh.",
      errorMessage: "Không thể cập nhật danh sách lớp học cho học sinh.",
      action: async () => {
        await studentApi.updateStudentClasses(student.id, {
          class_ids: nextClassIds,
        });
        return changedClassIds;
      },
      onSuccess: async (updatedClassIds) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["student", "detail", student.id] }),
          queryClient.invalidateQueries({ queryKey: ["student", "list"] }),
          queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
          ...updatedClassIds.map((classId) =>
            queryClient.invalidateQueries({ queryKey: ["class", "detail", classId] }),
          ),
        ]);
        await onSuccess?.();
      },
    });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-student-classes-title"
        className="fixed inset-x-3 bottom-3 top-16 z-50 flex min-h-0 max-h-[calc(100dvh-4.75rem)] flex-col overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-surface shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[min(64rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="border-b border-border-default bg-[radial-gradient(circle_at_top_left,var(--ue-secondary),transparent_34%),linear-gradient(120deg,var(--ue-bg-surface),var(--ue-bg-secondary))] px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                Class Assignment Studio
              </p>
              <h2
                id="edit-student-classes-title"
                className="mt-1 text-lg font-semibold tracking-[-0.03em] text-text-primary sm:text-xl"
              >
                Điều chỉnh danh sách lớp học
              </h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-text-secondary sm:mt-2 sm:text-sm sm:leading-6">
                Thêm hoặc gỡ học sinh khỏi nhiều lớp trong một lượt lưu. Hệ thống sẽ đồng bộ
                membership cho từng lớp ở backend thay vì chỉ đổi giao diện.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border-default bg-bg-surface p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
            <CountCard label="Đang có" value={currentClasses.length} toneClass="text-text-primary" />
            <CountCard label="Sẽ thêm" value={classesToAdd.length} toneClass="text-primary" />
            <CountCard label="Sẽ gỡ" value={classesToRemove.length} toneClass="text-error" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid min-h-0 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[1.5rem] border border-border-default bg-bg-secondary/40 p-4 xl:flex xl:min-h-0 xl:flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Khám phá lớp
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-text-primary">
                    Tìm và thêm lớp mới
                  </h3>
                </div>
                <div className="rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary">
                  Tối đa {SEARCH_RESULT_LIMIT} lớp
                </div>
              </div>

              <label className="mt-4 block shrink-0">
                <span className="sr-only">Tìm kiếm lớp học</span>
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Tìm lớp theo tên..."
                    className="w-full rounded-2xl border border-border-default bg-bg-surface px-4 py-3 pr-11 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                    />
                  </svg>
                </div>
              </label>

              <div className="mt-4 space-y-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                {isClassSearchLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`class-loading-${index}`}
                      className="h-24 animate-pulse rounded-2xl border border-border-default bg-bg-surface"
                    />
                  ))
                ) : visibleSearchableClasses.length > 0 ? (
                  visibleSearchableClasses.map((classItem) => (
                    <article
                      key={classItem.id}
                      className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm transition-colors hover:border-border-focus"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-semibold text-text-primary">
                              {classItem.name}
                            </h4>
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${classStatusBadgeClass(classItem.status)}`}
                            >
                              {CLASS_STATUS_LABELS[classItem.status]}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                            <span className="rounded-full bg-bg-secondary px-2 py-1 ring-1 ring-border-default">
                              {classItem.course?.name ?? "—"}
                            </span>
                            <span>Tối đa {classItem.maxStudents} học sinh</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddClass(classItem)}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          Thêm
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface p-5 text-sm text-text-secondary">
                    {searchInput.trim()
                      ? "Không tìm thấy lớp phù hợp với từ khóa hiện tại."
                      : "Nhập tên lớp để tìm và thêm vào danh sách của học sinh."}
                  </div>
                )}
                {searchableClasses.length > SEARCH_RESULT_LIMIT ? (
                  <p className="px-1 text-xs text-text-muted">
                    Hiển thị 3 lớp phù hợp nhất. Tinh chỉnh từ khóa để xem kết quả khác.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-default bg-bg-primary p-4 shadow-sm xl:flex xl:min-h-0 xl:flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Danh sách sau khi lưu
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-text-primary">
                    Lớp học của {student.fullName?.trim() || "học sinh"}
                  </h3>
                </div>
                <div className="rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary">
                  {selectedClasses.length} lớp
                </div>
              </div>

              {selectedClasses.length > 0 ? (
                <div className="mt-4 space-y-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                  {selectedClassesWithMeta.map((classItem) => {
                    const isNew = !currentClassIds.has(classItem.id);

                    return (
                      <article
                        key={classItem.id}
                        className="rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate text-sm font-semibold text-text-primary">
                                {classItem.name}
                              </h4>
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${
                                  isNew
                                    ? "bg-primary/10 text-primary ring-primary/20"
                                    : "bg-bg-secondary text-text-secondary ring-border-default"
                                }`}
                              >
                                {isNew ? "Sẽ thêm" : "Đang có"}
                              </span>
                              {classItem.status ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${classStatusBadgeClass(classItem.status)}`}
                                >
                                  {CLASS_STATUS_LABELS[classItem.status]}
                                </span>
                              ) : null}
                            </div>
                            {classItem.course ? (
                              <p className="mt-2 text-xs text-text-secondary">
                                Hệ lớp: {classItem.course.name}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveClass(classItem.id)}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          >
                            Gỡ
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border-default bg-bg-secondary/40 p-5 text-sm text-text-secondary xl:flex-1">
                  Học sinh sẽ không thuộc lớp nào sau khi lưu thay đổi này.
                </div>
              )}

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:shrink-0">
                <div className="rounded-2xl border border-border-default bg-bg-secondary/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Sẽ thêm
                  </p>
                  {classesToAdd.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-text-primary">
                      {classesToAddWithMeta.map((classItem) => (
                        <li key={`add-${classItem.id}`} className="rounded-xl bg-bg-surface px-3 py-2">
                          {classItem.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-text-secondary">Không có lớp mới.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-border-default bg-bg-secondary/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Sẽ gỡ
                  </p>
                  {classesToRemove.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-text-primary">
                      {classesToRemove.map((classItem) => (
                        <li key={`remove-${classItem.id}`} className="rounded-xl bg-bg-surface px-3 py-2">
                          {classItem.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-text-secondary">Không có lớp bị gỡ.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-border-default bg-bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-text-secondary">
            {hasChanges
              ? `Chuẩn bị đồng bộ ${classesToAdd.length + classesToRemove.length} thay đổi membership.`
              : "Chưa có thay đổi nào cần lưu."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Lưu danh sách lớp
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
