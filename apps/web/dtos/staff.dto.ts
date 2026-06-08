
export type StaffStatus = "active" | "inactive";
export type StaffGender = "male" | "female";

export interface StaffListMeta {
    total: number;
    page: number;
    limit: number;
}

export interface StaffListResponse {
    data: StaffListItem[];
    meta: StaffListMeta;
}

export interface StaffListItem {
    id: string;
    /** Derived from linked User during rollout. Read nested user name fields as canonical when present. */
    fullName: string;
    status: StaffStatus;
    roles?: string[];
    personalAchievementLink?: string | null;
    user?: {
        province?: string | null;
        fullName?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        avatarUrl?: string | null;
    } | null;
    classTeachers?: Array<{
        operatingDeductionRatePercent?: number | string | null;
        class: { id: string; name: string };
    }>;
    monthlyStats?: Array<{ totalUnpaidAll?: number | null }>;
    unpaidAmountTotal?: number | null;
}

export interface CustomerCareStaffOption {
    id: string;
    fullName: string;
    status: StaffStatus;
    roles: string[];
}

export interface StaffOption {
    id: string;
    fullName: string;
    status: StaffStatus;
    roles: string[];
}

export interface StaffClassAllowanceItem {
    class_id: string;
    teacher_payment_status: string;
    total_allowance: number | string;
    name: string;
}

export interface AssistantStaffOption {
    id: string;
    fullName: string;
    status: StaffStatus;
    roles: string[];
}

export interface StaffDetail {
    id: string;
    /** Derived from linked User during rollout. Read nested user name fields as canonical when present. */
    fullName: string;
    cccdNumber: string | null;
    cccdIssuedDate?: string | null;
    cccdIssuedPlace?: string | null;
    ethnicity?: string | null;
    gender?: StaffGender | null;
    currentAddress?: string | null;
    birthDate?: string | null;
    university?: string | null;
    highSchool?: string | null;
    specialization?: string | null;
    bankAccount?: string | null;
    bankQrLink?: string | null;
    personalAchievementLink?: string | null;
    googleMeetLink?: string | null;
    roles: string[];
    status: StaffStatus;
    createdAt?: string;
    updatedAt?: string;
    user?: {
        id: string;
        email: string;
        province?: string | null;
        fullName?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        avatarUrl?: string | null;
    } | null;
    classTeachers?: Array<{
        operatingDeductionRatePercent?: number | string | null;
        class: { id: string; name: string };
    }>;
    monthlyStats?: Array<{ month: string; totalUnpaidAll?: number | null }>;
    classAllowance?: StaffClassAllowanceItem[];
    customerCareManagedByStaffId?: string | null;
    customerCareManagedBy?: { id: string; fullName: string } | null;
}

export interface StaffAssignableUser {
    id: string;
    email: string;
    accountHandle: string;
    province?: string | null;
    roleType: string;
    status: string;
    first_name?: string | null;
    last_name?: string | null;
    /** Derived from linked User during rollout. Prefer first_name/last_name when present. */
    fullName?: string | null;
    hasStaffProfile: boolean;
    staffId?: string | null;
    isEligible: boolean;
    ineligibleReason?: string | null;
}

export interface StaffIncomeAmountSummary {
    total: number;
    paid: number;
    unpaid: number;
}

/** GV theo lớp: số tiền gross trước CPVH và thuế. */
export interface StaffIncomeClassSummary extends StaffIncomeAmountSummary {
    classId: string;
    className: string;
    isCurrentTeacherAssignment: boolean;
}

export interface StaffIncomeRoleSummary extends StaffIncomeAmountSummary {
    role: string;
    label: string;
}

export interface StaffIncomeDepositSession {
    id: string;
    date: string;
    teacherPaymentStatus: string | null;
    teacherAllowanceTotal: number;
}

export interface StaffIncomeDepositClassSummary {
    classId: string;
    className: string;
    total: number;
    sessions: StaffIncomeDepositSession[];
}

