# Assistant – `/assistant`

> **Lỗi thời (#267):** trang này là kế hoạch cũ, route `/assistant` không tồn tại. Role này nay là **Trưởng phòng Sale & CSKH** (`sale_customer_care_head`, #268); quyền hiện hành xem `docs/adr/2026-11-12-admin-deny-by-default.md` và `docs/pages/staff.md`.

## Route and role

- **Path:** `/assistant`
- **Role:** `assistant` only (guard must block admin/mentor/student for assistant-only data).
- **Workplan owner:** Minh (Frontend – UX + Assistant/Student).

## Features

- **Thu học phí:** Record payments; flow from UI to `payments` API; update status.
- **Cập nhật trạng thái:** `paid`, `unpaid`, `deposit` with clear feedback and validation.
- **Task list:** View and update `assistant_tasks`; link to lesson/context where applicable.
- **UX:** Fast, low-friction flows; clear success/error feedback; avoid input errors (confirmation where needed).
- **Permission:** Assistant cannot access admin or mentor-only data (enforced by guard and API).

## UI-Schema tokens and components

- **Navbar / Sidebar:** Same as admin: `bg-surface` / `bg-secondary`, `text-primary` / `text-secondary`, `border-default`; hover and active per component mapping.
- **Cards and tables:** `bg-surface`, `text-primary`, `border-default`; row hover `bg-secondary`.
- **Primary actions (e.g. confirm payment):** `primary` + `text-inverse`; hover `primary-hover`.
- **Status badges:** Paid = success tint; Unpaid = error/danger tint; Deposit = warning tint; always with icon/label.
- **Alerts (errors, success):** Status tint background; stable, no motion-only feedback.
- **Inputs (amounts, student/class picker):** `bg-surface`, `border-default`, focus `border-focus`.

## Data and API

- **Backend domain:** `payments`, `wallet_transactions`, `assistant_tasks`, `assistant_payments` (Workplan route-to-domain map).
- **Mock (Tuần 4–6):** Scenarios for slow response, update failure, balance mismatch; contract tests for mutation payload.
- **De-mock (Tuần 7):** All finance mutations use real API only; no runtime mock for payment flows.
- **API (real):** Finance and assistant endpoints; multi-table mutations in transaction boundary per Workplan.

## DoD and week

- **Tuần 4:** Payment flow end-to-end UI → API → DB; revenue reflects correctly; assistant guard enforced; transaction boundary for finance mutations; frontend complete with mock scenarios and contract tests for mutation payload.

## Accessibility

- Amounts and critical labels have sufficient contrast; errors use icon + text.
- Focus order and visible focus on actions and forms.

## Archived context (for implementation)

See [ARCHIVED-UI-CONTEXT.md](ARCHIVED-UI-CONTEXT.md) for full mapping.

- **Thu học phí / payments:** `archived/.../pages/Payments.tsx` — filters (status, classId, studentId), fetchPayments, fetchPaymentsStatistics; create/update payment modal: studentId, classId, amount (CurrencyInput), date, status, note; paymentsService (createPayment, updatePayment, deletePayment). In 5.0 restrict to assistant role and ensure transaction boundary for finance mutations.
- **Status flow:** paid/pending (and deposit if in domain); badges and validation; clear success/error feedback (toast).
- **Task list:** If assistant_tasks exist in backend, add view/update UI; pattern similar to list + row actions.
- **Layout:** Assistant uses same top-nav pattern as other non-admin roles; guard blocks admin/mentor-only routes.
