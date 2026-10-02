# ADR 2026-09-11 — Quy ước hiệu năng & accessibility cho `apps/web`

- **Trạng thái:** Accepted
- **Bối cảnh:** Chạy `npx -y react-doctor@latest . --verbose` trên toàn repo (765 issue, score 54). Đợt tối ưu này xử lý 4 nhóm: Intl formatter, mechanical perf, bug quan trọng, accessibility.

## Quyết định

### 1. Formatter tập trung — `apps/web/lib/formatters.ts`

Không tạo `new Intl.NumberFormat(...)` / `new Intl.DateTimeFormat(...)` inline trong render nữa (126 warning `intl-*`). Mọi format tiền, số, ngày, giờ đi qua helper trong `lib/formatters.ts`; các `Intl.*Format` được khởi tạo một lần ở module scope và tái dùng.

```ts
// lib/formatters.ts
const currencyFormatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
export const formatCurrency = (value: number) => currencyFormatter.format(value);
```

**Quy tắc:** component mới cần format thì import từ `@/lib/formatters`, không tự dựng `Intl`.

### 2. `useSearchParams()` bắt buộc nằm trong `<Suspense>`

Next.js App Router: một component client gọi `useSearchParams()` mà không có `<Suspense>` bao ngoài sẽ **kéo cả route ra khỏi static render**. 24 trang vi phạm, nay còn 0.

Hai shape được dùng:

**Shape A — page tự gọi `useSearchParams`:** đổi tên default export thành `<Name>Content`, thêm default export mới chỉ để bọc.

```tsx
function AdminUsersPageContent() { const searchParams = useSearchParams(); /* … */ }

export default function AdminUsersPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}
```

**Shape B — component con gọi `useSearchParams`:** bọc đúng component đó, `fallback` dùng skeleton sẵn có của màn hình.

```tsx
<Suspense fallback={<LessonWorkspaceLoadingSkeleton />}>
  <AdminLessonPlansWorkspace />
</Suspense>
```

### 3. Reset state theo prop — làm trong render, không dùng `useEffect`

`useEffect` chạy **sau paint**, nên người dùng thấy một frame với dữ liệu của item trước. Theo React docs ("Adjusting some state when a prop changes"), so sánh prev-prop ngay trong render; React bỏ output và render lại trước khi paint.

```tsx
const [prevDetailId, setPrevDetailId] = useState(detailId);
if (prevDetailId !== detailId) {
  setPrevDetailId(detailId);
  setSelectedSourceKey(null);
}
```

Đã áp dụng: `SortableOrderList`, `tabs/SettingsTab`, `FinancialDetailModal`, `UserManageModal`. Pattern này đồng thời dọn luôn lỗi eslint `react-hooks/set-state-in-effect`.

### 4. Set/Map thay vì `Array.includes` trong vòng lặp

Chỉ đổi khi thật sự O(n×m) (lookup nằm trong `map`/`filter`/loop). Lookup đơn lẻ, mảng role cố định 2–3 phần tử, hoặc `String.includes` **giữ nguyên**.

```tsx
// Set: danh sách lớp có thể rất dài, tra cứu O(1) thay vì quét mảng mỗi option.
const selectedClassIdSet = useMemo(() => new Set(filters.classIds), [filters.classIds]);
```

Trường hợp đáng giá nhất: `Object.values(StaffRole).includes(role)` bên trong `filter` dựng lại mảng enum cho **từng** phần tử → hoist ra module scope (`STAFF_ROLE_VALUES` trong `apps/api/src/user/user.service.ts`).

### 5. `toSorted()` thay `[...arr].sort()` (apps/api)

`apps/api/tsconfig.json` đặt `"target": "ES2023"` nên `Array.prototype.toSorted` dùng được trực tiếp — ngắn hơn và không tạo mảng trung gian thừa. 8 vị trí đã đổi.

### 6. Accessibility

- Control native (`input`, `select`, `DateInput`, `TimeInput`): `<label htmlFor={id}>` + `id` sinh bằng `useId()` — **không** hard-code id (trùng khi component render nhiều lần).
- "Label" không bọc control thật (editor contenteditable, block hiển thị): đổi `<label>` → `<span>` / `<div>`, rồi truyền `ariaLabel` cho editor (`MathRichTextEditor`, `RichTextEditor`, `UpgradedSelect`).
- Nhóm nút radio-like: `<span id={…}>` + `<div role="group" aria-labelledby={…}>`.
- `<div>`/`<tr>` có `onClick`: thêm `role="button"` (hoặc `tabIndex` cho row) + `onKeyDown` xử lý `Enter`/`Space`.
- Thanh tua video (`YouTubeEmbed`): `role="slider"` + `aria-valuemin/max/now` + phím `ArrowLeft`/`ArrowRight` ±5s.
- Field chỉ có `placeholder`: bổ sung `aria-label`. **Không** tự thêm label hiển thị — đó là thay đổi thiết kế, cần quyết định của người dùng.

## Hệ quả

- Các trang dùng `useSearchParams` lấy lại khả năng static render.
- Bớt một frame nhấp nháy khi đổi item ở 4 component modal/list.
- Mọi field mới phải có `<label htmlFor>` hoặc `aria-label`; PR review nên bắt điểm này.

## Việc chưa làm (cố ý)

- 22 vị trí `no-adjust-state-on-prop-change` còn lại (`AddSessionPopup`, `SessionHistoryTable`, `SurveysManager`, `CustomerCareDetailPanels`, `ClassContentManager`, `TimeInput`, `LectureEditorPanel`) — effect ở đó gắn với logic khởi tạo form phức tạp, cần refactor riêng.
- Phần "label hiển thị" của `no-placeholder-only-field` — thay đổi UI, chờ quyết định.
- `query-mutation-missing-invalidation` (9 cảnh báo): đã rà từng cái, đều đã invalidate gián tiếp hoặc chủ đích không invalidate → false positive.
- Nâng `next` 16.1.6 → 16.2.6 (CVE-2026-23870): bị chặn bởi `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE` ở `node_modules` root.
- `axios@^1.13.6` bị Socket chấm 25/100 trục vulnerability → cần bump lên `^1.20.0` cùng đợt `pnpm install` root.
