"use client";

import {
  ClipboardDocumentIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  ClassSurveyRecord,
  ClassSurveyStudentAssessmentPayload,
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import {
  buildClassSurveyReportZaloMessage,
  copyTextToClipboard,
} from "@/lib/survey-notification";
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

export type ClassSurveyPickerOption = {
  id: string;
  name: string | null;
};

export type ClassSurveyTeacherOption = {
  id: string;
  fullName: string;
};

export type ClassSurveyStudentOption = {
  id: string;
  fullName: string;
};

type RosterDraftRow = {
  studentId: string;
  fullName: string;
  comment: string;
};

const surveyDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

type Props = {
  className?: string;
  surveys: ClassSurveyRecord[];
  availableSurveys: ClassSurveyPickerOption[];
  teachers: ClassSurveyTeacherOption[];
  students: ClassSurveyStudentOption[];
  loading?: boolean;
  fetching?: boolean;
  error?: boolean;
  canManage?: boolean;
  canViewDetails?: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  defaultTeacherId?: string;
  onCreate: (payload: CreateClassSurveyPayload) => Promise<unknown>;
  onUpdate: (
    surveyId: string,
    payload: UpdateClassSurveyPayload,
  ) => Promise<unknown>;
  onDelete: (surveyId: string) => Promise<unknown>;
  hideList?: boolean;
  autoOpenSurveyId?: string | null;
  autoOpenToken?: number;
};

function getTodayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function getSurveyDateInput(value?: string | null) {
  if (!value) return getTodayInputValue();
  return value.slice(0, 10);
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

function buildRosterDraft(
  students: ClassSurveyStudentOption[],
  survey?: ClassSurveyRecord | null,
): RosterDraftRow[] {
  return students.map((student) => {
    const existing = survey?.students.find(
      (item) => item.studentId === student.id,
    );
    return {
      studentId: student.id,
      fullName: student.fullName,
      comment: existing?.comment ?? "",
    };
  });
}

function renderSurveyTeacher(survey: ClassSurveyRecord) {
  return survey.teacher?.fullName || "—";
}

function renderSurveyName(survey: ClassSurveyRecord) {
  return survey.survey?.name || (survey.testNumber ? `Lần ${survey.testNumber}` : "—");
}

async function copySurveyReport(survey: ClassSurveyRecord, className?: string) {
  const message = buildClassSurveyReportZaloMessage({
    className,
    surveyName: renderSurveyName(survey),
    reportDate: survey.reportDate,
    teacherName: survey.teacher?.fullName,
    knowledgeAssessment: survey.knowledgeAssessment,
    students: survey.students.map((item) => ({
      fullName: item.fullName,
      comment: item.comment,
    })),
  });
  try {
    await copyTextToClipboard(message);
    toast.success("Đã sao chép nội dung báo cáo. Dán vào Zalo để gửi.");
  } catch {
    toast.error("Không thể sao chép. Vui lòng thử lại.");
  }
}

function renderSurveyAssessmentSummary(survey: ClassSurveyRecord) {
  const commentCount = survey.students.filter((item) => item.comment).length;
  const hasKnowledgeAssessment = Boolean(survey.knowledgeAssessment);

  if (!hasKnowledgeAssessment && commentCount === 0) {
    return "Chưa có đánh giá";
  }
  if (commentCount === 0) {
    return "Đã có đánh giá kiến thức";
  }
  return `${commentCount} học sinh có nhận xét`;
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
              {["Bài khảo sát", "Ngày báo cáo", "Người phụ trách", "Đánh giá", ""].map(
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
  onClick: (event: SyntheticEvent<HTMLButtonElement>) => void;
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

function RosterEditor({
  rows,
  onChange,
  readOnly,
}: {
  rows: RosterDraftRow[];
  onChange: (rows: RosterDraftRow[]) => void;
  readOnly?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        Lớp chưa có học sinh đang học.
      </p>
    );
  }

  const updateRow = (studentId: string, patch: Partial<RosterDraftRow>) => {
    onChange(
      rows.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row)),
    );
  };

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.studentId}
          className="rounded-lg border border-border-default bg-bg-secondary/40 p-3"
        >
          <p className="mb-2 text-sm font-semibold text-text-primary">{row.fullName}</p>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Nhận xét</span>
            <textarea
              value={row.comment}
              readOnly={readOnly}
              onChange={(event) =>
                updateRow(row.studentId, { comment: event.target.value })
              }
              rows={2}
              className="min-h-[64px] rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function SurveyFormDialog({
  mode,
  open,
  survey,
  className,
  availableSurveys,
  teachers,
  students,
  defaultTeacherId,
  saving,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  open: boolean;
  survey?: ClassSurveyRecord | null;
  className?: string;
  availableSurveys: ClassSurveyPickerOption[];
  teachers: ClassSurveyTeacherOption[];
  students: ClassSurveyStudentOption[];
  defaultTeacherId?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateClassSurveyPayload) => Promise<unknown>;
}) {
  const [surveyId, setSurveyId] = useState(
    survey?.surveyId ?? availableSurveys[0]?.id ?? "",
  );
  const [reportDate, setReportDate] = useState(
    () => getSurveyDateInput(survey?.reportDate),
  );
  const [teacherId, setTeacherId] = useState(
    () => resolveInitialTeacherId(teachers, defaultTeacherId, survey),
  );
  const [knowledgeAssessment, setKnowledgeAssessment] = useState(
    survey?.knowledgeAssessment ?? "",
  );
  const [roster, setRoster] = useState<RosterDraftRow[]>(() =>
    buildRosterDraft(students, survey),
  );

  if (!open) return null;

  const title = mode === "create" ? "Thêm báo cáo khảo sát" : "Sửa báo cáo khảo sát";
  const formId = mode === "create" ? "class-survey-create-form" : "class-survey-edit-form";
  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: teacher.fullName,
  }));
  const surveyOptions = availableSurveys.map((item) => ({
    value: item.id,
    label: item.name ?? "(Không tên)",
  }));

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!surveyId) {
      toast.error("Chọn bài khảo sát cần báo cáo.");
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
    if (roster.length === 0) {
      toast.error("Lớp chưa có học sinh đang học để đánh giá.");
      return;
    }

    const studentsPayload: ClassSurveyStudentAssessmentPayload[] = roster.map(
      (row) => ({
        student_id: row.studentId,
        comment: row.comment.trim() || undefined,
      }),
    );

    await onSubmit({
      survey_id: surveyId,
      report_date: reportDate,
      teacher_id: teacherId,
      knowledge_assessment: knowledgeAssessment.trim() || undefined,
      students: studentsPayload,
    });
  };

  const handleCopy = async () => {
    const message = buildClassSurveyReportZaloMessage({
      className,
      surveyName:
        availableSurveys.find((item) => item.id === surveyId)?.name ??
        survey?.survey?.name ??
        null,
      reportDate,
      teacherName: teachers.find((item) => item.id === teacherId)?.fullName,
      knowledgeAssessment,
      students: roster.map((row) => ({
        fullName: row.fullName,
        comment: row.comment,
      })),
    });
    try {
      await copyTextToClipboard(message);
      toast.success("Đã sao chép nội dung báo cáo. Dán vào Zalo để gửi.");
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
              <span>Bài khảo sát</span>
              <UpgradedSelect
                name={`${formId}-survey`}
                value={surveyId}
                onValueChange={setSurveyId}
                options={surveyOptions}
                placeholder="Chọn bài khảo sát"
                disabled={mode === "edit" || surveyOptions.length === 0}
                buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                searchable
                noResultsLabel="Không tìm thấy bài khảo sát."
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

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              Đánh giá kiến thức
            </span>
            <textarea
              value={knowledgeAssessment}
              onChange={(event) => setKnowledgeAssessment(event.target.value)}
              rows={3}
              placeholder="Đánh giá kiến thức chung của lớp cho bài khảo sát này"
              className="min-h-[88px] rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </label>

          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              Nhận xét từng học sinh
            </span>
            <RosterEditor rows={roster} onChange={setRoster} />
          </div>
        </form>

        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary sm:mr-auto sm:min-h-0 sm:w-auto"
          >
            <ClipboardDocumentIcon className="size-4" aria-hidden />
            Sao chép để dán Zalo
          </button>
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
            {saving ? "Đang lưu…" : "Lưu báo cáo"}
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
            Xóa báo cáo khảo sát
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
          Xóa báo cáo &quot;{renderSurveyName(survey)}&quot; ngày{" "}
          {formatSurveyDate(survey.reportDate)}? Hành động này không thể hoàn tác.
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

function SurveyViewDialog({
  survey,
  className,
  onClose,
}: {
  survey: ClassSurveyRecord | null;
  className?: string;
  onClose: () => void;
}) {
  if (!survey) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-class-survey-title"
        className={classEditorModalWideClassName}
      >
        <div className={classEditorModalHeaderClassName}>
          <h2 id="view-class-survey-title" className={classEditorModalTitleClassName}>
            Xem báo cáo khảo sát
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

        <div className={`${classEditorModalBodyClassName} pr-0 sm:pr-1`}>
          <section className="grid gap-3 rounded-lg border border-border-default bg-bg-secondary/50 p-3 sm:p-4 md:grid-cols-3">
            <div className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Bài khảo sát</span>
              <div className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary">
                {renderSurveyName(survey)}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Ngày báo cáo</span>
              <div className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary">
                {formatSurveyDate(survey.reportDate)}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Người phụ trách</span>
              <div className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary">
                {renderSurveyTeacher(survey)}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              Đánh giá kiến thức
            </span>
            <div className="rounded-lg border border-border-default bg-bg-surface p-3">
              <p className="whitespace-pre-wrap text-sm text-text-secondary">
                {survey.knowledgeAssessment || "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              Nhận xét từng học sinh
            </span>
            {survey.students.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                Chưa có nhận xét học sinh.
              </p>
            ) : (
              <div className="space-y-3">
                {survey.students.map((item) => (
                  <div
                    key={item.studentId}
                    className="rounded-lg border border-border-default bg-bg-surface p-3"
                  >
                    <p className="mb-2 text-sm font-semibold text-text-primary">
                      {item.fullName}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {item.comment || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={() => copySurveyReport(survey, className)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary sm:min-h-0 sm:w-auto"
          >
            <ClipboardDocumentIcon className="size-4" aria-hidden />
            Sao chép để dán Zalo
          </button>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Đóng
          </button>
        </div>
      </div>
    </>
  );
}

export default function ClassSurveyPanel({
  className,
  surveys,
  availableSurveys,
  teachers,
  students,
  loading = false,
  fetching = false,
  error = false,
  canManage = false,
  canViewDetails = false,
  createOpen,
  onCreateOpenChange,
  defaultTeacherId,
  onCreate,
  onUpdate,
  onDelete,
  hideList = false,
  autoOpenSurveyId = null,
  autoOpenToken = 0,
}: Props) {
  const [viewingSurvey, setViewingSurvey] = useState<ClassSurveyRecord | null>(null);
  const [editingSurvey, setEditingSurvey] = useState<ClassSurveyRecord | null>(null);
  const [deletingSurvey, setDeletingSurvey] = useState<ClassSurveyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sortedSurveys = useMemo(
    () => [...surveys].sort((a, b) => b.reportDate.localeCompare(a.reportDate)),
    [surveys],
  );

  useEffect(() => {
    if (!autoOpenSurveyId) return;
    const survey = surveys.find((item) => item.id === autoOpenSurveyId);
    if (!survey) return;
    if (canManage) setEditingSurvey(survey);
    else setViewingSurvey(survey);
  }, [autoOpenSurveyId, autoOpenToken, surveys, canManage]);

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
      loading: "Đang xóa báo cáo…",
      success: "Đã xóa báo cáo.",
      error: "Không thể xóa báo cáo.",
    });
    try {
      await promise;
    } catch {
      // Toast already renders the failure state.
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !hideList) {
    return <SurveyTableSkeleton />;
  }

  return (
    <div className={fetching ? "transition-opacity opacity-70" : "transition-opacity"}>
      {!hideList ? (
      <>
      {teachers.length === 0 && canManage ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Lớp chưa có gia sư phụ trách nên chưa thể tạo báo cáo khảo sát.
        </div>
      ) : null}
      {availableSurveys.length === 0 && canManage ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Chưa có bài khảo sát nào được tạo. Vui lòng liên hệ admin/đội giáo án.
        </div>
      ) : null}

      <div className="md:hidden">
        {sortedSurveys.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Không có báo cáo khảo sát trong tháng này.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedSurveys.map((survey) => (
              <article
                key={survey.id}
                role={canViewDetails ? "button" : undefined}
                tabIndex={canViewDetails ? 0 : undefined}
                onClick={canViewDetails ? () => setViewingSurvey(survey) : undefined}
                onKeyDown={
                  canViewDetails
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setViewingSurvey(survey);
                        }
                      }
                    : undefined
                }
                className={`rounded-lg border border-border-default bg-bg-surface p-3 shadow-sm ${
                  canViewDetails
                    ? "cursor-pointer transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-text-muted">
                      Bài khảo sát
                    </p>
                    <p className="text-sm font-semibold text-text-primary">
                      {renderSurveyName(survey)}
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
                  <div className="flex shrink-0 gap-1">
                    <IconButton
                      label="Sao chép để dán Zalo"
                      onClick={(event) => {
                        event.stopPropagation();
                        void copySurveyReport(survey, className);
                      }}
                    >
                      <ClipboardDocumentIcon className="size-4" aria-hidden />
                    </IconButton>
                    {canManage ? (
                      <>
                        <IconButton
                          label="Sửa báo cáo"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingSurvey(survey);
                          }}
                        >
                          <PencilSquareIcon className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          label="Xóa báo cáo"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeletingSurvey(survey);
                          }}
                        >
                          <TrashIcon className="size-4" aria-hidden />
                        </IconButton>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 border-t border-border-subtle pt-3 text-xs text-text-muted">
                  {renderSurveyAssessmentSummary(survey)}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      {sortedSurveys.length === 0 ? (
        <p className="hidden py-6 text-center text-sm text-text-muted md:block">
          Không có báo cáo khảo sát trong tháng này.
        </p>
      ) : (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">Báo cáo khảo sát lớp</caption>
            <thead>
              <tr className="border-b border-border-default bg-bg-secondary">
                <th scope="col" className="px-4 py-3 font-medium text-text-primary">
                  Bài khảo sát
                </th>
                <th scope="col" className="w-36 px-4 py-3 font-medium text-text-primary">
                  Ngày báo cáo
                </th>
                <th scope="col" className="w-48 px-4 py-3 font-medium text-text-primary">
                  Người phụ trách
                </th>
                <th scope="col" className="w-40 px-4 py-3 font-medium text-text-primary">
                  Đánh giá
                </th>
                <th scope="col" className="w-32 px-2 py-3 font-medium text-text-primary">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSurveys.map((survey) => (
                <tr
                  key={survey.id}
                  role={canViewDetails ? "button" : undefined}
                  tabIndex={canViewDetails ? 0 : undefined}
                  onClick={canViewDetails ? () => setViewingSurvey(survey) : undefined}
                  onKeyDown={
                    canViewDetails
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setViewingSurvey(survey);
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary ${
                    canViewDetails
                      ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {renderSurveyName(survey)}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{formatSurveyDate(survey.reportDate)}</td>
                  <td className="px-4 py-3 text-text-primary">{renderSurveyTeacher(survey)}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {renderSurveyAssessmentSummary(survey)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        label="Sao chép để dán Zalo"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copySurveyReport(survey, className);
                        }}
                      >
                        <ClipboardDocumentIcon className="size-4" aria-hidden />
                      </IconButton>
                      {canManage ? (
                        <>
                          <IconButton
                            label="Sửa báo cáo"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingSurvey(survey);
                            }}
                          >
                            <PencilSquareIcon className="size-4" aria-hidden />
                          </IconButton>
                          <IconButton
                            label="Xóa báo cáo"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeletingSurvey(survey);
                            }}
                          >
                            <TrashIcon className="size-4" aria-hidden />
                          </IconButton>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-error" role="alert">
          Không tải được danh sách báo cáo khảo sát.
        </p>
      ) : null}
      </>
      ) : null}

      <SurveyFormDialog
        key={createOpen ? `create-${surveys.length}-${teachers.length}-${students.length}` : "create-closed"}
        mode="create"
        open={createOpen}
        className={className}
        availableSurveys={availableSurveys}
        teachers={teachers}
        students={students}
        defaultTeacherId={defaultTeacherId}
        saving={saving}
        onClose={() => onCreateOpenChange(false)}
        onSubmit={(payload) =>
          runSave(
            () => onCreate(payload),
            {
              loading: "Đang lưu báo cáo…",
              success: "Đã lưu báo cáo.",
              error: "Không thể lưu báo cáo.",
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
        className={className}
        availableSurveys={availableSurveys}
        teachers={teachers}
        students={students}
        defaultTeacherId={defaultTeacherId}
        saving={saving}
        onClose={() => setEditingSurvey(null)}
        onSubmit={(payload) =>
          editingSurvey
            ? runSave(
                () => onUpdate(editingSurvey.id, payload),
                {
                  loading: "Đang cập nhật báo cáo…",
                  success: "Đã cập nhật báo cáo.",
                  error: "Không thể cập nhật báo cáo.",
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

      <SurveyViewDialog
        survey={viewingSurvey}
        className={className}
        onClose={() => setViewingSurvey(null)}
      />
    </div>
  );
}
