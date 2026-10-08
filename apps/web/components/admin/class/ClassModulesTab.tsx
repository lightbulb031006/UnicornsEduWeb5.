"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import { classKeys } from "@/lib/query-keys";
import type { TheoryProgressTarget } from "@/dtos/class-content.dto";
import ClassContentManager from "@/components/admin/ClassContentManager";
import ClassModulesDialog from "@/components/admin/ClassModulesDialog";
import ClassModuleGroups from "@/components/admin/class/ClassModuleGroups";
import TheoryProgressDialog from "@/components/admin/class/TheoryProgressDialog";

const TOOLBAR_BUTTON_CLASS =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-secondary";

/**
 * Tab **Chuyên đề** trang lớp admin/staff: thêm/gỡ chuyên đề, giao tiết thực hành,
 * nhóm nội dung theo thứ tự của lớp (kéo-thả khi `canManageContent`).
 */
export default function ClassModulesTab({
  classId,
  canManageContent,
  practiceActionsBasePath,
}: {
  classId: string;
  /** Thêm/gỡ chuyên đề, giao tiết thực hành, sắp thứ tự, xem tiến độ lý thuyết. */
  canManageContent: boolean;
  /** Có thì hiện nút Thống kê / Chấm bài cho tiết thực hành. */
  practiceActionsBasePath?: string | null;
}) {
  const queryClient = useQueryClient();
  const [practiceAddOpen, setPracticeAddOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [openContent, setOpenContent] = useState<{
    id: string;
    token: number;
  } | null>(null);
  const [theoryProgressItem, setTheoryProgressItem] =
    useState<TheoryProgressTarget | null>(null);

  return (
    <div className="space-y-3">
      {canManageContent ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModulesOpen(true)}
            className={TOOLBAR_BUTTON_CLASS}
          >
            <Layers className="size-3.5" />
            Chuyên đề
          </button>
          <button
            type="button"
            onClick={() => setPracticeAddOpen(true)}
            className={TOOLBAR_BUTTON_CLASS}
          >
            <Plus className="size-3.5" />
            Tiết thực hành
          </button>
        </div>
      ) : null}

      <ClassModuleGroups
        classId={classId}
        canReorder={canManageContent}
        practiceActionsBasePath={practiceActionsBasePath}
        onOpenItem={(id) => setOpenContent({ id, token: Date.now() })}
        onOpenTheoryProgress={
          canManageContent ? setTheoryProgressItem : undefined
        }
      />

      <ClassContentManager
        classId={classId}
        canManage={canManageContent}
        addOnly
        addOpen={practiceAddOpen}
        onAddOpenChange={setPracticeAddOpen}
        autoOpenContentItemId={openContent?.id ?? null}
        autoOpenToken={openContent?.token ?? 0}
        onChanged={() => {
          void queryClient.invalidateQueries({
            queryKey: classKeys.contentGroups(classId),
          });
        }}
      />

      {modulesOpen ? (
        <ClassModulesDialog
          classId={classId}
          onClose={() => setModulesOpen(false)}
        />
      ) : null}

      {theoryProgressItem ? (
        <TheoryProgressDialog
          classId={classId}
          item={theoryProgressItem}
          onClose={() => setTheoryProgressItem(null)}
        />
      ) : null}
    </div>
  );
}
