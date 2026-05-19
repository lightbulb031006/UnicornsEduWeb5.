"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useDebounce } from "use-debounce";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  ClassDetail,
  ClassScheduleItem,
  ClassStatus,
  ClassType,
  UpdateClassBasicInfoPayload,
  UpdateClassSchedulePayload,
  UpdateClassStudentsPayload,
  UpdateClassTeachersPayload,
} from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import * as staffApi from "@/lib/apis/staff.api";
import * as studentApi from "@/lib/apis/student.api";
import {
  CLASS_SCHEDULE_DAY_OPTIONS,
  compactTuitionPerSessionLine,
  computeStudentTuitionPerSessionFromPackage,
  maxAllowanceInputInitialFromServer,
  normalizeDayOfWeek,
  normalizeMaxAllowanceForCompare,
  normalizeTimeOnly,
  parseMaxAllowancePerSessionInput,
  parseTuitionPackageInputs,
} from "@/lib/class.helpers";
import { createClientId } from "@/lib/client-id";

type ScheduleRangeForm = {
  id: string;
  persistedId?: string;
  dayOfWeek: number;
  from: string;
  to: string;
  teacherId: string;
};

const EMPTY_SCHEDULE_RANGE = {
  dayOfWeek: 1,
  from: "",
  to: "",
  teacherId: "",
} as const;

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
};

const STATUS_OPTIONS: { value: ClassStatus; label: string }[] = [
  { value: "running", label: "Đang chạy" },
  { value: "ended", label: "Đã kết thúc" },
];

const TYPE_OPTIONS: { value: ClassType; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "vip", label: "VIP" },
  { value: "advance", label: "Advance" },
  { value: "hardcore", label: "Hardcore" },
];

function createScheduleRange(
  range?: Partial<
    Pick<ScheduleRangeForm, "id" | "dayOfWeek" | "from" | "to" | "teacherId">
  >,
  fallbackTeacherId?: string,
): ScheduleRangeForm {
  return {
    id: `local-slot-${createClientId()}`,
    persistedId: range?.id,
    dayOfWeek: normalizeDayOfWeek(range?.dayOfWeek, EMPTY_SCHEDULE_RANGE.dayOfWeek),
    from: range?.from ?? EMPTY_SCHEDULE_RANGE.from,
    to: range?.to ?? EMPTY_SCHEDULE_RANGE.to,
    teacherId: range?.teacherId ?? fallbackTeacherId ?? EMPTY_SCHEDULE_RANGE.teacherId,
  };
}

function normalizeSchedule(
  schedule: unknown,
  fallbackTeacherId?: string,
): ScheduleRangeForm[] {
  if (!Array.isArray(schedule)) return [];

  return schedule.reduce<ScheduleRangeForm[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;

    const record = item as Record<string, unknown>;
    const dayOfWeek = normalizeDayOfWeek(
      record.dayOfWeek,
      EMPTY_SCHEDULE_RANGE.dayOfWeek,
    );
    const from = normalizeTimeOnly(typeof record.from === "string" ? record.from : "");
    const to = normalizeTimeOnly(typeof record.to === "string" ? record.to : "");
    const teacherId =
      typeof record.teacherId === "string" ? record.teacherId : fallbackTeacherId;

    if (!from && !to) return acc;

    return [
      ...acc,
      createScheduleRange(
        {
          id: typeof record.id === "string" ? record.id : undefined,
          dayOfWeek,
          from,
          to,
          teacherId,
        },
        fallbackTeacherId,
      ),
    ];
  }, []);
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function normalizeOperatingDeductionRatePercent(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  if ((value ?? 0) < 0) return 0;
  if ((value ?? 0) > 100) return 100;
  return Number((value ?? 0).toFixed(2));
}

function parseTimeToSeconds(value: string): number | null {
  const matched = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!matched) return null;

  const [, hoursRaw, minutesRaw, secondsRaw] = matched;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);

  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function normalizeOptionalInteger(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.floor(value);
}

