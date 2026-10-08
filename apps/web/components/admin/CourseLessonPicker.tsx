"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, Dumbbell, Layers, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getClassModules, getCourseLessonsForClass } from "@/lib/apis/class.api";
import type {
  ClassModuleDto,
  CourseLessonForClassDto,
} from "@/dtos/course-content.dto";
import { classKeys } from "@/lib/query-keys";

interface CourseLessonPickerProps {
  classId: string;
  selectedLessonId: string;
  /** `""` khi đổi chuyên đề (bỏ chọn tiết cũ). */
  onSelect: (lessonId: string) => void;
}

/**
 * Chọn tiết thực hành để giao theo hai bước: chuyên đề lớp đã thêm → tiết thực hành
 * của chuyên đề đó. API chỉ trả tiết thuộc chuyên đề lớp đã thêm.
 */
export default function CourseLessonPicker({
  classId,
  selectedLessonId,
  onSelect,
}: CourseLessonPickerProps) {
  const [moduleId, setModuleId] = useState<string | null>(null);

  const modulesQuery = useQuery<ClassModuleDto[]>({
    queryKey: classKeys.modules(classId),
    queryFn: () => getClassModules(classId),
  });
  const lessonsQuery = useQuery<CourseLessonForClassDto[]>({
    queryKey: classKeys.courseLessons(classId),
    queryFn: () => getCourseLessonsForClass(classId),
  });

  const addedModules = useMemo(
    () => (modulesQuery.data ?? []).filter((module) => module.added),
    [modulesQuery.data],
  );
  const lessonsByModule = useMemo(() => {
    const map = new Map<string, CourseLessonForClassDto[]>();
    for (const lesson of lessonsQuery.data ?? []) {
      const arr = map.get(lesson.moduleId) ?? [];
      arr.push(lesson);
      map.set(lesson.moduleId, arr);
    }
    return map;
  }, [lessonsQuery.data]);

  // Quay lại từ bước "Đặt lần giao" (picker mount lại): suy chuyên đề từ tiết đang chọn.
  const activeModuleId =
    moduleId ??
    lessonsQuery.data?.find((lesson) => lesson.id === selectedLessonId)
      ?.moduleId ??
    null;
  const selectedModule = addedModules.find(
    (module) => module.moduleId === activeModuleId,
  );

  if (modulesQuery.isLoading || lessonsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (modulesQuery.isError || lessonsQuery.isError) {
    return (
      <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
        Không tải được danh sách tiết thực hành.
      </p>
    );
  }

  if (addedModules.length === 0) {
    return (
      <EmptyState>
        Lớp chưa thêm chuyên đề nào. Thêm chuyên đề (nút <b>Chuyên đề</b> trên
        timeline lớp) trước khi giao tiết thực hành.
      </EmptyState>
    );
  }

  if (!selectedModule) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Chọn chuyên đề
        </p>
        {addedModules.map((module) => (
          <ModuleRow
            key={module.moduleId}
            module={module}
            lessons={lessonsByModule.get(module.moduleId) ?? []}
            onOpen={() => {
              setModuleId(module.moduleId);
              onSelect("");
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <ModuleLessonList
      module={selectedModule}
      lessons={lessonsByModule.get(selectedModule.moduleId) ?? []}
      selectedLessonId={selectedLessonId}
      onBack={() => {
        setModuleId(null);
        onSelect("");
      }}
      onSelect={onSelect}
    />
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/20 p-6 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}

function ModuleRow({
  module,
  lessons,
  onOpen,
}: {
  module: ClassModuleDto;
  lessons: CourseLessonForClassDto[];
  onOpen: () => void;
}) {
  const assignable = lessons.filter((lesson) => !lesson.alreadyAdded).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-border-default bg-bg-surface p-3 text-left transition-colors hover:border-border-focus/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <Layers className="size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-primary">
          {module.title}
        </div>
        <div className="text-xs text-text-muted">
          {lessons.length === 0
            ? "Chưa có tiết thực hành"
            : `${lessons.length} tiết thực hành · ${assignable} chưa giao`}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

function ModuleLessonList({
  module,
  lessons,
  selectedLessonId,
  onBack,
  onSelect,
}: {
  module: ClassModuleDto;
  lessons: CourseLessonForClassDto[];
  selectedLessonId: string;
  onBack: () => void;
  onSelect: (lessonId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((lesson) => lesson.title.toLowerCase().includes(q));
  }, [lessons, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-9"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Chuyên đề
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {module.title}
        </span>
      </div>

      {lessons.length === 0 ? (
        <EmptyState>
          Chuyên đề này chưa có tiết thực hành. Hãy tạo tiết thực hành trong quản
          trị khoá học trước.
        </EmptyState>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm tiết thực hành"
              placeholder="Tìm tiết thực hành..."
              className="w-full rounded-xl border border-border-default bg-bg-surface py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </div>
          <div
            role="group"
            aria-label={`Tiết thực hành của ${module.title}`}
            className="max-h-[50vh] space-y-1.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          >
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-muted">
                Không tìm thấy tiết thực hành phù hợp.
              </div>
            ) : (
              filtered.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  isSelected={lesson.id === selectedLessonId}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  isSelected,
  onSelect,
}: {
  lesson: CourseLessonForClassDto;
  isSelected: boolean;
  onSelect: (lessonId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !lesson.alreadyAdded && onSelect(lesson.id)}
      disabled={lesson.alreadyAdded}
      aria-pressed={isSelected}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        lesson.alreadyAdded
          ? "cursor-not-allowed border-border-default bg-bg-secondary/30 opacity-60"
          : isSelected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border-default hover:border-border-focus/50",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
        <Dumbbell className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {lesson.title}
        </div>
        <div className="text-xs text-text-muted">Tiết thực hành</div>
      </div>
      {lesson.alreadyAdded ? (
        <span className="shrink-0 text-xs font-medium text-text-muted">
          Đã giao
        </span>
      ) : (
        isSelected && <Check className="size-4 shrink-0 text-primary" />
      )}
    </button>
  );
}
