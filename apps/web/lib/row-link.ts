/**
 * Phần tử con có hành động riêng: click / Enter trên chúng không mở chi tiết
 * của card hoặc dòng bao ngoài. Thêm `data-row-link-ignore` cho vùng tự viết.
 */
const NESTED_INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[role='switch']",
  "[role='tab']",
  "[contenteditable='true']",
  "[data-row-link-ignore]",
].join(",");

/**
 * `true` khi sự kiện xuất phát từ phần tử tương tác nằm **bên trong** card
 * (không tính chính card). Sự kiện từ portal (dialog mở từ card) có `target`
 * nằm ngoài DOM của card nên cũng bị bỏ qua.
 */
export function isFromNestedInteractive(
  target: EventTarget | null,
  container: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return false;
  if (!container.contains(target)) return true;
  const hit = target.closest(NESTED_INTERACTIVE_SELECTOR);
  return hit !== null && hit !== container && container.contains(hit);
}

/** Người dùng đang bôi đen chữ trong card thì không điều hướng. */
export function hasTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  return (window.getSelection()?.toString().length ?? 0) > 0;
}

/** Class Tailwind chung cho card / dòng bấm được (`useRowLink`). */
export const ROW_LINK_INTERACTION_CLASS =
  "cursor-pointer transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus";
