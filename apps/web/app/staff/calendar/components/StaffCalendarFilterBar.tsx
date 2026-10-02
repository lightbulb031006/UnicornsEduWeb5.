"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import * as staffCalendarApi from "@/lib/apis/staff-calendar.api";
import { cn } from "@/lib/utils";
import { CalendarWeekVariant } from "@/dtos/class-schedule.dto";

interface StaffCalendarFilterBarProps {
  filters: {
    classIds: string[];
  };
  viewMode: "calendar" | "schedule";
  weekVariant: CalendarWeekVariant;
  weekLabel: string;
  onViewModeChange: (mode: "calendar" | "schedule") => void;
  onWeekVariantChange: (weekVariant: CalendarWeekVariant) => void;
  onFiltersChange: (filters: { classIds: string[] }) => void;
}

type ClassFilterOption = {
  id: string;
  name: string;
};

const CLASS_QUERY_LIMIT = 12;

export default function StaffCalendarFilterBar({
  filters,
  viewMode,
  weekVariant,
  weekLabel,
  onViewModeChange,
  onWeekVariantChange,
  onFiltersChange,
}: StaffCalendarFilterBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedClassSnapshot, setSelectedClassSnapshot] =
    useState<ClassFilterOption | null>(null);
  const [debouncedSearch] = useDebounce(searchInput.trim(), 250);

  const { data: classListResponse, isLoading: isLoadingClasses, isFetching } = useQuery({
    queryKey: ["staffCalendar", "classes", "filter", debouncedSearch],
    queryFn: () =>
      staffCalendarApi.getStaffClassesForFilter({
        limit: CLASS_QUERY_LIMIT,
        search: debouncedSearch || undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const classOptions = useMemo<ClassFilterOption[]>(() => {
    return (classListResponse?.data ?? []).map((cls) => ({
      id: cls.id,
      name: cls.name,
    }));
  }, [classListResponse]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsSearchFocused(false);
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

  const handleClassToggle = useCallback((nextClass: ClassFilterOption) => {
    setSearchInput("");
    setSelectedClassSnapshot(nextClass);
    const nextIds = filters.classIds.includes(nextClass.id)
      ? filters.classIds.filter((id) => id !== nextClass.id)
      : [...filters.classIds, nextClass.id];
    onFiltersChange({ classIds: nextIds });
  }, [filters.classIds, onFiltersChange]);

  const handleClearFilters = useCallback(() => {
    onFiltersChange({ classIds: [] });
  }, [onFiltersChange]);

  const handleRemoveSelectedClass = useCallback(
    (classId: string) => {
      onFiltersChange({
        classIds: filters.classIds.filter((id) => id !== classId),
      });
    },
    [filters.classIds, onFiltersChange],
  );

  const listboxId = "staff-calendar-class-filter-options";
  const hasSearchText = searchInput.trim().length > 0;
  const shouldShowDropdown = isSearchFocused;

  return (
    <section
      className="relative overflow-visible rounded-xl border border-border-default bg-bg-secondary/35 p-3 sm:p-4"
      title="Chọn một hoặc nhiều lớp để lọc lịch. Calendar = lưới giờ, Schedule = danh sách theo ngày có lịch."
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

      <div className="relative mt-3 grid grid-cols-1 gap-2 sm:gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-end">
        <div>
          <label htmlFor="staff-class-filter-search" className="block text-xs font-medium text-text-secondary">
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
                      onClick={() => handleRemoveSelectedClass(selectedClass.id)}
                      className="rounded-full p-0.5 text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label={`Bỏ lọc lớp ${selectedClass.name}`}
                    >
                      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="relative" ref={containerRef}>
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
                  id="staff-class-filter-search"
                  name="staff_class_filter_search"
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
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
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
                    <p className="px-3 py-2 text-sm text-text-muted" aria-live="polite">
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
                            <span className="shrink-0 text-xs font-semibold">Đang lọc</span>
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
          <p className="mb-0.5 text-xs font-medium text-text-secondary">Hiển thị</p>
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

        {filters.classIds.length > 0 && (
          <div className="xl:pb-0.5">
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-2.5 py-2 text-xs font-medium text-text-secondary transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 xl:w-auto xl:min-w-[9rem]"
              aria-label="Xóa bộ lọc"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