function normalizeScheduleForComparison(
  schedule: unknown,
): Array<{ dayOfWeek: number; from: string; to: string; teacherId: string }> {
  if (!Array.isArray(schedule)) return [];

  return schedule
    .reduce<Array<{ dayOfWeek: number; from: string; to: string; teacherId: string }>>(
      (acc, item) => {
        if (!item || typeof item !== "object") return acc;

        const record = item as Record<string, unknown>;
        const from = normalizeTimeOnly(typeof record.from === "string" ? record.from : "");
        const to = normalizeTimeOnly(typeof record.to === "string" ? record.to : "");

        if (!from && !to) return acc;

        return [
          ...acc,
          {
            dayOfWeek: normalizeDayOfWeek(record.dayOfWeek, EMPTY_SCHEDULE_RANGE.dayOfWeek),
            from,
            to,
            teacherId: typeof record.teacherId === "string" ? record.teacherId : "",
          },
        ];
      },
      [],
    )
    .sort((left, right) => {
      if (left.dayOfWeek !== right.dayOfWeek) {
        return left.dayOfWeek - right.dayOfWeek;
      }
      if (left.from !== right.from) {
        return left.from.localeCompare(right.from);
      }
      if (left.to !== right.to) {
        return left.to.localeCompare(right.to);
      }
      return left.teacherId.localeCompare(right.teacherId);
    });
}

function normalizeTeacherAssignmentsForComparison(
  teachers: Array<{
    id: string;
    customAllowance?: number | null;
    operatingDeductionRatePercent?: number | null;
    taxRatePercent?: number | null;
  }>,
) {
  return teachers
    .map((teacher) => ({
      teacherId: teacher.id,
      customAllowance:
        normalizeOptionalInteger(teacher.customAllowance) ?? null,
      operatingDeductionRatePercent: normalizeOperatingDeductionRatePercent(
        teacher.operatingDeductionRatePercent ?? teacher.taxRatePercent ?? undefined,
      ),
    }))
    .sort((left, right) => left.teacherId.localeCompare(right.teacherId));
}

function normalizeStudentIdsForComparison(students: Array<{ id: string }>) {
  return students.map((student) => student.id).sort((left, right) => left.localeCompare(right));
}

function reconcileScheduleRangesWithTeachers(
  scheduleRanges: ScheduleRangeForm[],
  teacherIds: string[],
) {
  const validTeacherIds = new Set(teacherIds);
  const fallbackTeacherId = teacherIds.length === 1 ? teacherIds[0] : "";
  const nextRanges = scheduleRanges.filter(
    (range) => !range.teacherId || validTeacherIds.has(range.teacherId),
  );

  if (nextRanges.length > 0) {
    return nextRanges;
  }

  return [createScheduleRange(undefined, fallbackTeacherId)];
}

function buildSchedulePayload(
  scheduleRanges: ScheduleRangeForm[],
): ClassScheduleItem[] {
  return scheduleRanges.reduce<ClassScheduleItem[]>((acc, range) => {
    if (!range.from && !range.to) return acc;

    if ((range.from && !range.to) || (!range.from && range.to)) {
      throw new Error("Mỗi dòng lịch học cần đủ cả thời gian bắt đầu và kết thúc.");
    }

    const from = normalizeTimeOnly(range.from);
    const to = normalizeTimeOnly(range.to);
    const fromSeconds = parseTimeToSeconds(from);
    const toSeconds = parseTimeToSeconds(to);

    if (!from || !to || fromSeconds == null || toSeconds == null) {
      throw new Error("Khung giờ học phải dùng định dạng HH:mm:ss.");
    }

    if (fromSeconds >= toSeconds) {
      throw new Error("Thời gian lịch học không hợp lệ (bắt đầu phải nhỏ hơn kết thúc).");
    }

    if (!range.teacherId.trim()) {
      throw new Error("Mỗi khung giờ học phải chọn gia sư chịu trách nhiệm.");
    }

    return [
      ...acc,
      {
        ...(range.persistedId ? { id: range.persistedId } : {}),
        dayOfWeek: range.dayOfWeek,
        from,
        to,
        teacherId: range.teacherId,
      },
    ];
  }, []);
}

export default function EditClassPopup({ open, onClose, classDetail }: Props) {
  if (!open) return null;

  return <EditClassDialog onClose={onClose} classDetail={classDetail} />;
}

