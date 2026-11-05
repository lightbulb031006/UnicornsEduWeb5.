# PRD: Mobile Responsive Parity For All Role Surfaces

Labels: ready-for-agent

## Problem Statement

Users on phones and small tablets cannot reliably use every UniEdu workspace surface. Some pages already have mobile cards and drawers, but important role surfaces still depend on desktop tables, early breakpoints, cramped dialogs, small touch targets, or placeholder pages. Admin, staff, student, auth, and public experiences need one consistent mobile-responsive contract.

## Solution

Create a mobile-first responsive pass across all role surfaces. Build shared responsive primitives first, then retrofit the highest-risk admin, staff, student, public, and auth pages. Fill missing surfaces only where the current product data already supports a useful v1; otherwise document the backend/API requirement as a separate product gap.

## User Stories

1. As an admin, I want dashboards and lists to fit a phone, so that I can manage operations away from desktop.
2. As an admin, I want calendar events in a mobile agenda, so that I do not pan a wide calendar grid.
3. As an admin, I want dense tables to become cards on mobile, so that row data remains readable.
4. As an admin, I want filters and forms to scroll safely with the keyboard, so that I can complete actions on small screens.
5. As an admin, I want `/admin/categories` to have a real mobile-ready plan, so that it is no longer treated as covered while still placeholder-only.
6. As a staff user, I want staff pages inherited from admin to keep the same mobile behavior, so that role parity is predictable.
7. As a staff user, I want `/staff/notes-subject` to avoid table-only mobile layout, so that regulations and content can be reviewed on phone.
8. As a staff user, I want action footers to stack on narrow screens, so that buttons are not cramped.
9. As a student, I want a mobile-first class/session schedule, so that I can check upcoming learning time from my phone.
10. As a student, I want class cards to wrap long names cleanly, so that course data does not overflow.
11. As any protected user, I want sidebar controls and notification buttons to meet touch target size, so that navigation is comfortable.
12. As a public visitor, I want the landing navbar to collapse cleanly, so that auth actions do not overflow.
13. As an auth user, I want login/register/reset pages to be keyboard-safe, so that forms remain usable on phones.
14. As a reviewer, I want route docs updated with responsive behavior, so that future changes do not drift.
15. As an implementer, I want shared responsive primitives, so that fixes are applied once instead of page by page.

## Implementation Decisions

- Treat this as product UI, not marketing design. Prioritize predictable navigation, readable data, touch ergonomics, and role parity.
- Build deep reusable modules for responsive dialog/sheet behavior, action footers, protected shell contract, and mobile-first auth shell spacing.
- Dense data surfaces use mobile cards first, compact tablet layout second, full desktop table last.
- Shared table cells allow wrapping by default; nowrap becomes opt-in for known short values.
- Calendar uses agenda/day list on phones and keeps the full grid for larger screens.
- Admin shell gets parity with staff/student shell behavior: `min-w-0`, skip link, safe mobile padding, and 44px controls.
- Staff routes that re-export admin pages are fixed at the admin source surface, then verified through staff URLs.
- `/admin/categories` v1 should not invent a backend taxonomy. Current code only has free-text cost category fields, so full category CRUD requires a separate backend schema/API decision.
- Student schedule v1 should use existing class/session/calendar data patterns; avoid frontend-owned business derivations.
- Update route docs and role matrix when responsive behavior or visible role surfaces change.

## Testing Decisions

- Test external behavior: no viewport overflow, no clipped actions, forms usable with keyboard, long text readable, mobile and desktop both preserve workflows.
- Add focused tests for pure/deep modules where practical: data-surface rendering rules, action-footer layout decisions, schedule/category transformation helpers.
- Run web lint and TypeScript checks after implementation.
- Browser QA widths: `320`, `390`, `768`, `1024`, `1440`.
- QA scenarios: protected sidebar, notifications, auth forms, calendar agenda/grid, filters, dialogs, dense lists, long Vietnamese labels, empty/loading/error states.

## Out of Scope

- Full backend category taxonomy CRUD unless explicitly approved.
- New payment/document student self-service beyond documenting or preserving current gaps.
- Visual redesign unrelated to mobile usability.
- Changing role authorization rules except where docs need responsive surface parity notes.

## Further Notes

- `PRODUCT.md` and `DESIGN.md` for `impeccable` are missing; this PRD follows existing docs, UI schema, and product-register guidance.
- The original audit was source-inspection only. Runtime visual QA belongs in implementation verification.
