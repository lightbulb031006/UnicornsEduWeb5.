# Archived UI Context (UniEdu-Web 3.9)

Reference from `archived/UniEdu-Web-3.9/frontend/` for rebuilding pages in Unicorns Edu 5.0 (`apps/web`). Use this with the per-route plan files (admin.md, student.md, mentor.md, assistant.md, landing.md, auth.md) for better model results.

## Route and role mapping (archived → 5.0)

| Archived route(s) | 5.0 route | Roles (archived) | Notes |
|-------------------|------------|------------------|--------|
| `/`, `/home` | `/landing-page` or `/` | Public | Landing + optional login/register modal |
| `/login` | Auth (e.g. `/login`) | All | Home with `initialAuthMode="login"` → AuthModal |
| `/register` | Auth (register flow) | Public | Dedicated Register page |
| `/dashboard` | `/admin` (dashboard) | admin, student (teacher excluded) | Quick-view tabs: finance, operations, students; period filter; charts |
| `/students`, `/students/:id` | `/admin` (CRUD), `/student` (own profile) | admin → list/detail; student → own | Students list + StudentDetail; student sees own only in 5.0 |
| `/classes`, `/classes/:id` | `/admin` (CRUD, sessions, attendance) | admin (+ staff roles) | Classes list + ClassDetail (sessions, attendance, surveys, financials) |
| `/teachers` | `/admin` (personnel) | admin | Teachers list |
| `/staff`, `/staff/:id`, `/staff/:id/cskh` | `/admin` (nhân sự), mentor profile | admin, teacher (own staff card) | Staff list + StaffDetail + StaffCSKHDetail |
| `/costs` | `/admin` (chi phí) | admin | Costs CRUD |
| `/categories` | `/admin` (Khoá học) | admin | Categories CRUD |
| `/lesson-plans` | `/mentor` (giáo án) | admin, teacher (staff role: lesson_plan) | Lesson plans |
| `/action-history` | `/admin` (lịch sử) | admin only | Action history |
| `/coding` | Shared / optional | admin, teacher, student | Coding feature |
| `/payments` | `/assistant` (thu phí), `/student` (read-only) | admin/assistant → CRUD; student → read | Payments list, filters, stats, CRUD modal |
| `/schedule` | `/admin` or `/mentor` / `/student` | All (role-scoped) | Weekly calendar; sessions by class/teacher |

## Layout and navigation (archived)

- **Admin:** Full sidebar (`Layout` + `Sidebar`), no top bar. Sidebar: Dashboard, Trang chủ (Home), Nhân sự, Lớp học, Lập trình, Học sinh, Chi phí, Khoá học, Giáo Án, Lịch sử. Collapsible; profile + logout in sidebar.
- **Teacher:** Top nav only (no sidebar). Tabs: Trang chủ, Lớp học, Giáo Án, Lập trình, etc. Theme switcher (light/dark/sakura), user card, logout. Teacher has “Trang chủ” instead of Dashboard.
- **Student:** Same top-nav pattern as teacher; Dashboard visible (admin/student get Dashboard, teacher excluded).
- **Storage keys:** `unicorns.token`, `unicorns.currentUser`; optional `refreshToken`; dashboard state: `unicorns.dashboard.state`.
- **Theme:** `useTheme()` with THEME_DEFAULT, THEME_DARK, THEME_SAKURA; persisted.

## Auth flow (archived)

- **Login:** `/login` renders `<Home initialAuthMode="login" />` → AuthModal (email + password, rememberMe). On success: role-based redirect (admin → dashboard, teacher → home/classes, etc.).
- **Register:** `/register` – standalone page; form: fullName, email, phone, password, role (student/teacher), classId/specialization. Uses `authService.register()`; then setAuth + redirect by role.
- **Guards:** ProtectedRoute wraps all authenticated routes; redirects to `/login` if not authenticated.
- **Session:** Token + user in localStorage or sessionStorage (rememberMe); sessionExpiresAt; initFromStorage on app load.

## Key archived pages (file paths and purpose)

Paths below are relative to `archived/UniEdu-Web-3.9/frontend/src/`.

| Page | Path | Main features / data |
|------|------|----------------------|
| Home (landing) | `pages/Home.tsx` | Sections: intro, news (Khóa học), docs (Cuộc thi), policy (Liên hệ). HOME_MENU, HOME_TEAMS, HOME_FEATURES, HOME_WORKFLOW_STEPS. AuthModal; fetchHomePostByCategory, upsertHomePost. |
| Register | `pages/Register.tsx` | fullName, email, phone, password, role, classId/specialization; authService.register; redirect by role. |
| Dashboard | `pages/Dashboard.tsx` | filterType: month/quarter/year; quickView: finance/operations/students; DualLineChart; fetchDashboardData, fetchQuickViewData, fetchTeachers; redirect by role (teacher → /home). |
| Students | `pages/Students.tsx` | List + filters (search, status, classId, province); CRUD modal; fetchStudents, createStudent, updateStudent, deleteStudent; fetchClasses, fetchTeachers (CSKH). |
| StudentDetail | `pages/StudentDetail.tsx` | Profile, class enrollments, financials (getStudentClassFinancialData), extend/refund/remove session, wallet (topUp, loan, transactions), edit login info; admin vs teacher vs student permission (canManageStudentRecord, canTopUp, accountIconMode). |
| Classes | `pages/Classes.tsx` | List of classes (from services/classesService). |
| ClassDetail | `pages/ClassDetail.tsx` | Class info, teachers, students (with remaining sessions), sessions (month picker, create/edit/delete), attendance (saveAttendanceForSession, fetchAttendanceBySession), surveys tab, header tuition fee, bulk session status; useAttendance, useSessionFinancials; actionHistoryService. |
| Teachers | `pages/Teachers.tsx` | Teachers list (teachersService). |
| Staff | `pages/Staff.tsx` | Staff list. |
| StaffDetail | `pages/StaffDetail.tsx` | Staff profile, KPIs, login info edit. |
| StaffCSKHDetail | `pages/StaffCSKHDetail.tsx` | CSKH-specific view for staff. |
| Costs | `pages/Costs.tsx` | Costs CRUD (costsService). |
| Categories | `pages/Categories.tsx` | Categories CRUD (categoriesService). |
| LessonPlans | `pages/LessonPlans.tsx` | Lesson plans (lessonPlansService). |
| ActionHistory | `pages/ActionHistory.tsx` | Action history (actionHistoryService). |
| Coding | `pages/Coding.tsx` | Coding feature. |
| Payments | `pages/Payments.tsx` | Filters: status, classId, studentId; stats (fetchPaymentsStatistics); list + CRUD modal (studentId, classId, amount, date, status, note); CurrencyInput. |
| Schedule | `pages/Schedule.tsx` | Week navigation; fetchClasses, fetchTeachers, fetchSessions(startDate, endDate, classId, teacherId); grid by day. |

