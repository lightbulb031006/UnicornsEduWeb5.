"use client";

import { PencilSquareIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import RichTextEditor from "@/components/ui/RichTextEditor";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  ClassSurveyRecord,
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import { getRichTextPlainContent, sanitizeRichTextContent } from "@/lib/sanitize";
import {
  classEditorModalBodyClassName,
  classEditorModalCloseButtonClassName,
  classEditorModalFooterClassName,
  classEditorModalHeaderClassName,
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
  classEditorModalWideClassName,
} from "./classEditorModalStyles";

export type ClassSurveyTeacherOption = {
  id: string;
  fullName: string;
};

type SurveyFormValues = CreateClassSurveyPayload;

const surveyDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

type Props = {
  surveys: ClassSurveyRecord[];
  teachers: ClassSurveyTeacherOption[];
  loading?: boolean;
  fetching?: boolean;
  error?: boolean;
  canManage?: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  defaultTeacherId?: string;
  onCreate: (payload: CreateClassSurveyPayload) => Promise<unknown>;
  onUpdate: (
    surveyId: string,
    payload: UpdateClassSurveyPayload,
  ) => Promise<unknown>;
  onDelete: (surveyId: string) => Promise<unknown>;
};

function getTodayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function getSurveyDateInput(value?: string | null) {
  if (!value) return getTodayInputValue();
  return value.slice(0, 10);
}

function getNextSurveyNumber(surveys: ClassSurveyRecord[]) {
  const maxNumber = surveys.reduce(
    (max, survey) => Math.max(max, survey.testNumber || 0),
    0,
  );
  return maxNumber + 1;
}

function resolveInitialTeacherId(
  teachers: ClassSurveyTeacherOption[],
  defaultTeacherId?: string,
  survey?: ClassSurveyRecord | null,
) {
  if (survey?.teacherId && teachers.some((teacher) => teacher.id === survey.teacherId)) {
    return survey.teacherId;
  }
  if (defaultTeacherId && teachers.some((teacher) => teacher.id === defaultTeacherId)) {
    return defaultTeacherId;
  }
  return teachers[0]?.id ?? "";
}

function renderSurveyTeacher(survey: ClassSurveyRecord) {
  return survey.teacher?.fullName || "—";
}

function formatSurveyDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }
  return surveyDateFormatter.format(date);
}