function EditClassDialog({ onClose, classDetail }: Omit<Props, "open">) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(classDetail.name ?? "");
  const [type, setType] = useState<ClassType>(classDetail.type);
  const [status, setStatus] = useState<ClassStatus>(classDetail.status);
  const [maxStudentsInput, setMaxStudentsInput] = useState(String(classDetail.maxStudents ?? ""));
  const [allowancePerSessionInput, setAllowancePerSessionInput] = useState(
    String(classDetail.allowancePerSessionPerStudent ?? ""),
  );
  const [maxAllowancePerSessionInput, setMaxAllowancePerSessionInput] = useState(
    maxAllowanceInputInitialFromServer(classDetail.maxAllowancePerSession),
  );
  const [scaleAmountInput, setScaleAmountInput] = useState(
    classDetail.scaleAmount == null ? "" : String(classDetail.scaleAmount),
  );

  const [tuitionPackageTotalInput, setTuitionPackageTotalInput] = useState(
    classDetail.tuitionPackageTotal == null ? "" : String(classDetail.tuitionPackageTotal),
  );
  const [tuitionPackageSessionInput, setTuitionPackageSessionInput] = useState(
    classDetail.tuitionPackageSession == null ? "" : String(classDetail.tuitionPackageSession),
  );
  const initialDefaultTeacherId =
    (classDetail.teachers?.length ?? 0) === 1 ? classDetail.teachers?.[0]?.id ?? "" : "";
  const [scheduleRanges, setScheduleRanges] = useState<ScheduleRangeForm[]>(() => {
    const normalized = normalizeSchedule(classDetail.schedule, initialDefaultTeacherId);
    return normalized.length > 0
      ? normalized
      : [createScheduleRange(undefined, initialDefaultTeacherId)];
  });
  const [selectedTeachers, setSelectedTeachers] = useState<
    Array<{ id: string; name: string; customAllowance?: number; operatingDeductionRatePercent?: number }>
  >(() =>
    (classDetail.teachers ?? [])
      .filter((t) => t?.id)
      .map((t) => ({
        id: t.id,
        name: t.fullName?.trim() ?? "—",
        customAllowance: t.customAllowance ?? undefined,
        operatingDeductionRatePercent:
          t.operatingDeductionRatePercent ?? t.taxRatePercent ?? undefined,
      })),
  );
  const [selectedStudents, setSelectedStudents] = useState<Array<{ id: string; name: string }>>(() =>
    (classDetail.students ?? []).map((s) => ({ id: s.id, name: s.fullName?.trim() ?? "—" })),
  );
  const [teacherSearchInput, setTeacherSearchInput] = useState("");
  const [teacherSearchFocused, setTeacherSearchFocused] = useState(false);
  const teacherSearchRef = useRef<HTMLDivElement>(null);
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearchFocused, setStudentSearchFocused] = useState(false);
  const studentSearchRef = useRef<HTMLDivElement>(null);

  const [debouncedTeacherSearch] = useDebounce(teacherSearchInput.trim(), 350);
  const [debouncedStudentSearch] = useDebounce(studentSearchInput.trim(), 350);

  const { data: staffSearchResult } = useQuery({
    queryKey: ["staff", "list", { page: 1, limit: 50, search: debouncedTeacherSearch }],
    queryFn: () =>
      staffApi.getStaff({
        page: 1,
        limit: 50,
        search: debouncedTeacherSearch || undefined,
      }),
    enabled: true,
  });

  const { data: studentSearchResult } = useQuery({
    queryKey: ["student", "list", { page: 1, limit: 50, search: debouncedStudentSearch }],
    queryFn: () =>
      studentApi.getStudents({
        page: 1,
        limit: 50,
        search: debouncedStudentSearch || undefined,
      }),
    enabled: true,
  });

  const filteredStudents = (studentSearchResult ?? []).filter(
    (s) => !selectedStudents.some((st) => st.id === s.id),
  );
  const resolvedDefaultTeacherId =
    selectedTeachers.length === 1 ? selectedTeachers[0]?.id ?? "" : "";
  const teacherOptions = selectedTeachers.map((teacher) => ({
    value: teacher.id,
    label: teacher.name,
    selectedLabel: teacher.name,
  }));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (teacherSearchRef.current && !teacherSearchRef.current.contains(target)) {
        setTeacherSearchFocused(false);
      }
      if (studentSearchRef.current && !studentSearchRef.current.contains(target)) {
        setStudentSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      basicInfo?: UpdateClassBasicInfoPayload;
      teachers?: UpdateClassTeachersPayload;
      students?: UpdateClassStudentsPayload;
      schedule?: UpdateClassSchedulePayload;
    }) => {
      if (payload.basicInfo) {
        await classApi.updateClassBasicInfo(classDetail.id, payload.basicInfo);
      }

      if (payload.teachers) {
        await classApi.updateClassTeachers(classDetail.id, payload.teachers);
      }

      if (payload.students) {
        await classApi.updateClassStudents(classDetail.id, payload.students);
      }

      if (payload.schedule) {
        await classApi.updateClassSchedule(classDetail.id, payload.schedule);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
        queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể cập nhật lớp học.";
      toast.error(msg);
    },
  });

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Tên lớp là bắt buộc.");
      return;
    }

    const maxStudents = parseOptionalInt(maxStudentsInput);
    if (maxStudents !== undefined && maxStudents < 1) {
      toast.error("Sĩ số tối đa phải lớn hơn hoặc bằng 1.");
      return;
    }

    let schedulePayload: ClassScheduleItem[];
    try {
      schedulePayload = buildSchedulePayload(scheduleRanges);
    } catch (error) {
      toast.error((error as Error).message || "Không thể lưu lịch học.");
      return;
    }

    const tuitionPkg = parseTuitionPackageInputs(tuitionPackageTotalInput, tuitionPackageSessionInput);
    if (!tuitionPkg.ok) {
      toast.error(tuitionPkg.message);
      return;
    }
    const studentTuitionPerSession =
      tuitionPkg.mode === "empty"
        ? undefined
        : computeStudentTuitionPerSessionFromPackage(tuitionPkg.total, tuitionPkg.sessions);
    const allowancePerSessionPerStudent = parseOptionalInt(allowancePerSessionInput);
    const maxAllowancePerSession = parseMaxAllowancePerSessionInput(
      maxAllowancePerSessionInput.trim(),
      parseOptionalInt,
    );
    const scaleAmount = parseOptionalInt(scaleAmountInput);
    const teacherPayload: UpdateClassTeachersPayload["teachers"] = selectedTeachers.map((teacher) => ({
      teacher_id: teacher.id,
      ...(teacher.customAllowance != null
        ? { custom_allowance: teacher.customAllowance }
        : {}),
      operating_deduction_rate_percent: normalizeOperatingDeductionRatePercent(
        teacher.operatingDeductionRatePercent,
      ),
    }));
    const studentPayload: UpdateClassStudentsPayload["students"] = selectedStudents.map((student) => ({
      id: student.id,
    }));
    const currentBasicInfo = {
      name: classDetail.name ?? "",
      type: classDetail.type,
      status: classDetail.status,
      max_students: normalizeOptionalInteger(classDetail.maxStudents),
      allowance_per_session_per_student: normalizeOptionalInteger(
        classDetail.allowancePerSessionPerStudent,
      ),
      max_allowance_per_session: normalizeMaxAllowanceForCompare(
        classDetail.maxAllowancePerSession,
      ),
      scale_amount: normalizeOptionalInteger(classDetail.scaleAmount),
      student_tuition_per_session: normalizeOptionalInteger(classDetail.studentTuitionPerSession),
      tuition_package_total: normalizeOptionalInteger(classDetail.tuitionPackageTotal),
      tuition_package_session: normalizeOptionalInteger(classDetail.tuitionPackageSession),
    };
    const nextBasicInfo = {
      name: trimmedName,
      type,
      status,
      max_students: maxStudents,
      allowance_per_session_per_student: allowancePerSessionPerStudent,
      max_allowance_per_session: maxAllowancePerSession,
      scale_amount: scaleAmount,
      student_tuition_per_session: studentTuitionPerSession,
      tuition_package_total: tuitionPkg.mode === "empty" ? undefined : tuitionPkg.total,
      tuition_package_session: tuitionPkg.mode === "empty" ? undefined : tuitionPkg.sessions,
    };
    const basicInfoChanged =
      currentBasicInfo.name !== nextBasicInfo.name ||
      currentBasicInfo.type !== nextBasicInfo.type ||
      currentBasicInfo.status !== nextBasicInfo.status ||
      currentBasicInfo.max_students !== nextBasicInfo.max_students ||
      currentBasicInfo.allowance_per_session_per_student !==
        nextBasicInfo.allowance_per_session_per_student ||
      currentBasicInfo.max_allowance_per_session !==
        nextBasicInfo.max_allowance_per_session ||
      currentBasicInfo.scale_amount !== nextBasicInfo.scale_amount ||
      currentBasicInfo.student_tuition_per_session !==
        nextBasicInfo.student_tuition_per_session ||
      currentBasicInfo.tuition_package_total !== nextBasicInfo.tuition_package_total ||
      currentBasicInfo.tuition_package_session !== nextBasicInfo.tuition_package_session;
    const teachersChanged =
      JSON.stringify(
        normalizeTeacherAssignmentsForComparison(classDetail.teachers ?? []),
      ) !==
      JSON.stringify(
        normalizeTeacherAssignmentsForComparison(
          selectedTeachers.map((teacher) => ({
            id: teacher.id,
            customAllowance: teacher.customAllowance,
            operatingDeductionRatePercent: teacher.operatingDeductionRatePercent,
          })),
        ),
      );
    const studentsChanged =
      JSON.stringify(
        normalizeStudentIdsForComparison(classDetail.students ?? []),
      ) !== JSON.stringify(normalizeStudentIdsForComparison(selectedStudents));
    const scheduleChanged =
      JSON.stringify(normalizeScheduleForComparison(classDetail.schedule)) !==
      JSON.stringify(normalizeScheduleForComparison(schedulePayload));

    if (!basicInfoChanged && !teachersChanged && !studentsChanged && !scheduleChanged) {
      toast.success("Không có thay đổi cần lưu.");
      onClose();
      return;
    }

    try {
      await updateMutation.mutateAsync({
        ...(basicInfoChanged ? { basicInfo: nextBasicInfo } : {}),
        ...(teachersChanged ? { teachers: { teachers: teacherPayload } } : {}),
        ...(studentsChanged ? { students: { students: studentPayload } } : {}),
        ...(scheduleChanged ? { schedule: { schedule: schedulePayload } } : {}),
      });
      toast.success("Đã lưu.");
      onClose();
    } catch {
      // lỗi đã được xử lý trong onError
    }
  };

  const handleAddRange = () => {
    if (selectedTeachers.length === 0) {
      toast.error("Hãy chọn ít nhất 1 gia sư trước khi thêm khung giờ.");
      return;
    }

    setScheduleRanges((prev) => [
      ...prev,
      createScheduleRange(undefined, resolvedDefaultTeacherId),
    ]);
  };

  const handleRemoveRange = (id: string) => {
    setScheduleRanges((prev) => {
      if (prev.length === 1) {
        return [createScheduleRange(undefined, resolvedDefaultTeacherId)];
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleChangeRange = (id: string, field: keyof Pick<ScheduleRangeForm, "from" | "to">, value: string) => {
    const normalizedValue = normalizeTimeOnly(value);
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: normalizedValue } : item)),
    );
  };

  const handleDayChange = (id: string, dayOfWeek: number) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, dayOfWeek } : item)),
    );
  };

  const handleTeacherChange = (id: string, teacherId: string) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, teacherId } : item)),
    );
  };

  const tuitionBrief = compactTuitionPerSessionLine(tuitionPackageTotalInput, tuitionPackageSessionInput);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-class-title"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border-default bg-bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 id="edit-class-title" className="text-lg font-semibold text-text-primary">
            Sửa lớp
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto pr-1">
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Tên lớp</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Phân loại</span>
                <UpgradedSelect
                  name="edit-class-type"
                  value={type}
                  onValueChange={(nextValue) => setType(nextValue as ClassType)}
                  options={TYPE_OPTIONS}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trạng thái</span>
                <UpgradedSelect
                  name="edit-class-status"
                  value={status}
                  onValueChange={(nextValue) => setStatus(nextValue as ClassStatus)}
                  options={STATUS_OPTIONS}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Sĩ số tối đa</span>
                <input
                  type="number"
                  min={1}
                  value={maxStudentsInput}
                  onChange={(e) => setMaxStudentsInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trợ cấp / HV / buổi</span>
                <input
                  type="number"
                  min={0}
                  value={allowancePerSessionInput}
                  onChange={(e) => setAllowancePerSessionInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="VNĐ"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trợ cấp tối đa / buổi</span>
                <input
                  type="number"
                  min={0}
                  value={maxAllowancePerSessionInput}
                  onChange={(e) => setMaxAllowancePerSessionInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Để trống = không giới hạn"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Scales</span>
                <input
                  type="number"
                  min={0}
                  value={scaleAmountInput}
                  onChange={(e) => setScaleAmountInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <h3 className="mb-2 text-xs font-medium text-text-muted">Gia sư</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                {selectedTeachers.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-bg-surface p-2 sm:flex-nowrap"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                      {t.name}
                    </span>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
                      <span className="whitespace-nowrap text-xs text-text-muted">Riêng</span>
                      <input
                        type="number"
                        min={0}
                        value={t.customAllowance ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const num = v === "" ? undefined : Math.floor(Number(v)) || 0;
                          setSelectedTeachers((prev) =>
                            prev.map((x) =>
                              x.id === t.id ? { ...x, customAllowance: v === "" ? undefined : num } : x,
                            ),
                          );
                        }}
                        placeholder="VNĐ"
                        className="w-24 rounded border border-border-default bg-bg-primary px-2 py-1.5 text-right text-sm tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                      />
                    </label>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
                      <span className="whitespace-nowrap text-xs text-text-muted">Vận hành</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={t.operatingDeductionRatePercent ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (v === "") {
                            setSelectedTeachers((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? { ...x, operatingDeductionRatePercent: undefined }
                                  : x,
                              ),
                            );
                            return;
                          }
                          const num = Number(v);
                          if (!Number.isFinite(num) || num < 0 || num > 100) {
                            toast.error("Khấu trừ vận hành phải trong khoảng 0-100%.");
                            return;
                          }
                          setSelectedTeachers((prev) =>
                            prev.map((x) =>
                              x.id === t.id
                                ? {
                                    ...x,
                                    operatingDeductionRatePercent: Number(
                                      num.toFixed(2),
                                    ),
                                  }
                                : x,
                            ),
                          );
                        }}
                        placeholder="%"
                        className="w-20 rounded border border-border-default bg-bg-primary px-2 py-1.5 text-right text-sm tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                      />
                      <span className="text-xs text-text-muted">%</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextTeachers = selectedTeachers.filter((teacher) => teacher.id !== t.id);
                        setSelectedTeachers(nextTeachers);
                        setScheduleRanges((prev) =>
                          reconcileScheduleRangesWithTeachers(
                            prev,
                            nextTeachers.map((teacher) => teacher.id),
                          ),
                        );
                      }}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label={`Bỏ ${t.name}`}
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="relative" ref={teacherSearchRef}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={teacherSearchInput}
                      onChange={(e) => setTeacherSearchInput(e.target.value)}
                      onFocus={() => setTeacherSearchFocused(true)}
                      placeholder="Tìm gia sư…"
                      className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label="Tìm kiếm gia sư"
                      aria-autocomplete="list"
                    />
                    <span
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                      aria-hidden
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
                {teacherSearchFocused && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
                    {(staffSearchResult?.data ?? []).filter((s) => !selectedTeachers.some((t) => t.id === s.id))
                      .length === 0 ? (
                      <p className="px-3 py-2 text-sm text-text-muted">
                        {teacherSearchInput.trim() ? "Không có kết quả" : "Gõ tên…"}
                      </p>
                    ) : (
                      (staffSearchResult?.data ?? [])
                        .filter((s) => !selectedTeachers.some((t) => t.id === s.id))
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              const nextTeachers = [
                                ...selectedTeachers,
                                {
                                  id: s.id,
                                  name: s.fullName?.trim() ?? s.id,
                                  customAllowance: undefined,
                                  operatingDeductionRatePercent: undefined,
                                },
                              ];
                              setSelectedTeachers(nextTeachers);
                              setScheduleRanges((prev) =>
                                reconcileScheduleRangesWithTeachers(
                                  prev,
                                  nextTeachers.map((teacher) => teacher.id),
                                ),
                              );
                              setTeacherSearchInput("");
                              setTeacherSearchFocused(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          >
                            {s.fullName?.trim() || s.id}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <h3 className="mb-2 text-xs font-medium text-text-muted">Học sinh</h3>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {selectedStudents.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary"
                  >
                    {s.name}
                    <button
                      type="button"
                      onClick={() => setSelectedStudents((prev) => prev.filter((x) => x.id !== s.id))}
                      className="rounded-full p-0.5 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label={`Bỏ ${s.name}`}
                    >
                      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative" ref={studentSearchRef}>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={studentSearchInput}
                    onChange={(e) => setStudentSearchInput(e.target.value)}
                    onFocus={() => setStudentSearchFocused(true)}
                    placeholder="Tìm học sinh…"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Tìm kiếm học sinh"
                    aria-autocomplete="list"
                  />
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                </div>
                {studentSearchFocused && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
                    {filteredStudents.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-text-muted">
                        {studentSearchInput.trim() ? "Không có kết quả" : "Gõ tên…"}
                      </p>
                    ) : (
                      filteredStudents.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudents((prev) => [
                              ...prev,
                              { id: s.id, name: (s.fullName?.trim() ?? "") || s.id },
                            ]);
                            setStudentSearchInput("");
                            setStudentSearchFocused(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        >
                          {(s.fullName?.trim() ?? "") || s.id}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <h3 className="mb-2 text-xs font-medium text-text-muted">Học phí</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tổng gói</span>
                <input
                  type="number"
                  min={0}
                  value={tuitionPackageTotalInput}
                  onChange={(e) => setTuitionPackageTotalInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="VNĐ"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số buổi</span>
                <input
                  type="number"
                  min={0}
                  value={tuitionPackageSessionInput}
                  onChange={(e) => setTuitionPackageSessionInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Số buổi"
                />
              </label>
              {tuitionBrief ? (
                <p className="text-xs tabular-nums text-text-muted md:col-span-2">{tuitionBrief}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-xs font-medium text-text-muted">Lịch</h3>
                <p className="text-xs text-text-muted">
                  Mỗi khung giờ phải gán đúng 1 gia sư chịu trách nhiệm.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRange}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                + Thêm
              </button>
            </div>

            <div className="space-y-3">
              {scheduleRanges.map((range, index) => (
                <div
                  key={range.id}
                  className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm transition-colors duration-200 hover:bg-bg-secondary/80"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">{index + 1}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveRange(range.id)}
                      className="rounded-md border border-border-default px-3 py-1.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Xóa
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_1fr] sm:items-end">
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span className="text-text-muted">Ngày</span>
                      <UpgradedSelect
                        name={`edit-class-schedule-day-${range.id}`}
                        value={String(range.dayOfWeek)}
                        onValueChange={(value) =>
                          handleDayChange(range.id, normalizeDayOfWeek(value))
                        }
                        options={CLASS_SCHEDULE_DAY_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                          selectedLabel: option.selectedLabel,
                        }))}
                        buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span className="text-text-muted">Bắt đầu</span>
                      <TimeInput
                        name={`edit-class-schedule-from-${range.id}`}
                        value={range.from}
                        autoComplete="off"
                        onChange={(e) => handleChangeRange(range.id, "from", e.target.value)}
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>

                    <div className="flex items-center justify-center pb-2 text-text-muted" aria-hidden>
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-4-4 4 4-4 4" />
                      </svg>
                    </div>

                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span className="text-text-muted">Kết thúc</span>
                      <TimeInput
                        name={`edit-class-schedule-to-${range.id}`}
                        value={range.to}
                        autoComplete="off"
                        onChange={(e) => handleChangeRange(range.id, "to", e.target.value)}
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-4">
                      <span className="text-text-muted">Gia sư chịu trách nhiệm</span>
                      <UpgradedSelect
                        name={`edit-class-schedule-teacher-${range.id}`}
                        value={range.teacherId}
                        onValueChange={(value) => handleTeacherChange(range.id, value)}
                        options={teacherOptions}
                        placeholder="Chọn gia sư phụ trách"
                        emptyStateLabel="Lớp chưa có gia sư để gán."
                        buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              {updateMutation.isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
