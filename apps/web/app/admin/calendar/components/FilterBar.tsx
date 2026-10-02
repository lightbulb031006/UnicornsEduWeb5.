"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import * as classScheduleApi from "@/lib/apis/class-schedule.api";
import { cn } from "@/lib/utils";
import { CalendarWeekVariant } from "@/dtos/class-schedule.dto";

export type AdminCalendarFilterState = {
  classIds: string[];
  teacherId?: string;
  studentId?: string;
};

interface FilterBarProps {
  filters: AdminCalendarFilterState;
  viewMode: "calendar" | "schedule";
  weekVariant: CalendarWeekVariant;
  weekLabel: string;
  onViewModeChange: (mode: "calendar" | "schedule") => void;
  onWeekVariantChange: (weekVariant: CalendarWeekVariant) => void;
  onFiltersChange: (filters: AdminCalendarFilterState) => void;
}

type ClassFilterOption = {
  id: string;
  name: string;
};

type StudentFilterOption = {
  id: string;
  name: string;
};

type TeacherFilterOption = {
  id: string;
  name: string;
};

const CLASS_QUERY_LIMIT = 12;

/**
 * FilterBar component for admin calendar page
 * Provides class (multi-select) and tutor filtering for the current week view
 */
export default function FilterBar({
  filters,
  viewMode,
  weekVariant,
  weekLabel,
  onViewModeChange,
  onWeekVariantChange,
  onFiltersChange,
}: FilterBarProps) {
  const classContainerRef = useRef<HTMLDivElement>(null);
  const studentContainerRef = useRef<HTMLDivElement>(null);
  const teacherContainerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [teacherSearchInput, setTeacherSearchInput] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isStudentSearchFocused, setIsStudentSearchFocused] = useState(false);
  const [isTeacherSearchFocused, setIsTeacherSearchFocused] = useState(false);
  const [selectedClassSnapshot, setSelectedClassSnapshot] =
    useState<ClassFilterOption | null>(null);
  const [selectedStudentSnapshot, setSelectedStudentSnapshot] =
    useState<StudentFilterOption | null>(null);
  const [selectedTeacherSnapshot, setSelectedTeacherSnapshot] =
    useState<TeacherFilterOption | null>(null);
  const [debouncedSearch] = useDebounce(searchInput.trim(), 250);
  const [debouncedStudentSearch] = useDebounce(studentSearchInput.trim(), 250);
  const [debouncedTeacherSearch] = useDebounce(teacherSearchInput.trim(), 250);

  const {
    data: classListResponse,
    isLoading: isLoadingClasses,
    isFetching,
  } = useQuery({
    queryKey: ["calendar", "classes", "filter", debouncedSearch],
    queryFn: () =>
      classScheduleApi.getClassesForFilter({
        limit: CLASS_QUERY_LIMIT,
        search: debouncedSearch || undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: teacherListResponse,
    isLoading: isLoadingTeachers,
    isFetching: isFetchingTeachers,
  } = useQuery({
    queryKey: ["calendar", "teachers", "filter", debouncedTeacherSearch],
    queryFn: () =>
      classScheduleApi.getTeachersForFilter({
        limit: 12,
        search: debouncedTeacherSearch || undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: studentListResponse,
    isLoading: isLoadingStudents,
    isFetching: isFetchingStudents,
  } = useQuery({
    queryKey: ["calendar", "students", "filter", debouncedStudentSearch],
    queryFn: async () =>
      classScheduleApi.getStudentsForCalendarFilter({
        limit: 12,
        search: debouncedStudentSearch || undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const classOptions = useMemo<ClassFilterOption[]>(() => {
    return (classListResponse?.data ?? []).map((cls) => ({
      id: cls.id,
      name: cls.name,
    }));
  }, [classListResponse]);
  const teacherOptions = useMemo<TeacherFilterOption[]>(
    () =>
      (teacherListResponse?.data ?? []).map((teacher) => ({
        id: teacher.id,
        name: teacher.fullName || "—",
      })),
    [teacherListResponse],
  );
  const studentOptions = useMemo<StudentFilterOption[]>(
    () =>
      (studentListResponse?.data ?? []).map((student) => ({
        id: student.id,
        name: student.fullName || "—",
      })),
    [studentListResponse],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!classContainerRef.current?.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (!studentContainerRef.current?.contains(event.target as Node)) {
        setIsStudentSearchFocused(false);
      }
      if (!teacherContainerRef.current?.contains(event.target as Node)) {
        setIsTeacherSearchFocused(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectedClassMap = useMemo(() => {
    const map = new Map<string, ClassFilterOption>();
    for (const option of classOptions) {
      map.set(option.id, option);
    }
    if (selectedClassSnapshot) {
      map.set(selectedClassSnapshot.id, selectedClassSnapshot);
    }
    return map;
  }, [classOptions, selectedClassSnapshot]);

  const selectedClasses = useMemo(
    () =>
      filters.classIds
        .map((classId) => selectedClassMap.get(classId))
        .filter((option): option is ClassFilterOption => Boolean(option)),
    [filters.classIds, selectedClassMap],
  );
  // Set: danh sách lớp có thể rất dài, tra cứu O(1) thay vì quét mảng mỗi option.
  const selectedClassIdSet = useMemo(
    () => new Set(filters.classIds),
    [filters.classIds],
  );
  const selectedStudentMap = useMemo(() => {
    const map = new Map<string, StudentFilterOption>();
    for (const option of studentOptions) {
      map.set(option.id, option);
    }
    if (selectedStudentSnapshot) {
      map.set(selectedStudentSnapshot.id, selectedStudentSnapshot);
    }
    return map;
  }, [studentOptions, selectedStudentSnapshot]);
  const selectedStudent = filters.studentId
    ? (selectedStudentMap.get(filters.studentId) ?? null)
    : null;
  const selectedTeacherMap = useMemo(() => {
    const map = new Map<string, TeacherFilterOption>();
    for (const option of teacherOptions) {
      map.set(option.id, option);
    }
    if (selectedTeacherSnapshot) {
      map.set(selectedTeacherSnapshot.id, selectedTeacherSnapshot);
    }
    return map;
  }, [teacherOptions, selectedTeacherSnapshot]);
  const selectedTeacher = filters.teacherId
    ? (selectedTeacherMap.get(filters.teacherId) ?? null)
    : null;

  const handleClassToggle = useCallback(
    (nextClass: ClassFilterOption) => {
      setSearchInput("");
      setSelectedClassSnapshot(nextClass);
      const nextIds = filters.classIds.includes(nextClass.id)
        ? filters.classIds.filter((id) => id !== nextClass.id)
        : [...filters.classIds, nextClass.id];
      onFiltersChange({
        ...filters,
        classIds: nextIds,
      });
    },
    [filters, onFiltersChange],
  );

  const handleRemoveSelectedClass = useCallback(
    (classId: string) => {
      onFiltersChange({
        ...filters,
        classIds: filters.classIds.filter((id) => id !== classId),
      });
    },
    [filters, onFiltersChange],
  );

  const handleClearFilters = useCallback(() => {
    setSearchInput("");
    setStudentSearchInput("");
    setTeacherSearchInput("");
    setSelectedClassSnapshot(null);
    setSelectedStudentSnapshot(null);
    setSelectedTeacherSnapshot(null);
    onFiltersChange({
      classIds: [],
      teacherId: undefined,
      studentId: undefined,
    });
  }, [onFiltersChange]);

  const handleTeacherSelect = useCallback(
    (teacher: TeacherFilterOption) => {
      setSelectedTeacherSnapshot(teacher);
      setTeacherSearchInput(teacher.name);
      setIsTeacherSearchFocused(false);
      onFiltersChange({
        ...filters,
        teacherId: teacher.id,
      });
    },
    [filters, onFiltersChange],
  );
  const handleClearTeacher = useCallback(() => {
    setTeacherSearchInput("");
    setSelectedTeacherSnapshot(null);
    setIsTeacherSearchFocused(false);
    onFiltersChange({
      ...filters,
      teacherId: undefined,
    });
  }, [filters, onFiltersChange]);
  const handleStudentSelect = useCallback(
    (student: StudentFilterOption) => {
      setSelectedStudentSnapshot(student);
      setStudentSearchInput(student.name);
      setIsStudentSearchFocused(false);
      onFiltersChange({
        ...filters,
        studentId: student.id,
      });
    },
    [filters, onFiltersChange],
  );
  const handleClearStudent = useCallback(() => {
    setStudentSearchInput("");
    setSelectedStudentSnapshot(null);
    onFiltersChange({
      ...filters,
      studentId: undefined,
    });
  }, [filters, onFiltersChange]);

  const listboxId = "admin-calendar-class-filter-options";
  const studentListboxId = "admin-calendar-student-filter-options";
  const teacherListboxId = "admin-calendar-teacher-filter-options";
  const hasSearchText = searchInput.trim().length > 0;
  const hasStudentSearchText = studentSearchInput.trim().length > 0;
  const hasTeacherSearchText = teacherSearchInput.trim().length > 0;
  const shouldShowDropdown = isSearchFocused;
  const shouldShowStudentDropdown = isStudentSearchFocused;
  const shouldShowTeacherDropdown = isTeacherSearchFocused;
  const hasAnyFilter =
    filters.classIds.length > 0 ||
    Boolean(filters.teacherId) ||
    Boolean(filters.studentId);

  return (
    <section
      className="relative overflow-visible rounded-xl border border-border-default bg-bg-secondary/35 p-3 sm:p-4"
      title="Chọn lớp (nhiều lớp được), lọc gia sư; Calendar = lưới giờ, Schedule = danh sách theo ngày có lịch."
    >
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Bộ lọc</h2>
          <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary">
            <svg
              className="size-3.5 shrink-0 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="truncate">{weekLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border-default bg-bg-surface p-0.5">
            <button
              type="button"
              onClick={() => onWeekVariantChange("current")}
              className={cn(
                "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                weekVariant === "current"
                  ? "bg-primary text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
              )}
            >
              Tuần này
            </button>
            <button
              type="button"
              onClick={() => onWeekVariantChange("next")}
              className={cn(
                "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                weekVariant === "next"
                  ? "bg-primary text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
              )}
            >
              Tuần sau
            </button>
          </div>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-1 gap-2 sm:gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,18rem)_auto_auto] xl:items-end">
        <div>
          <label
            htmlFor="class-filter-search"
            className="block text-xs font-medium text-text-secondary"
          >
            Lớp học
          </label>
          <div className="mt-1 space-y-1.5">
            {selectedClasses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedClasses.map((selectedClass) => (
                  <div
                    key={selectedClass.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                  >
                    <span className="truncate">{selectedClass.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleRemoveSelectedClass(selectedClass.id)
                      }
                      className="rounded-full p-0.5 text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label={`Bỏ lọc lớp ${selectedClass.name}`}
                    >
                      <svg
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="relative" ref={classContainerRef}>
              <div
                className={cn(
                  "flex min-h-10 items-center rounded-lg border bg-bg-surface px-2.5 shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
                  isSearchFocused
                    ? "border-border-focus ring-2 ring-border-focus/30"
                    : "border-border-default",
                )}
              >
                <svg
                  className="size-4 shrink-0 text-text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  />
                </svg>
                <input
                  id="class-filter-search"
                  name="class_filter_search"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  aria-haspopup="listbox"
                  aria-controls={shouldShowDropdown ? listboxId : undefined}
                  aria-autocomplete="list"
                  placeholder={
                    selectedClasses.length > 0
                      ? `Thêm hoặc bỏ lớp theo tên…`
                      : isLoadingClasses
                        ? "Đang tải danh sách lớp…"
                        : "Tìm lớp theo tên…"
                  }
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                {hasSearchText ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Xóa từ khóa tìm lớp"
                  >
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>

              {shouldShowDropdown ? (
                <div
                  id={listboxId}
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border-default bg-bg-surface py-1 shadow-[0_18px_40px_color-mix(in_srgb,var(--ue-text-primary)_14%,transparent)]"
                >
                  {isFetching ? (
                    <p
                      className="px-3 py-2 text-sm text-text-muted"
                      aria-live="polite"
                    >
                      Đang tìm lớp…
                    </p>
                  ) : classOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-muted">
                      {hasSearchText
                        ? "Không tìm thấy lớp phù hợp."
                        : "Chưa có lớp nào để lọc."}
                    </p>
                  ) : (
                    classOptions.map((option) => {
                      const isSelected = selectedClassIdSet.has(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleClassToggle(option)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus/40",
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "text-text-primary hover:bg-bg-tertiary focus:bg-bg-tertiary",
                          )}
                        >
                          <span className="truncate">{option.name}</span>
                          {isSelected ? (
                            <span className="shrink-0 text-xs font-semibold">
                              Đang lọc
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="student-filter-search"
            className="block text-xs font-medium text-text-secondary"
          >
            Học sinh
          </label>
          <div className="mt-1">
            {selectedStudent ? (
              <div className="mb-1.5 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                <span className="truncate">{selectedStudent.name}</span>
                <button
                  type="button"
                  onClick={handleClearStudent}
                  className="rounded-full p-0.5 text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label={`Bỏ lọc học sinh ${selectedStudent.name}`}
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ) : null}

            <div className="relative" ref={studentContainerRef}>
              <div
                className={cn(
                  "flex min-h-10 items-center rounded-lg border bg-bg-surface px-2.5 shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
                  isStudentSearchFocused
                    ? "border-border-focus ring-2 ring-border-focus/30"
                    : "border-border-default",
                )}
              >
                <svg
                  className="size-4 shrink-0 text-text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  />
                </svg>
                <input
                  id="student-filter-search"
                  name="student_filter_search"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={studentSearchInput}
                  onChange={(event) => {
                    setStudentSearchInput(event.target.value);
                    if (
                      selectedStudent &&
                      event.target.value !== selectedStudent.name
                    ) {
                      onFiltersChange({
                        ...filters,
                        studentId: undefined,
                      });
                    }
                  }}
                  onFocus={() => setIsStudentSearchFocused(true)}
                  aria-haspopup="listbox"
                  aria-controls={
                    shouldShowStudentDropdown ? studentListboxId : undefined
                  }
                  aria-autocomplete="list"
                  placeholder={
                    selectedStudent
                      ? "Đổi học sinh…"
                      : isLoadingStudents
                        ? "Đang tải danh sách học sinh…"
                        : "Tìm học sinh theo tên…"
                  }
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                {hasStudentSearchText ? (
                  <button
                    type="button"
                    onClick={handleClearStudent}
                    className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Xóa từ khóa tìm học sinh"
                  >
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>

              {shouldShowStudentDropdown ? (
                <div
                  id={studentListboxId}
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border-default bg-bg-surface py-1 shadow-[0_18px_40px_color-mix(in_srgb,var(--ue-text-primary)_14%,transparent)]"
                >
                  {isFetchingStudents ? (
                    <p
                      className="px-3 py-2 text-sm text-text-muted"
                      aria-live="polite"
                    >
                      Đang tìm học sinh…
                    </p>
                  ) : studentOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-muted">
                      {hasStudentSearchText
                        ? "Không tìm thấy học sinh phù hợp."
                        : "Chưa có học sinh nào để lọc."}
                    </p>
                  ) : (
                    studentOptions.map((option) => {
                      const isSelected = filters.studentId === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleStudentSelect(option)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus/40",
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "text-text-primary hover:bg-bg-tertiary focus:bg-bg-tertiary",
                          )}
                        >
                          <span className="truncate">{option.name}</span>
                          {isSelected ? (
                            <span className="shrink-0 text-xs font-semibold">
                              Đang lọc
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="teacher-filter-search"
            className="block text-xs font-medium text-text-secondary"
          >
            Gia sư
          </label>
          <div className="mt-1">
            {selectedTeacher ? (
              <div className="mb-1.5 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                <span className="truncate">{selectedTeacher.name}</span>
                <button
                  type="button"
                  onClick={handleClearTeacher}
                  className="rounded-full p-0.5 text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label={`Bỏ lọc gia sư ${selectedTeacher.name}`}
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ) : null}

            <div className="relative" ref={teacherContainerRef}>
              <div
                className={cn(
                  "flex min-h-10 items-center rounded-lg border bg-bg-surface px-2.5 shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
                  isTeacherSearchFocused
                    ? "border-border-focus ring-2 ring-border-focus/30"
                    : "border-border-default",
                )}
              >
                <svg
                  className="size-4 shrink-0 text-text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  />
                </svg>
                <input
                  id="teacher-filter-search"
                  name="teacher_filter_search"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={teacherSearchInput}
                  onChange={(event) => {
                    setTeacherSearchInput(event.target.value);
                    if (
                      selectedTeacher &&
                      event.target.value !== selectedTeacher.name
                    ) {
                      onFiltersChange({
                        ...filters,
                        teacherId: undefined,
                      });
                    }
                  }}
                  onFocus={() => setIsTeacherSearchFocused(true)}
                  aria-haspopup="listbox"
                  aria-controls={
                    shouldShowTeacherDropdown ? teacherListboxId : undefined
                  }
                  aria-autocomplete="list"
                  placeholder={
                    selectedTeacher
                      ? "Đổi gia sư…"
                      : isLoadingTeachers
                        ? "Đang tải danh sách gia sư…"
                        : "Tìm gia sư theo tên…"
                  }
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                {hasTeacherSearchText ? (
                  <button
                    type="button"
                    onClick={handleClearTeacher}
                    className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Xóa từ khóa tìm gia sư"
                  >
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>

              {shouldShowTeacherDropdown ? (
                <div
                  id={teacherListboxId}
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border-default bg-bg-surface py-1 shadow-[0_18px_40px_color-mix(in_srgb,var(--ue-text-primary)_14%,transparent)]"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!filters.teacherId}
                    onClick={handleClearTeacher}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus/40",
                      !filters.teacherId
                        ? "bg-primary/10 text-primary"
                        : "text-text-primary hover:bg-bg-tertiary focus:bg-bg-tertiary",
                    )}
                  >
                    <span className="truncate">Tất cả gia sư</span>
                    {!filters.teacherId ? (
                      <span className="shrink-0 text-xs font-semibold">
                        Đang lọc
                      </span>
                    ) : null}
                  </button>

                  {isFetchingTeachers ? (
                    <p
                      className="px-3 py-2 text-sm text-text-muted"
                      aria-live="polite"
                    >
                      Đang tìm gia sư…
                    </p>
                  ) : teacherOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-muted">
                      {hasTeacherSearchText
                        ? "Không tìm thấy gia sư phù hợp."
                        : "Chưa có gia sư nào để lọc."}
                    </p>
                  ) : (
                    teacherOptions.map((option) => {
                      const isSelected = filters.teacherId === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleTeacherSelect(option)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus/40",
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "text-text-primary hover:bg-bg-tertiary focus:bg-bg-tertiary",
                          )}
                        >
                          <span className="truncate">{option.name}</span>
                          {isSelected ? (
                            <span className="shrink-0 text-xs font-semibold">
                              Đang lọc
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="xl:pb-0.5">
          <p className="mb-0.5 text-xs font-medium text-text-secondary">
            Hiển thị
          </p>
          <div className="inline-flex w-full rounded-lg border border-border-default bg-bg-surface p-0.5 xl:w-auto">
            <button
              type="button"
              onClick={() => onViewModeChange("calendar")}
              className={cn(
                "inline-flex flex-1 items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors xl:min-w-[7rem]",
                viewMode === "calendar"
                  ? "bg-primary text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
              )}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("schedule")}
              className={cn(
                "inline-flex flex-1 items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors xl:min-w-[7rem]",
                viewMode === "schedule"
                  ? "bg-primary text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
              )}
            >
              Schedule
            </button>
          </div>
        </div>

        {hasAnyFilter && (
          <div className="xl:pb-0.5">
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-2.5 py-2 text-xs font-medium text-text-secondary transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 xl:w-auto xl:min-w-[9rem]"
              aria-label="Xóa bộ lọc"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