function SurveyContentPreview({ content }: { content: string }) {
  const html = sanitizeRichTextContent(content);
  if (!html) {
    return <span className="text-text-muted">—</span>;
  }

  return (
    <div
      className="line-clamp-3 max-w-none break-words text-text-secondary [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SurveyTableSkeleton() {
  return (
    <div aria-hidden>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <article
            key={index}
            className="rounded-lg border border-border-default bg-bg-surface p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <span className="block h-4 w-28 animate-pulse rounded bg-bg-tertiary" />
                <span className="block h-3 w-20 animate-pulse rounded bg-bg-tertiary" />
              </div>
              <span className="block h-5 w-16 animate-pulse rounded-full bg-bg-tertiary" />
            </div>
            <div className="mt-3 space-y-1 border-t border-border-subtle pt-3">
              <span className="block h-3 w-full animate-pulse rounded bg-bg-tertiary" />
              <span className="block h-3 w-2/3 animate-pulse rounded bg-bg-tertiary" />
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-default bg-bg-secondary">
              {["Khảo sát", "Ngày báo cáo", "Người phụ trách", "Nội dung", ""].map(
                (label) => (
                  <th
                    key={label || "actions"}
                    className="px-4 py-3 font-medium text-text-primary"
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, index) => (
              <tr
                key={index}
                className="border-b border-border-default bg-bg-surface"
              >
                {Array.from({ length: 5 }).map((__, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3">
                    <span className="block h-5 w-24 animate-pulse rounded bg-bg-tertiary" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {children}
    </button>
  );
}

function SurveyFormDialog({
  mode,
  open,
  survey,
  surveys,
  teachers,
  defaultTeacherId,
  saving,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  open: boolean;
  survey?: ClassSurveyRecord | null;
  surveys: ClassSurveyRecord[];
  teachers: ClassSurveyTeacherOption[];
  defaultTeacherId?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: SurveyFormValues) => Promise<unknown>;
}) {
  const [testNumberInput, setTestNumberInput] = useState(
    String(survey?.testNumber ?? getNextSurveyNumber(surveys)),
  );
  const [reportDate, setReportDate] = useState(
    getSurveyDateInput(survey?.reportDate),
  );
  const [teacherId, setTeacherId] = useState(
    resolveInitialTeacherId(teachers, defaultTeacherId, survey),
  );
  const [content, setContent] = useState(survey?.content ?? "");

  if (!open) return null;

  const title = mode === "create" ? "Thêm khảo sát" : "Sửa khảo sát";
  const formId = mode === "create" ? "class-survey-create-form" : "class-survey-edit-form";
  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: teacher.fullName,
  }));

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const testNumber = Number(testNumberInput);
    if (!Number.isInteger(testNumber) || testNumber < 1) {
      toast.error("Khảo sát lần mấy phải là số nguyên lớn hơn 0.");
      return;
    }
    if (!reportDate) {
      toast.error("Ngày báo cáo là bắt buộc.");
      return;
    }
    if (!teacherId) {
      toast.error("Chọn người phụ trách khảo sát.");
      return;
    }
    if (!getRichTextPlainContent(content)) {
      toast.error("Nội dung báo cáo không được để trống.");
      return;
    }

    await onSubmit({
      test_number: testNumber,
      report_date: reportDate,
      teacher_id: teacherId,
      content,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className={classEditorModalWideClassName}
      >
        <div className={classEditorModalHeaderClassName}>
          <h2 id={`${formId}-title`} className={classEditorModalTitleClassName}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalCloseButtonClassName}
            aria-label="Đóng"
          >
            <XMarkIcon className="size-5" aria-hidden />
          </button>
        </div>

        <form id={formId} onSubmit={handleSubmit} className={`${classEditorModalBodyClassName} pr-0 sm:pr-1`}>
          <section className="grid gap-3 rounded-lg border border-border-default bg-bg-secondary/50 p-3 sm:p-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Khảo sát lần mấy</span>
              <input
                type="number"
                name={`${formId}-test-number`}
                min={1}
                inputMode="numeric"
                autoComplete="off"
                value={testNumberInput}
                onChange={(event) => setTestNumberInput(event.target.value)}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Ngày báo cáo</span>
              <DateInput
                name={`${formId}-report-date`}
                autoComplete="off"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Người phụ trách</span>
              <UpgradedSelect
                name={`${formId}-teacher`}
                value={teacherId}
                onValueChange={setTeacherId}
                options={teacherOptions}
                placeholder="Chọn gia sư"
                disabled={teacherOptions.length === 0}
                buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>
          </section>

          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            <span>Nội dung báo cáo</span>
            <RichTextEditor
              value={content}
              onChange={setContent}
              minHeight="min-h-[220px]"
              ariaLabel="Nội dung báo cáo khảo sát"
            />
          </label>
        </form>

        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Hủy
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving || teacherOptions.length === 0}
            className={classEditorModalPrimaryButtonClassName}
          >
            {saving ? "Đang lưu…" : "Lưu khảo sát"}
          </button>
        </div>
      </div>
    </>
  );
}

function DeleteSurveyDialog({
  survey,
  deleting,
  onClose,
  onConfirm,
}: {
  survey: ClassSurveyRecord | null;
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
        aria-labelledby="delete-class-survey-title"
        className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-xl sm:w-full sm:p-5"
      >
        <div className={classEditorModalHeaderClassName}>
          <h2 id="delete-class-survey-title" className={classEditorModalTitleClassName}>
            Xóa khảo sát
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalCloseButtonClassName}
            aria-label="Đóng"
          >
            <XMarkIcon className="size-5" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-text-secondary">
          Xóa khảo sát lần {survey.testNumber} ngày {formatSurveyDate(survey.reportDate)}? Hành động này không thể hoàn tác.
        </p>
        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="min-h-11 w-full rounded-md bg-error px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60 sm:min-h-0 sm:w-auto"
          >
            {deleting ? "Đang xóa…" : "Xóa"}
          </button>
        </div>
      </div>
    </>
  );
}

export default function ClassSurveyPanel({
  surveys,
  teachers,
  loading = false,
  fetching = false,
  error = false,
  canManage = false,
  createOpen,
  onCreateOpenChange,
  defaultTeacherId,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editingSurvey, setEditingSurvey] = useState<ClassSurveyRecord | null>(null);
  const [deletingSurvey, setDeletingSurvey] = useState<ClassSurveyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sortedSurveys = useMemo(
    () =>
      [...surveys].sort((a, b) => {
        const dateCompare = b.reportDate.localeCompare(a.reportDate);
        if (dateCompare !== 0) return dateCompare;
        return b.testNumber - a.testNumber;
      }),
    [surveys],
  );

  const runSave = async (
    action: () => Promise<unknown>,
    messages: { loading: string; success: string; error: string },
    afterClose: () => void,
  ) => {
    setSaving(true);
    afterClose();
    const promise = action();
    toast.promise(promise, messages);
    try {
      await promise;
    } catch {
      // Toast already renders the failure state.
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async () => {
    if (!deletingSurvey) return;
    setDeleting(true);
    const surveyId = deletingSurvey.id;
    setDeletingSurvey(null);
    const promise = onDelete(surveyId);
    toast.promise(promise, {
      loading: "Đang xóa khảo sát…",
      success: "Đã xóa khảo sát.",
      error: "Không thể xóa khảo sát.",
    });
    try {
      await promise;
    } catch {
      // Toast already renders the failure state.
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <SurveyTableSkeleton />;
  }

  return (
    <div className={fetching ? "transition-opacity opacity-70" : "transition-opacity"}>
      {teachers.length === 0 && canManage ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Lớp chưa có gia sư phụ trách nên chưa thể tạo khảo sát.
        </div>
      ) : null}

      <div className="md:hidden">
        {sortedSurveys.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Không có khảo sát trong tháng này.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedSurveys.map((survey) => (
              <article
                key={survey.id}
                className="rounded-lg border border-border-default bg-bg-surface p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-text-muted">
                      Khảo sát
                    </p>
                    <p className="text-sm font-semibold text-text-primary">
                      Lần {survey.testNumber}
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase text-text-muted">
                      Ngày báo cáo
                    </p>
                    <p className="text-sm text-text-primary">{formatSurveyDate(survey.reportDate)}</p>
                    <p className="mt-2 text-xs font-medium uppercase text-text-muted">
                      Người phụ trách
                    </p>
                    <p className="text-sm text-text-primary">{renderSurveyTeacher(survey)}</p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <IconButton label="Sửa khảo sát" onClick={() => setEditingSurvey(survey)}>
                        <PencilSquareIcon className="size-4" aria-hidden />
                      </IconButton>
                      <IconButton label="Xóa khảo sát" onClick={() => setDeletingSurvey(survey)}>
                        <TrashIcon className="size-4" aria-hidden />
                      </IconButton>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 border-t border-border-subtle pt-3 text-sm">
                  <SurveyContentPreview content={survey.content} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {sortedSurveys.length === 0 ? (
        <p className="hidden py-6 text-center text-sm text-text-muted md:block">
          Không có khảo sát trong tháng này.
        </p>
      ) : (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">Khảo sát lớp</caption>
            <thead>
              <tr className="border-b border-border-default bg-bg-secondary">
                <th scope="col" className="w-28 px-4 py-3 font-medium text-text-primary">
                  Khảo sát
                </th>
                <th scope="col" className="w-36 px-4 py-3 font-medium text-text-primary">
                  Ngày báo cáo
                </th>
                <th scope="col" className="w-48 px-4 py-3 font-medium text-text-primary">
                  Người phụ trách
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-text-primary">
                  Nội dung
                </th>
                {canManage ? (
                  <th scope="col" className="w-24 px-2 py-3 font-medium text-text-primary">
                    <span className="sr-only">Thao tác</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sortedSurveys.map((survey) => (
                <tr
                  key={survey.id}
                  className="border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">
                    Lần {survey.testNumber}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{formatSurveyDate(survey.reportDate)}</td>
                  <td className="px-4 py-3 text-text-primary">{renderSurveyTeacher(survey)}</td>
                  <td className="px-4 py-3 text-sm">
                    <SurveyContentPreview content={survey.content} />
                  </td>
                  {canManage ? (
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton label="Sửa khảo sát" onClick={() => setEditingSurvey(survey)}>
                          <PencilSquareIcon className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton label="Xóa khảo sát" onClick={() => setDeletingSurvey(survey)}>
                          <TrashIcon className="size-4" aria-hidden />
                        </IconButton>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-error" role="alert">
          Không tải được danh sách khảo sát.
        </p>
      ) : null}

      <SurveyFormDialog
        key={createOpen ? `create-${surveys.length}-${teachers.length}` : "create-closed"}
        mode="create"
        open={createOpen}
        surveys={surveys}
        teachers={teachers}
        defaultTeacherId={defaultTeacherId}
        saving={saving}
        onClose={() => onCreateOpenChange(false)}
        onSubmit={(payload) =>
          runSave(
            () => onCreate(payload),
            {
              loading: "Đang lưu khảo sát…",
              success: "Đã lưu khảo sát.",
              error: "Không thể lưu khảo sát.",
            },
            () => onCreateOpenChange(false),
          )
        }
      />

      <SurveyFormDialog
        key={editingSurvey?.id ?? "edit-closed"}
        mode="edit"
        open={Boolean(editingSurvey)}
        survey={editingSurvey}
        surveys={surveys}
        teachers={teachers}
        defaultTeacherId={defaultTeacherId}
        saving={saving}
        onClose={() => setEditingSurvey(null)}
        onSubmit={(payload) =>
          editingSurvey
            ? runSave(
                () => onUpdate(editingSurvey.id, payload),
                {
                  loading: "Đang cập nhật khảo sát…",
                  success: "Đã cập nhật khảo sát.",
                  error: "Không thể cập nhật khảo sát.",
                },
                () => setEditingSurvey(null),
              )
            : Promise.resolve()
        }
      />

      <DeleteSurveyDialog
        survey={deletingSurvey}
        deleting={deleting}
        onClose={() => setDeletingSurvey(null)}
        onConfirm={runDelete}
      />
    </div>
  );
}