## Services (archived)

- `authService`: login, register, logout, me, refresh.
- `dashboardService`: fetchDashboardData, fetchQuickViewData (DashboardParams: filterType, filterValue, etc.).
- `studentsService`: fetchStudents, createStudent, updateStudent, deleteStudent, fetchStudentById, getStudentClassFinancialData, extendStudentSessions, refundStudentSessions, removeStudentClass, updateStudentClassFee.
- `classesService`: fetchClasses, fetchClassById, fetchClassDetailData, fetchClassStudentsWithRemaining, updateClass, addStudentToClass, removeStudentFromClass, moveStudentToClass.
- `sessionsService`: fetchSessions, createSession, updateSession, deleteSession (params: classId, date, startTime, endTime, etc.).
- `attendanceService`: saveAttendanceForSession, fetchAttendanceBySession (AttendanceStatus: present | excused | absent).
- `teachersService`: fetchTeachers.
- `staffService`, `paymentsService` (fetchPayments, createPayment, updatePayment, deletePayment, fetchPaymentsStatistics), `costsService`, `categoriesService`, `lessonPlansService`, `actionHistoryService`, `walletService`, `homeService` (fetchHomePostByCategory, upsertHomePost), etc.

## UI patterns (archived)

- **Modals:** Shared `Modal` component; form state local to page; submit → service call → toast → close → refetch.
- **Tables/lists:** Header row; data rows with hover; optional row actions (edit, delete); filters above (search, status, class, etc.).
- **Cards:** Section cards with title, optional actions; consistent padding and borders (e.g. `var(--border-default)`).
- **Loading:** `useDataLoading` hook with cacheKey, staleTime; SkeletonLoader in Suspense fallback.
- **Toasts:** `toast` util for success/error.
- **Forms:** Controlled inputs; CurrencyInput for money; date inputs ISO date string; status as select or badges.
- **Permissions:** `hasRole`, `userHasStaffRole`, `getUserStaffRoles` (permissions.ts); menu items filtered by roles and requireStaffRole (e.g. accountant, lesson_plan).

## Component references (archived)

- `components/Layout.tsx`: Admin sidebar vs non-admin top nav; theme switcher; user card; logout.
- `components/Sidebar.tsx`: Menu items, active state, collapse.
- `components/ProtectedRoute.tsx`: Redirect to `/login` if !isAuthenticated.
- `components/AuthModal.tsx`: Login/register tabs; email, password, rememberMe; login lock after failed attempts.
- `components/Modal.tsx`: Generic modal.
- `components/CurrencyInput.tsx`: Money input.
- `components/AttendanceIcon.tsx`: Present/excused/absent.
- `components/DualLineChart.tsx`, `components/DashboardAlert.tsx`: Dashboard.
- `hooks/useDataLoading.ts`: Fetch with cache; isLoading, error, refetch.
- `hooks/useAttendance.ts`, `hooks/useSessionFinancials.ts`: ClassDetail.
- `store/authStore.ts`: user, token, setAuth, logout, initFromStorage.

## How to use this with 5.0 page plans

- For **admin.md**: Use Dashboard, Students, StudentDetail, Classes, ClassDetail, Staff, Teachers, Costs, Categories, ActionHistory, Schedule; Layout/Sidebar.
- For **mentor.md**: Use Home (teacher), Classes (assigned), ClassDetail (sessions, attendance, lesson notes), LessonPlans, Schedule; top nav; payroll/bonus read-only from services if present.
- For **student.md**: Use Dashboard (student), Schedule (own), StudentDetail (own profile only), Payments read-only; top nav; documents if in archived.
- For **assistant.md**: Use Payments (full CRUD, filters, stats), task list if present in archived; guard for assistant-only.
- For **landing.md**: Use Home (sections, HOME_MENU, teams, features, workflow); AuthModal optional; theme support.
- For **auth.md**: Use AuthModal (login), Register page, authStore, ProtectedRoute, role-based redirect.

When implementing a 5.0 page, open the corresponding archived file(s) above and the relevant plan (e.g. student.md) together so the model can align features, tokens, and API with the existing UI patterns and data shapes.
