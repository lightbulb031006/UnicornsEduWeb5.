"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  openModuleCardsStorageKey,
  parseOpenModuleCards,
  toggleOpenModuleCard,
} from "@/lib/student-module-cards";

/** Chỉ đọc 1 lần lúc hydrate; tab khác đổi không cần đồng bộ. */
function subscribeNoop() {
  return () => {};
}

/**
 * Thẻ chuyên đề đang mở trên trang lớp học sinh, nhớ trong localStorage theo lớp.
 * Storage bị chặn / hỏng → coi như chưa mở thẻ nào, vẫn mở/đóng được trong phiên.
 */
export function useOpenModuleCards(classId: string) {
  const storageKey = openModuleCardsStorageKey(classId);
  // Snapshot là chuỗi thô (so sánh được bằng ===), parse ở useMemo.
  const storedRaw = useSyncExternalStore(
    subscribeNoop,
    () => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [override, setOverride] = useState<{
    classId: string;
    keys: string[];
  } | null>(null);
  const stored = useMemo(() => parseOpenModuleCards(storedRaw), [storedRaw]);
  const openList =
    override && override.classId === classId ? override.keys : stored;
  const openKeys = useMemo(() => new Set(openList), [openList]);

  const write = useCallback(
    (keys: string[]) => {
      setOverride({ classId, keys });
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(keys));
      } catch {
        // Bỏ qua: chỉ là preference hiển thị.
      }
    },
    [classId, storageKey],
  );

  const toggle = useCallback(
    (key: string) => write(toggleOpenModuleCard(openList, key)),
    [openList, write],
  );

  const open = useCallback(
    (key: string) => {
      if (!openList.includes(key)) write([...openList, key]);
    },
    [openList, write],
  );

  return { openKeys, toggle, open };
}
