import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;

/**
 * `false` lúc SSR và lúc hydrate, `true` sau đó. Dùng khi nhánh render phụ thuộc
 * cache TanStack Query: Suspense boundary có thể hydrate muộn, lúc cache phía
 * client đã có dữ liệu mà HTML server vẫn là skeleton → lệch hydration.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
