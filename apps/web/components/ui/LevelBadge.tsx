import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AcademicCapIcon,
  StarIcon,
  SparklesIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { getUniojReport } from "@/lib/apis/unioj.api";
import { uniojKeys } from "@/lib/query-keys";
import { useAppConfig } from "@/lib/hooks/useAppConfig";

export function LevelBadge({ level }: { level?: string | null }) {
  if (
    !level ||
    level === "Chưa cập nhật" ||
    level === "Cấp 0" ||
    level === "Chưa phân cấp"
  ) {
    return <span className="text-xs text-text-muted italic">Chưa cập nhật</span>;
  }

  // Trích xuất số cấp độ
  const match = level.match(/Cấp\s*(\d+)/i);
  const num = match ? parseInt(match[1], 10) : 0;

  if (num === 0) {
    return <span className="text-xs text-text-muted italic">Chưa cập nhật</span>;
  }

  let variant: "success" | "info" | "warning" | "destructive" = "success";
  let Icon = AcademicCapIcon;

  if (num <= 2) {
    variant = "success"; // Cấp 1, Cấp 2
    Icon = AcademicCapIcon;
  } else if (num <= 4) {
    variant = "info"; // Cấp 3, Cấp 4
    Icon = StarIcon;
  } else if (num <= 6) {
    variant = "warning"; // Cấp 5, Cấp 6
    Icon = SparklesIcon;
  } else {
    variant = "destructive"; // Cấp 7 trở lên
    Icon = TrophyIcon;
  }

  return (
    <Badge
      variant={variant}
      className={cn("gap-1 py-0.5 px-2 font-medium shrink-0")}
    >
      <Icon className="size-3" aria-hidden />
      <span>{level}</span>
    </Badge>
  );
}

export function StudentLevelBadge({ fullName }: { fullName: string }) {
  // Level học sinh lấy từ UNIOJ — chỉ instance IT có.
  const { data: appConfig } = useAppConfig();
  const isItProfile = appConfig?.profile === "it";

  const { data, isLoading } = useQuery({
    queryKey: uniojKeys.report(fullName),
    queryFn: () => getUniojReport(fullName),
    enabled: isItProfile && !!fullName,
    staleTime: 60_000,
    retry: false,
  });

  if (!isItProfile) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-text-muted text-xs">
        <svg className="size-3 animate-spin text-text-muted" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Đang tải...</span>
      </div>
    );
  }

  const level = data?.stats?.currentLevel;
  
  // Calculate the active contest (module being worked on in this level)
  let activeContest = "";
  if (data && data.stats && data.roadmapModules) {
    const currentLevelStr = data.stats.currentLevel || "Cấp 0";
    const currentLevelCode = data.stats.currentLevelName.includes("Chưa phân cấp") 
      ? 0 
      : parseInt(currentLevelStr.replace(/\D/g, ""), 10) || 0;

    const currentLevelModules = data.roadmapModules.filter(
      (m) => m.levelCode === currentLevelCode
    );

    if (currentLevelModules.length > 0) {
      const activeModules = currentLevelModules.filter(
        (m) => m.status === "Đang thi" || m.solvedCount > 0
      );
      const targetModules = activeModules.length > 0 ? activeModules : currentLevelModules;
      
      // Seeded deterministic index select based on username
      const seed = (data.student?.username || "").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const selectedIndex = seed % targetModules.length;
      activeContest = targetModules[selectedIndex]?.moduleName || "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LevelBadge level={level} />
      {activeContest && (
        <Badge variant="outline" className="text-[11px] font-normal border-border-default max-w-[240px] truncate bg-bg-surface text-text-secondary">
          {activeContest}
        </Badge>
      )}
    </div>
  );
}