export interface StaffIncomeSummary {
    recentUnpaidDays: number;
    /** Gross chưa nhận hiện tại: mọi khoản pending/unpaid, không giới hạn tháng/days, không gồm cọc. */
    snapshotUnpaidTotal: number;
    /** Net chưa nhận hiện tại: teacher trừ vận hành rồi thuế; role khác chỉ trừ thuế. */
    snapshotUnpaidNetTotal: number;
    /** Net đã thanh toán trong năm đang xem. */
    yearPaidNetTotal: number;
    /** Card "Tổng nhận": NET của tháng đang chọn = `monthlyIncomeTotals.total`. */
    incomeStatsTotalNet: number;
    /** Tổng NET đã nhận/chưa nhận hiện tại; giữ để tương thích contract cũ. */
    totalReceivedNet: number;
    monthlyIncomeTotals: StaffIncomeAmountSummary;
    monthlyGrossTotals: StaffIncomeAmountSummary;
    monthlyTaxTotals: StaffIncomeAmountSummary;
    monthlyOperatingDeductionTotals?: StaffIncomeAmountSummary;
    monthlyTotalDeductionTotals?: StaffIncomeAmountSummary;
    sessionMonthlyTotals: StaffIncomeAmountSummary;
    sessionMonthlyGrossTotals: StaffIncomeAmountSummary;
    sessionMonthlyTaxTotals: StaffIncomeAmountSummary;
    sessionMonthlyOperatingDeductionTotals?: StaffIncomeAmountSummary;
    sessionMonthlyTotalDeductionTotals?: StaffIncomeAmountSummary;
    sessionYearTotal: number;
    yearIncomeTotal: number;
    yearGrossIncomeTotal: number;
    yearTaxTotal: number;
    yearOperatingDeductionTotal?: number;
    yearTotalDeductionTotal?: number;
    depositYearTotal: number;
    depositYearByClass: StaffIncomeDepositClassSummary[];
    /** Card "Lớp phụ trách": `total` / `paid` / `unpaid` đều là gross allowance, chưa trừ CPVH/thuế. */
    classMonthlySummaries: StaffIncomeClassSummary[];
    /** Thưởng tháng đang xem: sau khấu trừ thuế (không KH VH); gross/tax xem `monthlyGrossTotals` / `monthlyTaxTotals`. */
    bonusMonthlyTotals: StaffIncomeAmountSummary;
    otherRoleSummaries: StaffIncomeRoleSummary[];
}

export interface StaffPaymentPreviewTotals {
    grossTotal: number;
    operatingTotal: number;
    taxTotal: number;
    netTotal: number;
    itemCount: number;
}

export interface StaffPaymentPreviewItem {
    id: string;
    label: string;
    secondaryLabel: string | null;
    classId?: string | null;
    date: string | null;
    currentStatus: string | null;
    taxRatePercent: number;
    grossAmount: number;
    operatingAmount: number;
    taxAmount: number;
    netAmount: number;
}

export interface StaffPaymentPreviewSource extends StaffPaymentPreviewTotals {
    sourceType: string;
    sourceLabel: string;
    items: StaffPaymentPreviewItem[];
}

export interface StaffPaymentPreviewSection extends StaffPaymentPreviewTotals {
    role: string | null;
    label: string;
    sources: StaffPaymentPreviewSource[];
}

export interface StaffPaymentPreview {
    staffId: string;
    month: string;
    taxAsOfDate: string;
    summary: StaffPaymentPreviewTotals;
    sections: StaffPaymentPreviewSection[];
}

export interface StaffPayAllPaymentsPayload {
    month: string;
    year: string;
}

export type StaffPaymentSourceType =
    | "teacher_session"
    | "customer_care"
    | "assistant_share"
    | "lesson_output"
    | "extra_allowance"
    | "bonus";

export interface StaffPaySelectedPaymentItem {
    sourceType: StaffPaymentSourceType;
    id: string;
}

export interface StaffPaySelectedPaymentsPayload extends StaffPayAllPaymentsPayload {
    items: StaffPaySelectedPaymentItem[];
}

export interface StaffPayAllPaymentsSourceResult {
    sourceType: string;
    sourceLabel: string;
    updatedCount: number;
}

export interface StaffPayAllPaymentsResult {
    staffId: string;
    month: string;
    requestedItemCount: number;
    updatedCount: number;
    updatedBySource: StaffPayAllPaymentsSourceResult[];
}

export interface StaffDepositPaymentPreviewTotals {
    preTaxTotal: number;
    taxTotal: number;
    netTotal: number;
    itemCount: number;
}

export interface StaffDepositPaymentPreviewSession {
    id: string;
    date: string;
    currentStatus: string | null;
    preTaxAmount: number;
    taxRatePercent: number;
    taxAmount: number;
    netAmount: number;
}

export interface StaffDepositPaymentPreviewClass extends StaffDepositPaymentPreviewTotals {
    classId: string;
    className: string;
    sessions: StaffDepositPaymentPreviewSession[];
}

export interface StaffDepositPaymentPreview {
    staffId: string;
    year: string;
    taxAsOfDate: string;
    summary: StaffDepositPaymentPreviewTotals;
    classes: StaffDepositPaymentPreviewClass[];
}

export interface StaffPayDepositSessionsPayload {
    sessionIds: string[];
}

export interface StaffPayDepositSessionsResult {
    staffId: string;
    taxAsOfDate: string;
    teacherTaxRatePercent: number;
    requestedItemCount: number;
    updatedCount: number;
    updatedSessionIds: string[];
}

export interface CreateStaffPayload {
    full_name: string;
    cccd_number: string;
    ethnicity?: string;
    gender?: StaffGender;
    current_address?: string;
    cccd_issued_date?: string;
    cccd_issued_place?: string;
    birth_date?: string;
    university?: string;
    high_school?: string;
    specialization?: string;
    bank_account?: string;
    bank_qr_link?: string;
    personal_achievement_link?: string | null;
    roles: string[];
    user_id: string;
    customer_care_managed_by_staff_id?: string | null;
}

export interface StaffInfoDto {
    id: string;
    fullname: string;
    birthdate: Date;
    university: string;
    high_school: string;
    specialization: string;
    bank_account: string;
    bank_qr_link: string;
    status: StaffStatus;
}
